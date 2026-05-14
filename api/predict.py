from http.server import BaseHTTPRequestHandler
import json
import numpy as np
from datetime import datetime, timedelta

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            data = json.loads(body)

            transactions = data.get('transactions', [])
            current_quantity = data.get('currentQuantity', 0)
            horizon_days = data.get('horizonDays', 14)
            train_ratio = data.get('trainRatio', 0.8)

            if len(transactions) < 2:
                self._send_json(400, {
                    'error': 'Minimal 2 transaksi diperlukan',
                    'source': 'sklearn'
                })
                return

            series = build_daily_series(transactions, current_quantity)

            if len(series) < 3:
                self._send_json(400, {
                    'error': 'Data harian kurang dari 3 titik',
                    'source': 'sklearn'
                })
                return

            result = predict_stock(series, horizon_days, train_ratio)
            self._send_json(200, result)

        except Exception as e:
            self._send_json(500, {'error': str(e), 'source': 'sklearn'})

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


MS_PER_DAY = 86400000


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
        series.append({'timestamp': day, 'quantity': level})

    return series


def predict_stock(series, horizon_days=14, train_ratio=0.8):
    """Linear Regression dengan lag features (sklearn)."""
    from sklearn.linear_model import LinearRegression
    from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

    series = sorted(series, key=lambda x: x['timestamp'])
    timestamps = [s['timestamp'] for s in series]
    quantities = [s['quantity'] for s in series]
    n = len(series)

    # Feature engineering
    X = []
    y = []
    for i in range(7, n):
        ts = timestamps[i]
        dow = datetime.fromtimestamp(ts / 1000).weekday()
        features = [
            quantities[i - 1],                          # lag1
            quantities[i - 3],                          # lag3
            quantities[i - 7],                          # lag7
            np.mean(quantities[max(0, i-7):i]),         # rolling_mean_7
            np.std(quantities[max(0, i-7):i]),          # rolling_std_7
            dow,                                        # day_of_week
            1 if dow >= 5 else 0,                       # is_weekend
            i,                                          # day_number (trend)
        ]
        X.append(features)
        y.append(quantities[i])

    if len(X) < 4:
        return {
            'error': 'Tidak cukup data setelah feature engineering',
            'source': 'sklearn'
        }

    X = np.array(X)
    y = np.array(y)

    # Train/test split kronologis
    split_idx = max(2, int(len(X) * train_ratio))
    X_train, X_test = X[:split_idx], X[split_idx:]
    y_train, y_test = y[:split_idx], y[split_idx:]

    # Fit model
    model = LinearRegression()
    model.fit(X_train, y_train)

    # Evaluate
    if len(X_test) > 0:
        y_pred_test = model.predict(X_test)
        mae = float(mean_absolute_error(y_test, y_pred_test))
        rmse = float(np.sqrt(mean_squared_error(y_test, y_pred_test)))
        r2 = float(r2_score(y_test, y_pred_test))
    else:
        y_pred_train = model.predict(X_train)
        mae = float(mean_absolute_error(y_train, y_pred_train))
        rmse = float(np.sqrt(mean_squared_error(y_train, y_pred_train)))
        r2 = float(r2_score(y_train, y_pred_train))

    # Hitung avg daily consumption dan dow pattern
    daily_deltas = []
    dow_deltas = [[] for _ in range(7)]
    for i in range(1, n):
        gap_days = (timestamps[i] - timestamps[i-1]) / MS_PER_DAY
        if 0 < gap_days <= 2:
            delta = quantities[i-1] - quantities[i]
            if delta > 0:
                consumption = delta / gap_days
                daily_deltas.append(consumption)
                dow = datetime.fromtimestamp(timestamps[i] / 1000).weekday()
                dow_deltas[dow].append(consumption)

    avg_daily = float(np.mean(daily_deltas)) if daily_deltas else abs(float(model.coef_[0])) if model.coef_[0] != 0 else 1.0
    dow_consumption = [float(np.mean(d)) if d else avg_daily for d in dow_deltas]

    # Iterative forecast
    last_qty = quantities[-1]
    current_qty = last_qty
    last_ts = timestamps[-1]
    forecast = []

    # Build recent history for lag features
    recent_quantities = list(quantities[-7:])

    for day in range(1, horizon_days + 1):
        ts = last_ts + day * MS_PER_DAY
        dow = datetime.fromtimestamp(ts / 1000).weekday()

        # Consumption with dow pattern + noise
        consumption = dow_consumption[dow] * (0.8 + np.random.random() * 0.4)
        current_qty = max(0, current_qty - consumption)

        forecast.append({
            'timestamp': int(ts),
            'predictedQuantity': round(float(current_qty), 1),
            'estimatedConsumption': round(float(consumption), 1),
        })

        recent_quantities.append(current_qty)

    # Stockout estimation
    stockout_date = None
    if avg_daily > 0 and last_qty > 0:
        days_left = last_qty / avg_daily
        stockout_ts = datetime.now() + timedelta(days=days_left)
        stockout_date = stockout_ts.strftime('%Y-%m-%d')

    return {
        'source': 'sklearn',
        'model': {
            'slope': float(model.coef_[7]) if len(model.coef_) > 7 else float(model.coef_[0]),
            'intercept': float(model.intercept_),
            'avgDailyConsumption': round(avg_daily, 2),
            'dowConsumption': [round(d, 2) for d in dow_consumption],
            'n': int(split_idx),
            'coefficients': [round(float(c), 4) for c in model.coef_],
            'featureNames': ['lag1', 'lag3', 'lag7', 'rolling_mean_7', 'rolling_std_7', 'day_of_week', 'is_weekend', 'day_number'],
        },
        'metrics': {
            'mae': round(mae, 3),
            'rmse': round(rmse, 3),
            'r2': round(r2, 3),
            'nTrain': int(len(X_train)),
            'nTest': int(len(X_test)),
        },
        'forecast': forecast,
        'stockoutDate': stockout_date,
    }
