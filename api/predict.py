"""
Stock prediction API - Simple Linear Regression (lag-1 harian + EMA).

Identik dengan model notebook `scripts/model_prediksi_stok_linear_regression.ipynb`:
  transaksi → level stok harian (build_daily_series, semua type in/out/adjustment)
  → konsumsi harian antar hari transaksi (build_consumption_series)
  → EMA smoothing (alpha 0.05)
  → regresi lag-1: Y = a + b·X (X = konsumsi EMA kemarin, Y = konsumsi EMA hari ini)
  → forecast iteratif stok dengan predict_next_consumption

Evaluasi in-sample pada deret penuh menghasilkan R² pada selang 0..1 —
bandingkan dengan PowerPoint/notebook.
"""

from http.server import BaseHTTPRequestHandler
import json
import math
import os
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone


MS_PER_DAY = 86400000
CONSUMPTION_EMA_ALPHA = 0.05
EMA_ALPHA_GRID = [0.05, 0.1, 0.15, 0.2, 0.3, 0.5]
TUNE_MIN_POINTS = 10
CONSUMPTION_SLOPE_MAX = 0.95
MAX_BODY_BYTES = 1_500_000
MAX_SINGLE_TRANSACTIONS = 10_000
MAX_BATCH_TRANSACTIONS = 20_000
MAX_BATCH_ITEMS = 500


def allowed_origins():
    origins = {
        origin.strip()
        for origin in os.environ.get("ALLOWED_ORIGINS", "").split(",")
        if origin.strip()
    }
    for env_name in ("VERCEL_URL", "VERCEL_PROJECT_PRODUCTION_URL"):
        hostname = os.environ.get(env_name)
        if hostname:
            origins.add(f"https://{hostname}")
    if os.environ.get("VERCEL_ENV") != "production":
        origins.update({"http://localhost:3000", "http://127.0.0.1:3000"})
    return origins


def verify_firebase_token(authorization):
    if not authorization or not authorization.startswith("Bearer "):
        return None

    api_key = os.environ.get("NEXT_PUBLIC_FIREBASE_API_KEY", "")
    if not api_key:
        return None

    token = authorization[7:].strip()
    request = urllib.request.Request(
        f"https://identitytoolkit.googleapis.com/v1/accounts:lookup?key={api_key}",
        data=json.dumps({"idToken": token}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=8) as response:
            payload = json.loads(response.read())
    except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, ValueError):
        return None

    users = payload.get("users") or []
    if not users:
        return None

    user = users[0]
    try:
        claims = json.loads(user.get("customAttributes") or "{}")
    except ValueError:
        claims = {}

    if claims.get("disabled") is True or user.get("disabled") is True:
        return None
    if claims.get("role") not in ("admin", "operator", "viewer"):
        return None

    uid = user.get("localId")
    database_url = os.environ.get("NEXT_PUBLIC_FIREBASE_DATABASE_URL", "").rstrip("/")
    if not uid or not database_url:
        return None
    profile_request = urllib.request.Request(
        f"{database_url}/users/{urllib.parse.quote(uid, safe='')}/disabled.json"
        f"?auth={urllib.parse.quote(token, safe='')}",
        method="GET",
    )
    try:
        with urllib.request.urlopen(profile_request, timeout=8) as response:
            if json.loads(response.read()) is True:
                return None
    except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, ValueError):
        return None

    return {
        "uid": uid,
        "email": user.get("email"),
        "role": claims.get("role"),
    }


def bounded_int(value, default, minimum, maximum, field):
    try:
        parsed = int(value if value is not None else default)
    except (TypeError, ValueError, OverflowError):
        raise ValueError(f"{field} tidak valid")
    if parsed < minimum or parsed > maximum:
        raise ValueError(f"{field} harus antara {minimum} dan {maximum}")
    return parsed


def bounded_float(value, default, minimum, maximum, field):
    try:
        parsed = float(value if value is not None else default)
    except (TypeError, ValueError, OverflowError):
        raise ValueError(f"{field} tidak valid")
    if not math.isfinite(parsed) or parsed < minimum or parsed > maximum:
        raise ValueError(f"{field} harus antara {minimum} dan {maximum}")
    return parsed


def safe_int(value, default=0):
    try:
        return int(value if value is not None else default)
    except (TypeError, ValueError, OverflowError):
        return default


def safe_non_negative_int(value, default=0):
    return max(0, safe_int(value, default))


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            actor = verify_firebase_token(self.headers.get("Authorization"))
            if not actor:
                self._send_json(401, {"error": "Token Firebase tidak valid atau kedaluwarsa"})
                return

            content_length = int(self.headers.get('Content-Length', 0))
            if content_length <= 0 or content_length > MAX_BODY_BYTES:
                self._send_json(413, {"error": "Ukuran request melebihi batas"})
                return

            body = self.rfile.read(content_length)
            data = json.loads(body)
            if not isinstance(data, dict):
                self._send_json(400, {"error": "Payload harus berupa object JSON"})
                return

            if data.get('mode') == 'batch':
                self._handle_batch(data)
                return

            transactions = data.get('transactions', [])
            if not isinstance(transactions, list) or len(transactions) > MAX_SINGLE_TRANSACTIONS:
                self._send_json(400, {'error': f'Maksimal {MAX_SINGLE_TRANSACTIONS} transaksi'})
                return
            current_quantity = safe_non_negative_int(data.get('currentQuantity'), 0)
            horizon_days = bounded_int(data.get('horizonDays'), 14, 1, 90, "horizonDays")
            train_ratio = bounded_float(data.get('trainRatio'), 0.85, 0.5, 0.95, "trainRatio")

            series = build_daily_series(transactions, current_quantity)
            if len(series) < 2:
                self._send_json(400, {'error': 'Minimal 2 titik diperlukan', 'source': 'lr-consumption-py'})
                return

            result = predict_stock(series, horizon_days, train_ratio)
            self._send_json(200, result)

        except json.JSONDecodeError:
            self._send_json(400, {'error': 'JSON tidak valid', 'source': 'lr-consumption-py'})
        except ValueError as e:
            self._send_json(400, {'error': str(e), 'source': 'lr-consumption-py'})
        except Exception as e:
            print(f"[predict] internal error: {e}")
            self._send_json(500, {'error': 'Terjadi kesalahan internal', 'source': 'lr-consumption-py'})

    def _handle_batch(self, data):
        items = data.get('items', [])
        transactions = data.get('transactions', [])
        horizon_days = bounded_int(data.get('horizonDays'), 14, 1, 90, "horizonDays")
        train_ratio = bounded_float(data.get('trainRatio'), 0.85, 0.5, 0.95, "trainRatio")
        top_n = bounded_int(data.get('topN'), 3, 1, MAX_BATCH_ITEMS, "topN")
        recent_days = bounded_int(data.get('recentDays'), 90, 1, 3650, "recentDays")

        if not isinstance(items, list) or not items:
            self._send_json(400, {'error': 'No items provided', 'source': 'lr-consumption-batch'})
            return
        if len(items) > MAX_BATCH_ITEMS:
            self._send_json(400, {'error': f'Maksimal {MAX_BATCH_ITEMS} item', 'source': 'lr-consumption-batch'})
            return
        if not isinstance(transactions, list) or len(transactions) > MAX_BATCH_TRANSACTIONS:
            self._send_json(400, {'error': f'Maksimal {MAX_BATCH_TRANSACTIONS} transaksi', 'source': 'lr-consumption-batch'})
            return

        cutoff = (datetime.now(timezone.utc).timestamp() * 1000) - recent_days * MS_PER_DAY
        recent_tx = [
            t for t in transactions
            if isinstance(t, dict) and safe_int(t.get('timestamp'), -1) >= cutoff
        ]

        tx_by_barcode = {}
        for tx in recent_tx:
            if not isinstance(tx, dict):
                continue
            barcode = tx.get('productBarcode')
            if barcode:
                tx_by_barcode.setdefault(barcode, []).append(tx)

        risks = []
        for item in items:
            try:
                if not isinstance(item, dict) or item.get('deleted') or not item.get('barcode'):
                    continue
                item_tx = tx_by_barcode.get(item['barcode'], [])
                current_qty = safe_non_negative_int(item.get('quantity', 0))
                series = build_daily_series(item_tx, current_qty)
                if len(series) < 2:
                    continue

                result = predict_stock(series, horizon_days, train_ratio)
                if 'error' in result:
                    continue

                forecast = result['forecast']
                if not forecast:
                    continue

                predicted_lowest = min(f['predictedQuantity'] for f in forecast)
                days_to_stockout = None
                for i, point in enumerate(forecast):
                    if point['predictedQuantity'] <= 0:
                        days_to_stockout = i + 1
                        break

                # Habis di luar horizon: gunakan iterasi penuh (sama dengan single mode)
                if days_to_stockout is None:
                    days_to_stockout = result.get('daysToStockout')

                risks.append({
                    'itemId': item.get('id'),
                    'itemName': item.get('name', ''),
                    'barcode': item.get('barcode'),
                    'currentQuantity': current_qty,
                    'minStock': int(item.get('minStock', 0)),
                    'avgDailyConsumption': result['model'].get('avgDailyConsumption', 0),
                    'predictedLowest': predicted_lowest,
                    'daysToStockout': days_to_stockout,
                    'r2': result['metrics'].get('r2', 0),
                    'mae': result['metrics'].get('mae', 0),
                    'rmse': result['metrics'].get('rmse', 0),
                    'slope': result['model'].get('slope', 0),
                    'forecast': forecast,
                })
            except Exception:
                continue

        def sort_key(risk):
            if risk['daysToStockout'] is not None:
                return (0, risk['daysToStockout'])
            return (1, risk['predictedLowest'])

        risks.sort(key=sort_key)
        self._send_json(200, {
            'source': 'lr-consumption-batch',
            'totalAnalyzed': len(risks),
            'risks': risks[:top_n],
        })

    def do_OPTIONS(self):
        origin = self.headers.get("Origin")
        if origin and origin not in allowed_origins():
            self.send_response(403)
            self.end_headers()
            return
        self.send_response(204)
        if origin:
            self.send_header('Access-Control-Allow-Origin', origin)
            self.send_header('Vary', 'Origin')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.end_headers()

    def _send_json(self, status, data):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        origin = self.headers.get("Origin")
        if origin and origin in allowed_origins():
            self.send_header('Access-Control-Allow-Origin', origin)
            self.send_header('Vary', 'Origin')
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())


def mean(values):
    return sum(values) / len(values) if values else 0.0


def day_key(timestamp_ms):
    return int(timestamp_ms // MS_PER_DAY) * MS_PER_DAY


def linear_regression(x, y):
    n = len(x)
    if n == 0:
        return 0.0, 0.0
    if n == 1:
        return y[0], 0.0

    mx = mean(x)
    my = mean(y)
    numerator = 0.0
    denominator = 0.0

    for i in range(n):
        dx = x[i] - mx
        numerator += dx * (y[i] - my)
        denominator += dx * dx

    if denominator == 0:
        return my, 0.0

    slope = numerator / denominator
    intercept = my - slope * mx
    return intercept, slope


def build_daily_series(transactions, current_quantity):
    """Rekonstruksi level stok harian dari transaksi dan stok saat ini."""
    daily_delta = {}

    for tx in transactions:
        ts = int(tx.get('timestamp', 0) or 0)
        qty = int(tx.get('quantity', 0) or 0)
        tx_type = tx.get('type', 'out')
        key = day_key(ts)

        if tx_type == 'out':
            signed_qty = -abs(qty)
        elif tx_type == 'in':
            signed_qty = abs(qty)
        else:
            signed_qty = qty

        daily_delta[key] = daily_delta.get(key, 0) + signed_qty

    days = sorted(daily_delta)
    if not days:
        return []

    total_delta = sum(daily_delta.values())
    level = float(current_quantity) - total_delta

    series = []
    for day in days:
        level += daily_delta[day]
        series.append({'timestamp': day, 'quantity': max(0.0, level)})

    return series


def build_consumption_series(stock_series):
    sorted_series = sorted(stock_series, key=lambda point: point['timestamp'])
    consumption = []

    for i in range(1, len(sorted_series)):
        gap_days = (sorted_series[i]['timestamp'] - sorted_series[i - 1]['timestamp']) / MS_PER_DAY
        if gap_days <= 0:
            continue

        stock_delta = sorted_series[i - 1]['quantity'] - sorted_series[i]['quantity']
        daily_consumption = max(0.0, stock_delta / gap_days)
        consumption.append({
            'timestamp': sorted_series[i]['timestamp'],
            'consumption': daily_consumption,
        })

    return consumption


def smooth_consumption_series(series, alpha=CONSUMPTION_EMA_ALPHA):
    if not series:
        return []

    smoothed = series[0]['consumption']
    result = []

    for index, point in enumerate(series):
        if index > 0:
            smoothed = (
                alpha * point['consumption']
                + (1 - alpha) * smoothed
            )

        result.append({
            'timestamp': point['timestamp'],
            'consumption': smoothed,
        })

    return result


def build_lag_pairs(consumption_series):
    x = []
    y = []
    for i in range(1, len(consumption_series)):
        x.append(consumption_series[i - 1]['consumption'])
        y.append(consumption_series[i]['consumption'])
    return x, y


def tune_ema_alpha(stock_series):
    """Auto-tune alpha EMA per item via validasi kronologis one-step-ahead MAE."""
    raw = build_consumption_series(stock_series)
    if len(raw) < TUNE_MIN_POINTS:
        return CONSUMPTION_EMA_ALPHA

    best_alpha = CONSUMPTION_EMA_ALPHA
    best_mae = float('inf')

    for alpha in EMA_ALPHA_GRID:
        x, y = build_lag_pairs(smooth_consumption_series(raw, alpha))
        train_end = max(4, int(len(x) * 0.8))
        val_count = len(x) - train_end
        if val_count < 2:
            continue

        intercept, slope = linear_regression(x[:train_end], y[:train_end])
        sum_abs = 0.0
        for i in range(train_end, len(x)):
            predicted = max(0.0, intercept + slope * x[i])
            sum_abs += abs(y[i] - predicted)
        mae = sum_abs / val_count
        if mae < best_mae:
            best_mae = mae
            best_alpha = alpha

    return best_alpha


def fit_consumption_regression(stock_series, ema_alpha=CONSUMPTION_EMA_ALPHA):
    stock_series = sorted(stock_series, key=lambda point: point['timestamp'])
    raw_consumption_series = build_consumption_series(stock_series)
    consumption_series = smooth_consumption_series(raw_consumption_series, ema_alpha)

    x, y = build_lag_pairs(consumption_series)

    fallback_consumption = raw_consumption_series[-1]['consumption'] if raw_consumption_series else 0.0
    if y:
        intercept, consumption_slope = linear_regression(x, y)
        # Stabilisasi AR(1): slope >= 1 membuat forecast iteratif divergen.
        consumption_slope = min(consumption_slope, CONSUMPTION_SLOPE_MAX)
    else:
        intercept, consumption_slope = fallback_consumption, 0.0

    avg_daily = mean([point['consumption'] for point in raw_consumption_series])

    return {
        'type': 'Simple Linear Regression (daily consumption)',
        'intercept': intercept,
        'slope': -avg_daily,
        'consumptionIntercept': intercept,
        'consumptionSlope': consumption_slope,
        'avgDailyConsumption': avg_daily,
        'n': max(1, len(consumption_series)),
        'lastConsumption': consumption_series[-1]['consumption'] if consumption_series else fallback_consumption,
        'emaAlpha': ema_alpha,
    }


def predict_next_consumption(model, previous_consumption):
    predicted = model['consumptionIntercept'] + model['consumptionSlope'] * previous_consumption
    return max(0.0, predicted)


def calculate_metrics(actual, predicted):
    if not actual or not predicted:
        return {'mae': 0.0, 'rmse': 0.0, 'mape': 0.0, 'r2': 0.0}

    errors = [actual[i] - predicted[i] for i in range(len(actual))]
    mae = mean([abs(error) for error in errors])
    rmse = math.sqrt(mean([error ** 2 for error in errors]))
    non_zero_percentage_errors = [
        abs((actual[i] - predicted[i]) / actual[i]) * 100
        for i in range(len(actual))
        if actual[i] != 0
    ]
    mape = mean(non_zero_percentage_errors)

    avg_actual = mean(actual)
    ss_res = sum(error ** 2 for error in errors)
    ss_tot = sum((value - avg_actual) ** 2 for value in actual)
    r2 = 1.0 if ss_tot == 0 and ss_res == 0 else 0.0 if ss_tot == 0 else 1 - ss_res / ss_tot

    return {'mae': mae, 'rmse': rmse, 'mape': mape, 'r2': r2}


def evaluate_consumption(model, stock_series, alpha=CONSUMPTION_EMA_ALPHA):
    consumption_series = smooth_consumption_series(build_consumption_series(stock_series), alpha)
    if not consumption_series:
        return {'mae': 0.0, 'rmse': 0.0, 'mape': 0.0, 'r2': 0.0}

    actual = []
    predicted = []
    for i in range(1, len(consumption_series)):
        actual.append(consumption_series[i]['consumption'])
        predicted.append(predict_next_consumption(model, consumption_series[i - 1]['consumption']))

    return calculate_metrics(actual, predicted)


def estimate_stockout_date(model, current_quantity, base_timestamp):
    base_date = datetime.fromtimestamp(base_timestamp / 1000, tz=timezone.utc)
    if current_quantity <= 0:
        return base_date.strftime('%Y-%m-%d')

    quantity = float(current_quantity)
    previous_consumption = model.get('lastConsumption', model['avgDailyConsumption'])

    for day in range(1, 3651):
        consumption = predict_next_consumption(model, previous_consumption)
        if consumption <= 0 and model['avgDailyConsumption'] <= 0:
            return None

        quantity = max(0.0, quantity - consumption)
        previous_consumption = consumption
        if quantity <= 0:
            return (base_date + timedelta(days=day)).strftime('%Y-%m-%d')

    return None


def estimate_stockout_days(model, current_quantity):
    """Jumlah hari hingga stok habis (None = tidak habis dalam 3650 hari)."""
    if current_quantity <= 0:
        return 0

    quantity = float(current_quantity)
    previous_consumption = model.get('lastConsumption', model['avgDailyConsumption'])

    for day in range(1, 3651):
        consumption = predict_next_consumption(model, previous_consumption)
        if consumption <= 0 and model['avgDailyConsumption'] <= 0:
            return None

        quantity = max(0.0, quantity - consumption)
        previous_consumption = consumption
        if quantity <= 0:
            return day

    return None


def predict_stock(stock_series, horizon_days=14, train_ratio=0.85):
    """Pipeline: fit regresi lag-1 dari train, evaluasi, forecast iteratif stok."""
    stock_series = sorted(stock_series, key=lambda point: point['timestamp'])
    if len(stock_series) < 2:
        return {'error': 'Not enough data'}

    split_idx = min(len(stock_series), max(2, int(len(stock_series) * train_ratio)))
    train = stock_series[:split_idx]
    test = stock_series[split_idx:]

    ema_alpha = tune_ema_alpha(stock_series)
    model = fit_consumption_regression(train, ema_alpha)
    metrics = evaluate_consumption(model, stock_series, ema_alpha)

    last_qty = stock_series[-1]['quantity']
    last_ts = stock_series[-1]['timestamp']
    current_qty = float(last_qty)
    previous_consumption = model.get('lastConsumption', model['avgDailyConsumption'])
    forecast = []

    for day in range(1, horizon_days + 1):
        ts = last_ts + day * MS_PER_DAY
        predicted_consumption = predict_next_consumption(model, previous_consumption)
        current_qty = max(0.0, current_qty - predicted_consumption)
        previous_consumption = predicted_consumption
        forecast.append({
            'timestamp': int(ts),
            'predictedQuantity': int(round(current_qty)),
            'estimatedConsumption': int(round(predicted_consumption)),
        })

    raw_consumption = build_consumption_series(stock_series)

    return {
        'source': 'lr-consumption-py',
        'model': {
            'type': model['type'],
            'intercept': model['intercept'],
            'slope': model['slope'],
            'consumptionIntercept': model['consumptionIntercept'],
            'consumptionSlope': model['consumptionSlope'],
            'avgDailyConsumption': model['avgDailyConsumption'],
            'n': model['n'],
            'lastConsumption': model['lastConsumption'],
            'emaAlpha': model['emaAlpha'],
            'baseTimestamp': stock_series[0]['timestamp'],
            'totalConsumption': sum(p['consumption'] for p in raw_consumption),
            'dowConsumption': [],
        },
        'metrics': {
            'mae': metrics['mae'],
            'rmse': metrics['rmse'],
            'mape': metrics['mape'],
            'r2': metrics['r2'],
            'nTrain': max(1, len(train) - 1),
            'nTest': len(test),
            'available': True,
        },
        'forecast': forecast,
        'stockoutDate': estimate_stockout_date(model, last_qty, last_ts),
        'daysToStockout': estimate_stockout_days(model, last_qty),
        'anomalies': [],
    }
