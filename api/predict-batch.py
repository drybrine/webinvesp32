"""
Batch stock prediction API.

Predicts top-N stockout risks across all inventory items in a single request.
Returns only the top risks to the client, keeping the dashboard fast.

POST /api/predict-batch
Body: {
  items: [{ id, barcode, quantity, minStock, name }, ...],
  transactions: [{ productBarcode, type, quantity, timestamp }, ...],
  horizonDays: number (default 14),
  trainRatio: number (default 0.8),
  topN: number (default 3),
  recentDays: number (default 90) - only use last N days of transactions
}

Response: {
  source: 'mlr-batch',
  risks: [
    {
      itemId, itemName, barcode, currentQuantity, minStock,
      avgDailyConsumption, predictedLowest, daysToStockout,
      r2, mae, slope, forecast: [...]
    },
    ...
  ]
}
"""

from http.server import BaseHTTPRequestHandler
import json
import numpy as np
from datetime import datetime, timedelta


MS_PER_DAY = 86400000

FEATURE_NAMES = [
    'lag1', 'lag3', 'lag7',
    'rolling_mean_7', 'rolling_std_7',
    'daily_change',
    'day_of_week', 'is_weekend', 'day_number',
]


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            data = json.loads(body)

            items = data.get('items', [])
            transactions = data.get('transactions', [])
            horizon_days = data.get('horizonDays', 14)
            train_ratio = data.get('trainRatio', 0.8)
            top_n = data.get('topN', 3)
            recent_days = data.get('recentDays', 90)

            if not items:
                self._send_json(400, {'error': 'No items provided', 'source': 'mlr-batch'})
                return

            # Filter transactions to recent days only (faster + relevant)
            cutoff = (datetime.now().timestamp() * 1000) - recent_days * MS_PER_DAY
            recent_tx = [t for t in transactions if int(t.get('timestamp', 0)) >= cutoff]

            # Group transactions by productBarcode
            tx_by_barcode = {}
            for tx in recent_tx:
                bc = tx.get('productBarcode')
                if bc:
                    tx_by_barcode.setdefault(bc, []).append(tx)

            risks = []
            now_ms = datetime.now().timestamp() * 1000

            for item in items:
                if item.get('deleted') or not item.get('barcode'):
                    continue

                item_tx = tx_by_barcode.get(item['barcode'], [])
                current_qty = int(item.get('quantity', 0))

                series = build_daily_series(item_tx, current_qty)
                if len(series) < 10:
                    continue

                try:
                    result = predict_stock(series, horizon_days, train_ratio)
                    if 'error' in result:
                        continue

                    forecast = result['forecast']
                    if not forecast:
                        continue

                    predicted_lowest = min(f['predictedQuantity'] for f in forecast)

                    # Days to stockout from forecast
                    days_to_stockout = None
                    for i, f in enumerate(forecast):
                        if f['predictedQuantity'] <= 0:
                            days_to_stockout = i + 1
                            break

                    # Fallback: dari avgDaily kalau forecast tidak mencapai 0
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

            # Sort: paling cepat habis duluan
            def sort_key(r):
                # Items dengan daysToStockout dipriority
                if r['daysToStockout'] is not None:
                    return (0, r['daysToStockout'])
                return (1, r['predictedLowest'])

            risks.sort(key=sort_key)
            top_risks = risks[:top_n]

            self._send_json(200, {
                'source': 'mlr-batch',
                'totalAnalyzed': len(risks),
                'risks': top_risks,
            })

        except Exception as e:
            self._send_json(500, {'error': str(e), 'source': 'mlr-batch'})

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def _send_json(self, status, data):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())


def build_daily_series(transactions, current_quantity):
    """Rekonstruksi level stok harian dari transaksi."""
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


def build_features(quantities, timestamps):
    n = len(quantities)
    X, y = [], []

    for i in range(7, n - 1):
        window = quantities[i - 7:i]
        X.append([
            quantities[i - 1],
            quantities[i - 3],
            quantities[i - 7],
            float(np.mean(window)),
            float(np.std(window)),
            quantities[i] - quantities[i - 1],
            datetime.fromtimestamp(timestamps[i] / 1000).weekday(),
            1 if datetime.fromtimestamp(timestamps[i] / 1000).weekday() >= 5 else 0,
            i,
        ])
        y.append(quantities[i + 1])

    return np.array(X, dtype=np.float64), np.array(y, dtype=np.float64)


def fit_scaler(X):
    mean = X.mean(axis=0)
    std = X.std(axis=0)
    std[std == 0] = 1.0
    return mean, std


def ols_fit(X, y):
    X_b = np.column_stack([np.ones(len(X)), X])
    try:
        beta = np.linalg.lstsq(X_b, y, rcond=None)[0]
    except np.linalg.LinAlgError:
        beta = np.zeros(X_b.shape[1])
    return beta[0], beta[1:]


def predict_next_day(history, model, ts):
    coefs = model.get('coefficients')
    sm_mean = model.get('scaler_mean')
    sm_std = model.get('scaler_std')
    intercept = model.get('intercept', 0.0)

    if len(history) >= 7 and coefs is not None and sm_mean is not None:
        i = len(history)
        window = history[i - 7:i]
        dow = datetime.fromtimestamp(ts / 1000).weekday()
        features = np.array([
            history[i - 1],
            history[i - 3],
            history[i - 7],
            float(np.mean(window)),
            float(np.std(window)),
            history[i - 1] - history[i - 2] if i >= 2 else 0,
            dow,
            1 if dow >= 5 else 0,
            i,
        ])
        scaled = (features - np.array(sm_mean)) / np.array(sm_std)
        return max(0, float(scaled @ np.array(coefs) + intercept))

    # Fallback: dow consumption
    dow_consumption = model.get('dowConsumption', [])
    avg = model.get('avgDailyConsumption', 1.0)
    if dow_consumption:
        dow = datetime.fromtimestamp(ts / 1000).weekday()
        consumption = dow_consumption[dow] * (0.85 + np.random.random() * 0.3)
    else:
        consumption = avg
    return max(0, history[-1] - consumption)


def predict_stock(series, horizon_days=14, train_ratio=0.8):
    series = sorted(series, key=lambda x: x['timestamp'])
    timestamps = [s['timestamp'] for s in series]
    quantities = [s['quantity'] for s in series]

    # Hitung dow consumption
    daily_deltas = []
    dow_deltas = [[] for _ in range(7)]
    for i in range(1, len(series)):
        gap_days = (timestamps[i] - timestamps[i - 1]) / MS_PER_DAY
        if 0 < gap_days <= 2:
            delta = quantities[i - 1] - quantities[i]
            if delta > 0:
                consumption = delta / gap_days
                daily_deltas.append(consumption)
                dow = datetime.fromtimestamp(timestamps[i] / 1000).weekday()
                dow_deltas[dow].append(consumption)

    avg_daily = float(np.mean(daily_deltas)) if daily_deltas else 1.0
    dow_consumption = [float(np.mean(d)) if d else avg_daily for d in dow_deltas]

    X, y = build_features(quantities, timestamps)
    if len(X) < 5:
        return {'error': 'Not enough data after FE'}

    split_idx = max(2, int(len(X) * train_ratio))
    X_train, X_test = X[:split_idx], X[split_idx:]
    y_train, y_test = y[:split_idx], y[split_idx:]

    sm_mean, sm_std = fit_scaler(X_train)
    X_train_s = (X_train - sm_mean) / sm_std

    intercept, coefs = ols_fit(X_train_s, y_train)

    # Eval
    if len(X_test) > 0:
        X_test_s = (X_test - sm_mean) / sm_std
        y_pred = X_test_s @ coefs + intercept
        mae = float(np.mean(np.abs(y_test - y_pred)))
        rmse = float(np.sqrt(np.mean((y_test - y_pred) ** 2)))
        ss_res = float(np.sum((y_test - y_pred) ** 2))
        ss_tot = float(np.sum((y_test - np.mean(y_test)) ** 2))
        r2 = 1 - ss_res / ss_tot if ss_tot > 0 else 0.0
    else:
        mae, rmse, r2 = 0.0, 0.0, 0.0

    # Iterative forecast
    model_state = {
        'intercept': float(intercept),
        'coefficients': coefs.tolist(),
        'scaler_mean': sm_mean.tolist(),
        'scaler_std': sm_std.tolist(),
        'dowConsumption': dow_consumption,
        'avgDailyConsumption': avg_daily,
    }

    last_ts = timestamps[-1]
    history = list(quantities)
    forecast = []
    prev_qty = quantities[-1]

    np.random.seed(42)
    for day in range(1, horizon_days + 1):
        ts = last_ts + day * MS_PER_DAY
        predicted = predict_next_day(history, model_state, ts)
        consumption = max(0, prev_qty - predicted)
        forecast.append({
            'timestamp': int(ts),
            'predictedQuantity': round(float(predicted), 1),
            'estimatedConsumption': round(float(consumption), 1),
        })
        history.append(predicted)
        prev_qty = predicted

    return {
        'model': {
            'intercept': round(float(intercept), 4),
            'slope': round(-avg_daily, 4),
            'avgDailyConsumption': round(avg_daily, 2),
            'dowConsumption': [round(d, 2) for d in dow_consumption],
        },
        'metrics': {
            'mae': round(mae, 3),
            'rmse': round(rmse, 3),
            'r2': round(r2, 3),
        },
        'forecast': forecast,
    }
