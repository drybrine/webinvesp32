"""
Stock prediction API - Simple Linear Regression.

Model sesuai regresi linear sederhana:
  Y = a + bX

Di sini X = konsumsi hari sebelumnya dan Y = konsumsi hari ini. Forecast stok
dihitung iteratif dari prediksi konsumsi harian, sehingga grafik stok tidak
dipaksa menjadi satu garis lurus walaupun modelnya tetap Linear Regression satu
variabel.
"""

from http.server import BaseHTTPRequestHandler
import json
import math
import os
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta


MS_PER_DAY = 86400000
CONSUMPTION_EMA_ALPHA = 0.05
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
    except (TypeError, ValueError):
        raise ValueError(f"{field} tidak valid")
    if parsed < minimum or parsed > maximum:
        raise ValueError(f"{field} harus antara {minimum} dan {maximum}")
    return parsed


def bounded_float(value, default, minimum, maximum, field):
    try:
        parsed = float(value if value is not None else default)
    except (TypeError, ValueError):
        raise ValueError(f"{field} tidak valid")
    if parsed < minimum or parsed > maximum:
        raise ValueError(f"{field} harus antara {minimum} dan {maximum}")
    return parsed


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
            current_quantity = data.get('currentQuantity', 0)
            horizon_days = bounded_int(data.get('horizonDays'), 14, 1, 90, "horizonDays")
            train_ratio = bounded_float(data.get('trainRatio'), 0.85, 0.5, 0.95, "trainRatio")

            if len(transactions) < 2:
                self._send_json(400, {'error': 'Minimal 2 transaksi diperlukan', 'source': 'lr-consumption-py'})
                return

            series = build_daily_series(transactions, current_quantity)
            if len(series) < 2:
                self._send_json(400, {'error': 'Data harian < 2 titik', 'source': 'lr-consumption-py'})
                return

            result = predict_stock(series, horizon_days, train_ratio)
            self._send_json(200, result)

        except json.JSONDecodeError:
            self._send_json(400, {'error': 'JSON tidak valid', 'source': 'lr-consumption-py'})
        except ValueError as e:
            self._send_json(400, {'error': str(e), 'source': 'lr-consumption-py'})
        except Exception as e:
            self._send_json(500, {'error': str(e), 'source': 'lr-consumption-py'})

    def _handle_batch(self, data):
        items = data.get('items', [])
        transactions = data.get('transactions', [])
        horizon_days = bounded_int(data.get('horizonDays'), 14, 1, 90, "horizonDays")
        train_ratio = bounded_float(data.get('trainRatio'), 0.85, 0.5, 0.95, "trainRatio")
        top_n = bounded_int(data.get('topN'), 3, 1, 20, "topN")
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

        cutoff = (datetime.now().timestamp() * 1000) - recent_days * MS_PER_DAY
        recent_tx = [t for t in transactions if int(t.get('timestamp', 0)) >= cutoff]

        tx_by_barcode = {}
        for tx in recent_tx:
            barcode = tx.get('productBarcode')
            if barcode:
                tx_by_barcode.setdefault(barcode, []).append(tx)

        risks = []
        for item in items:
            if item.get('deleted') or not item.get('barcode'):
                continue

            item_tx = tx_by_barcode.get(item['barcode'], [])
            current_qty = int(item.get('quantity', 0))
            series = build_daily_series(item_tx, current_qty)
            if len(series) < 2:
                continue

            try:
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

                if days_to_stockout is None:
                    avg_daily = result['model'].get('avgDailyConsumption', 0)
                    if avg_daily > 0 and current_qty > 0:
                        days_to_stockout = round(current_qty / avg_daily)

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


def build_daily_series(transactions, current_quantity):
    daily_delta = {}
    for tx in transactions:
        ts = int(tx.get('timestamp', 0))
        qty = int(tx.get('quantity', 0))
        tx_type = tx.get('type', 'out')
        day_key = (ts // MS_PER_DAY) * MS_PER_DAY
        signed_qty = -abs(qty) if tx_type == 'out' else abs(qty) if tx_type == 'in' else qty
        daily_delta[day_key] = daily_delta.get(day_key, 0) + signed_qty

    days = sorted(daily_delta.keys())
    if not days:
        return []

    total_delta = sum(daily_delta.values())
    level = current_quantity - total_delta
    series = []
    for day in days:
        level += daily_delta[day]
        series.append({'timestamp': day, 'quantity': max(0, level)})
    return series


def build_consumption_series(series):
    series = sorted(series, key=lambda point: point['timestamp'])
    consumption = []

    for i in range(1, len(series)):
        gap_days = (series[i]['timestamp'] - series[i - 1]['timestamp']) / MS_PER_DAY
        if gap_days <= 0:
            continue

        stock_delta = series[i - 1]['quantity'] - series[i]['quantity']
        daily_consumption = max(0.0, stock_delta / gap_days)
        consumption.append({
            'timestamp': series[i]['timestamp'],
            'consumption': daily_consumption,
        })

    return consumption


def smooth_consumption_series(series):
    if not series:
        return []

    smoothed = series[0]['consumption']
    result = []
    for i, point in enumerate(series):
        if i > 0:
            smoothed = CONSUMPTION_EMA_ALPHA * point['consumption'] + (1 - CONSUMPTION_EMA_ALPHA) * smoothed
        result.append({
            'timestamp': point['timestamp'],
            'consumption': smoothed,
        })
    return result


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


def fit_consumption_regression(series):
    series = sorted(series, key=lambda point: point['timestamp'])
    base_ts = series[0]['timestamp']
    raw_consumption_series = build_consumption_series(series)
    consumption_series = smooth_consumption_series(raw_consumption_series)
    x = []
    y = []
    for i in range(1, len(consumption_series)):
        x.append(consumption_series[i - 1]['consumption'])
        y.append(consumption_series[i]['consumption'])

    fallback_consumption = raw_consumption_series[-1]['consumption'] if raw_consumption_series else 0.0
    if y:
        intercept, consumption_slope = linear_regression(x, y)
    else:
        intercept, consumption_slope = fallback_consumption, 0.0
    avg_daily = mean([point['consumption'] for point in raw_consumption_series])

    dow_deltas = [[] for _ in range(7)]
    for point in raw_consumption_series:
        dow = datetime.fromtimestamp(point['timestamp'] / 1000).weekday()
        dow_deltas[dow].append(point['consumption'])
    dow_consumption = [mean(items) if items else avg_daily for items in dow_deltas]

    return {
        'baseTimestamp': base_ts,
        'intercept': intercept,
        'consumptionSlope': consumption_slope,
        'consumptionIntercept': intercept,
        'avgDailyConsumption': avg_daily,
        'dowConsumption': dow_consumption,
        'n': max(1, len(consumption_series)),
        'lastConsumption': consumption_series[-1]['consumption'] if consumption_series else fallback_consumption,
    }


def predict_next_consumption(model, previous_consumption):
    predicted = model['consumptionIntercept'] + model['consumptionSlope'] * previous_consumption
    return max(0.0, predicted)


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


def evaluate_stock_forecast(model, history_before_test, test_data):
    if not history_before_test or not test_data:
        return {'mae': 0.0, 'rmse': 0.0, 'r2': 0.0}

    history_before_test = sorted(history_before_test, key=lambda point: point['timestamp'])
    test_data = sorted(test_data, key=lambda point: point['timestamp'])
    previous_ts = history_before_test[-1]['timestamp']
    predicted_qty = history_before_test[-1]['quantity']

    actual = []
    predicted = []

    for point in test_data:
        gap_days = max(1, round((point['timestamp'] - previous_ts) / MS_PER_DAY))
        for step in range(1, gap_days + 1):
            predicted_qty = max(0.0, predicted_qty - model['avgDailyConsumption'])

        actual.append(point['quantity'])
        predicted.append(predicted_qty)
        previous_ts = point['timestamp']

    return calculate_metrics(actual, predicted)


def evaluate_consumption(model, series):
    consumption_series = smooth_consumption_series(build_consumption_series(series))
    if not consumption_series:
        return {'mae': 0.0, 'rmse': 0.0, 'r2': 0.0}

    actual = []
    predicted = []
    for i in range(1, len(consumption_series)):
        actual.append(consumption_series[i]['consumption'])
        predicted.append(predict_next_consumption(model, consumption_series[i - 1]['consumption']))
    return calculate_metrics(actual, predicted)


def estimate_stockout_date(model, current_quantity, base_timestamp):
    base_date = datetime.fromtimestamp(base_timestamp / 1000)
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


def current_day_timestamp():
    return int((datetime.now().timestamp() * 1000) // MS_PER_DAY) * MS_PER_DAY


def predict_stock(series, horizon_days=14, train_ratio=0.85, now_timestamp=None):
    series = sorted(series, key=lambda point: point['timestamp'])
    if len(series) < 2:
        return {'error': 'Not enough data'}

    split_idx = min(len(series), max(2, int(len(series) * train_ratio)))
    train = series[:split_idx]
    test = series[split_idx:]

    model = fit_consumption_regression(train)
    metrics = evaluate_consumption(model, series)

    last_qty = series[-1]['quantity']
    last_ts = series[-1]['timestamp']
    today_ts = current_day_timestamp() if now_timestamp is None else int((now_timestamp // MS_PER_DAY) * MS_PER_DAY)
    forecast_base_ts = max(last_ts, today_ts)
    current_qty = float(last_qty)
    previous_consumption = model.get('lastConsumption', model['avgDailyConsumption'])
    forecast = []

    for day in range(1, horizon_days + 1):
        ts = forecast_base_ts + day * MS_PER_DAY
        predicted_consumption = predict_next_consumption(model, previous_consumption)
        current_qty = max(0.0, current_qty - predicted_consumption)
        previous_consumption = predicted_consumption
        forecast.append({
            'timestamp': int(ts),
            'predictedQuantity': round(current_qty, 1),
            'estimatedConsumption': round(predicted_consumption, 1),
        })

    anomalies = detect_anomalies(series)

    return {
        'source': 'lr-consumption-py',
        'model': {
            'type': 'Simple Linear Regression (daily consumption)',
            'intercept': round(model['intercept'], 4),
            'slope': round(-model['avgDailyConsumption'], 4),
            'avgDailyConsumption': round(model['avgDailyConsumption'], 2),
            'dowConsumption': [round(value, 2) for value in model['dowConsumption']],
            'n': int(model['n']),
            'consumptionSlope': round(model['consumptionSlope'], 4),
            'consumptionIntercept': round(model['consumptionIntercept'], 4),
            'lastConsumption': round(model['lastConsumption'], 4),
        },
        'metrics': {
            'mae': round(metrics['mae'], 3),
            'rmse': round(metrics['rmse'], 3),
            'r2': round(metrics['r2'], 3),
            'nTrain': max(1, len(train) - 1),
            'nTest': len(test),
        },
        'forecast': forecast,
        'stockoutDate': estimate_stockout_date(model, last_qty, forecast_base_ts),
        'anomalies': anomalies,
    }


def detect_anomalies(series):
    """IQR-based spike detection + gap detection."""
    if len(series) < 5:
        return []

    series = sorted(series, key=lambda x: x['timestamp'])
    timestamps = [s['timestamp'] for s in series]
    quantities = [s['quantity'] for s in series]
    anomalies = []

    consumptions = []
    restocks = []
    for i in range(1, len(series)):
        delta = quantities[i - 1] - quantities[i]
        if delta > 0:
            consumptions.append((i, delta))
        elif delta < -5:
            restocks.append((i, abs(delta)))

    def iqr_bounds(values):
        if len(values) < 4:
            return None, None
        sorted_values = sorted(values)
        q1 = sorted_values[len(sorted_values) // 4]
        q3 = sorted_values[3 * len(sorted_values) // 4]
        iqr = q3 - q1
        if iqr == 0:
            return None, None
        return q1 - 1.5 * iqr, q3 + 1.5 * iqr

    if consumptions:
        values = [value for _, value in consumptions]
        avg = mean(values)
        _, upper = iqr_bounds(values)
        if upper is not None:
            for idx, value in consumptions:
                if value > upper:
                    excess = value / avg if avg > 0 else 1
                    severity = 'high' if excess > 3 else 'medium' if excess > 2 else 'low'
                    anomalies.append({
                        'timestamp': timestamps[idx],
                        'type': 'spike_consumption',
                        'value': round(value, 1),
                        'expected': round(avg, 1),
                        'severity': severity,
                        'description': f'Konsumsi {round(value,1)} jauh di atas rata-rata {round(avg,1)}/hari',
                    })

    if restocks:
        values = [value for _, value in restocks]
        avg = mean(values)
        _, upper = iqr_bounds(values)
        if upper is not None:
            for idx, value in restocks:
                if value > upper:
                    severity = 'high' if value > avg * 3 else 'medium'
                    anomalies.append({
                        'timestamp': timestamps[idx],
                        'type': 'spike_restock',
                        'value': round(value, 1),
                        'expected': round(avg, 1),
                        'severity': severity,
                        'description': f'Restock {round(value,1)} unit tidak wajar (rata-rata {round(avg,1)})',
                    })

    gap_threshold_days = 14
    for i in range(1, len(series)):
        gap_days = (timestamps[i] - timestamps[i - 1]) / MS_PER_DAY
        if gap_days > gap_threshold_days:
            anomalies.append({
                'timestamp': timestamps[i - 1],
                'type': 'gap',
                'value': round(gap_days, 0),
                'expected': gap_threshold_days,
                'severity': 'high' if gap_days > 30 else 'medium',
                'description': f'Tidak ada transaksi selama {round(gap_days,0):.0f} hari',
            })

    anomalies.sort(key=lambda x: x['timestamp'])
    return anomalies
