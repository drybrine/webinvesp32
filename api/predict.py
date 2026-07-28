"""
Stock prediction API - Simple Linear Regression.

Pendekatan berbasis konsumsi:
  transaksi out → konsumsi harian (zero-fill kalender)
  → OLS kumulatif ΣC(t) = a + b*t  (b = avgDailyConsumption)
  → forecast stok: S_d = max(0, S0 - d*b)

Evaluasi holdout (Opsi A):
  - R² pada deret kumulatif ΣC vs a+b·t (kecocokan tren / prediksi stok)
  - MAE/RMSE pada level stok holdout (S_train − d·b vs stok aktual)

Tidak merekonstruksi histori stok dari currentQuantity inventory untuk fit model.
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

            if len(transactions) < 2:
                self._send_json(400, {'error': 'Minimal 2 transaksi diperlukan', 'source': 'lr-consumption-py'})
                return

            consumption_data = build_consumption_from_transactions(transactions)
            if len(consumption_data) < 2:
                self._send_json(400, {'error': 'Data konsumsi harian < 2 titik', 'source': 'lr-consumption-py'})
                return

            result = predict_stock(consumption_data, current_quantity, horizon_days, train_ratio)
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
                consumption_data = build_consumption_from_transactions(item_tx)
                if len(consumption_data) < 2:
                    continue

                result = predict_stock(consumption_data, current_qty, horizon_days, train_ratio)
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

                if days_to_stockout is None:
                    avg_daily = result['model'].get('avgDailyConsumption', 0)
                    if avg_daily > 0 and current_qty > 0:
                        # ceil: match iterative forecast first day predictedQuantity <= 0
                        days_to_stockout = math.ceil(current_qty / avg_daily)

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


def calculate_metrics(actual, predicted):
    if not actual or not predicted:
        return {'mae': 0.0, 'rmse': 0.0, 'r2': 0.0}

    errors = [actual[i] - predicted[i] for i in range(len(actual))]
    mae = mean([abs(error) for error in errors])
    rmse = math.sqrt(mean([error ** 2 for error in errors]))
    avg_actual = mean(actual)
    ss_res = sum(error ** 2 for error in errors)
    ss_tot = sum((value - avg_actual) ** 2 for value in actual)
    r2 = 1.0 if ss_tot == 0 and ss_res == 0 else 0.0 if ss_tot == 0 else 1 - ss_res / ss_tot
    return {'mae': mae, 'rmse': rmse, 'r2': r2}


def build_consumption_from_transactions(transactions, end_timestamp=None):
    """Agregasi transaksi 'out' menjadi konsumsi harian + zero-fill kalender.

    Hanya type == 'out' (missing type diabaikan, sama dengan client TS).
    Hari tanpa transaksi out diisi 0 dari hari event pertama sampai
    max(hari event terakhir, end_timestamp) agar laju tidak overestimate
    karena event-day-only.
    """
    daily = {}
    max_timestamp = int(datetime.now(timezone.utc).timestamp() * 1000)
    for tx in transactions:
        if not isinstance(tx, dict):
            continue
        if tx.get('type') != 'out':
            continue
        try:
            ts = int(tx.get('timestamp', 0))
            qty = abs(float(tx.get('quantity', 0)))
        except (TypeError, ValueError, OverflowError):
            continue
        if ts <= 0 or ts > max_timestamp or not math.isfinite(qty):
            continue
        day_key = (ts // MS_PER_DAY) * MS_PER_DAY
        daily[day_key] = daily.get(day_key, 0) + qty

    if not daily:
        return []

    start = min(daily.keys())
    end = max(daily.keys())
    if end_timestamp is not None:
        end = max(end, int((int(end_timestamp) // MS_PER_DAY) * MS_PER_DAY))

    filled = []
    ts = start
    while ts <= end:
        filled.append({'timestamp': ts, 'consumption': daily.get(ts, 0)})
        ts += MS_PER_DAY
    return filled


def build_cumulative_series(data):
    """Bangun deret kumulatif konsumsi terhadap indeks hari."""
    base_ts = data[0]['timestamp']
    total = 0.0
    days = []
    cumulative = []
    for point in data:
        day_index = int(round((point['timestamp'] - base_ts) / MS_PER_DAY))
        total += point['consumption']
        days.append(day_index)
        cumulative.append(total)
    return days, cumulative


def fit_consumption_regression(data):
    """Fit OLS pada kumulatif konsumsi: ΣC(t) = a + b*t.  slope = avgDailyConsumption."""
    data = sorted(data, key=lambda p: p['timestamp'])
    base_ts = data[0]['timestamp']
    days, cumulative = build_cumulative_series(data)
    intercept, slope = linear_regression(days, cumulative)
    avg_daily = max(0.0, slope)

    # Monday=0 .. Sunday=6 (UTC) — sama dengan client fallback
    dow_totals = [[] for _ in range(7)]
    for point in data:
        dow = datetime.fromtimestamp(point['timestamp'] / 1000, tz=timezone.utc).weekday()
        dow_totals[dow].append(point['consumption'])
    dow_consumption = [mean(items) if items else avg_daily for items in dow_totals]

    return {
        'baseTimestamp': base_ts,
        'intercept': intercept,
        'avgDailyConsumption': avg_daily,
        'totalConsumption': cumulative[-1] if cumulative else 0,
        'dowConsumption': dow_consumption,
        'n': len(data),
    }


def evaluate_consumption(model, train_data, test_data, current_stock):
    """Evaluasi holdout (Opsi A):

    - R² pada ΣC(t) vs a + b·t (kecocokan tren kumulatif / prediksi stok)
    - MAE/RMSE pada level stok holdout: aktual vs S_train − d·b

    current_stock = stok saat ini (akhir deret train+test).
    """
    if not test_data or len(test_data) < 2 or not train_data:
        return {'mae': None, 'rmse': None, 'r2': None, 'available': False}

    full = list(train_data) + list(test_data)
    # Rekonstruksi stok mundur dari current_stock (titik akhir = current)
    stock_levels = []
    stock = float(current_stock)
    for point in reversed(full):
        stock_levels.append(stock)
        stock += float(point.get('consumption', 0))
    stock_levels.reverse()

    train_len = len(train_data)
    stock_after_train = float(stock_levels[train_len - 1])
    b = float(model['avgDailyConsumption'])

    actual_stock = []
    predicted_stock = []
    for j in range(len(test_data)):
        actual_stock.append(float(stock_levels[train_len + j]))
        predicted_stock.append(max(0.0, stock_after_train - (j + 1) * b))
    stock_metrics = calculate_metrics(actual_stock, predicted_stock)

    # R² kumulatif holdout: ΣC dari awal train vs a + b·t
    base_ts = model['baseTimestamp']
    cum_train = sum(float(p.get('consumption', 0)) for p in train_data)
    running = 0.0
    actual_cum = []
    predicted_cum = []
    intercept = float(model['intercept'])
    for point in test_data:
        running += float(point.get('consumption', 0))
        t = int(round((point['timestamp'] - base_ts) / MS_PER_DAY))
        actual_cum.append(cum_train + running)
        predicted_cum.append(intercept + b * t)
    cum_metrics = calculate_metrics(actual_cum, predicted_cum)

    return {
        'mae': stock_metrics['mae'],
        'rmse': stock_metrics['rmse'],
        'r2': cum_metrics['r2'],
        'available': True,
    }


def estimate_stockout_date(model, current_quantity, base_timestamp):
    """Tanggal habis = base + ceil(S0/b) hari — sama dgn first forecast point <= 0."""
    base_date = datetime.fromtimestamp(base_timestamp / 1000, tz=timezone.utc)
    if current_quantity <= 0:
        return (base_date + timedelta(days=1)).strftime('%Y-%m-%d')

    daily_consumption = model['avgDailyConsumption']
    if daily_consumption <= 0:
        return None

    quantity = float(current_quantity)
    days_to_stockout = math.ceil(quantity / daily_consumption)
    stockout_date = base_date + timedelta(days=days_to_stockout)
    return stockout_date.strftime('%Y-%m-%d')


def current_day_timestamp():
    return int((datetime.now(timezone.utc).timestamp() * 1000) // MS_PER_DAY) * MS_PER_DAY


def train_test_split(data, train_ratio=0.85):
    data = sorted(data, key=lambda p: p['timestamp'])
    cut = min(len(data), max(2, int(len(data) * train_ratio)))
    return data[:cut], data[cut:]


def fill_calendar_days(data, end_timestamp=None):
    """Zero-fill gap hari antara first..max(last, end) pada deret konsumsi."""
    if not data:
        return []
    daily = {}
    for point in data:
        ts = int(point['timestamp'])
        day = (ts // MS_PER_DAY) * MS_PER_DAY
        daily[day] = daily.get(day, 0) + float(point.get('consumption', 0))
    start = min(daily.keys())
    end = max(daily.keys())
    if end_timestamp is not None:
        end = max(end, int((int(end_timestamp) // MS_PER_DAY) * MS_PER_DAY))
    filled = []
    ts = start
    while ts <= end:
        filled.append({'timestamp': ts, 'consumption': daily.get(ts, 0.0)})
        ts += MS_PER_DAY
    return filled


def predict_stock(consumption_data, current_stock, horizon_days=14, train_ratio=0.85,
                  now_timestamp=None):
    """Pipeline: fit regresi kumulatif, evaluate, forecast stok iteratif."""
    try:
        current_stock = max(0.0, float(current_stock))
        if not math.isfinite(current_stock):
            current_stock = 0.0
    except (TypeError, ValueError, OverflowError):
        current_stock = 0.0
    today_ts = current_day_timestamp() if now_timestamp is None else int((now_timestamp // MS_PER_DAY) * MS_PER_DAY)
    # Hari berjalan belum lengkap; memasukkannya sebagai satu hari penuh akan
    # menurunkan estimasi konsumsi dan merusak metrik holdout.
    completed_days = [
        point for point in consumption_data
        if int((int(point['timestamp']) // MS_PER_DAY) * MS_PER_DAY) < today_ts
    ]
    data = fill_calendar_days(
        sorted(completed_days, key=lambda p: p['timestamp']),
        end_timestamp=today_ts - MS_PER_DAY,
    )
    if len(data) < 2:
        return {'error': 'Not enough data'}

    train, test = train_test_split(data, train_ratio)
    model = fit_consumption_regression(train)
    # Holdout: R² kumulatif + MAE/RMSE stok; jangan evaluasi full data saat test < 2.
    if len(test) >= 2:
        metrics = evaluate_consumption(model, train, test, current_stock)
    else:
        metrics = {'mae': None, 'rmse': None, 'r2': None, 'available': False}

    last_ts = data[-1]['timestamp']
    forecast_base_ts = max(last_ts, today_ts)

    daily_consumption = model['avgDailyConsumption']
    forecast_qty = float(current_stock)

    forecast = []
    for day in range(1, horizon_days + 1):
        ts = forecast_base_ts + day * MS_PER_DAY
        forecast_qty = max(0.0, forecast_qty - daily_consumption)
        forecast.append({
            'timestamp': int(ts),
            'predictedQuantity': round(forecast_qty, 1),
            'estimatedConsumption': round(daily_consumption, 1),
        })

    def round_or_none(value, digits):
        if value is None:
            return None
        return round(value, digits)

    return {
        'source': 'lr-consumption-py',
        'model': {
            'type': 'Simple Linear Regression (cumulative consumption)',
            'baseTimestamp': model['baseTimestamp'],
            'intercept': model['intercept'],
            'slope': -model['avgDailyConsumption'],
            'avgDailyConsumption': model['avgDailyConsumption'],
            'totalConsumption': model['totalConsumption'],
            'dowConsumption': model['dowConsumption'],
            'n': model['n'],
            'consumptionSlope': 0,
            'consumptionIntercept': 0,
            'lastConsumption': 0,
        },
        'metrics': {
            'mae': round_or_none(metrics.get('mae'), 3),
            'rmse': round_or_none(metrics.get('rmse'), 3),
            'r2': round_or_none(metrics.get('r2'), 3),
            'nTrain': len(train),
            'nTest': len(test),
            'available': bool(metrics.get('available')),
        },
        'forecast': forecast,
        'stockoutDate': estimate_stockout_date(model, current_stock, forecast_base_ts),
        'anomalies': [],
    }
