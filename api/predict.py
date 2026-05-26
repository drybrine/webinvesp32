"""
Stock prediction API — Multi Linear Regression + StandardScaler.

Reference: Tested in scripts/honda_test_model.ipynb on 20 Honda spareparts,
avg R² 0.61, 18/20 items with R² > 0.5.

Pipeline:
  1. Build daily stock series from transactions
  2. Feature engineering (lag1/3/7, rolling mean/std, dow, daily_change, day_number)
  3. StandardScaler (mean=0, std=1)
  4. OLS via numpy.linalg.lstsq
  5. Train/test split (chronological)
  6. Iterative forecast (predict day -> push as lag1 -> repeat)
"""

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
                self._send_json(400, {'error': 'Minimal 2 transaksi diperlukan', 'source': 'mlr-numpy'})
                return

            series = build_daily_series(transactions, current_quantity)

            if len(series) < 10:
                self._send_json(400, {'error': 'Data harian < 10 titik (perlu untuk MLR)', 'source': 'mlr-numpy'})
                return

            result = predict_stock(series, horizon_days, train_ratio)
            self._send_json(200, result)

        except Exception as e:
            self._send_json(500, {'error': str(e), 'source': 'mlr-numpy'})

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

FEATURE_NAMES = [
    'lag1', 'lag3', 'lag7',
    'rolling_mean_7', 'rolling_std_7',
    'daily_change',
    'day_of_week', 'is_weekend', 'day_number',
]


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
    """Feature engineering untuk MLR.

    Returns:
        X: (n, 9) matrix of features
        y: (n,) target = stok besok
    """
    n = len(quantities)
    X, y = [], []

    for i in range(7, n - 1):
        lag1 = quantities[i - 1]
        lag3 = quantities[i - 3]
        lag7 = quantities[i - 7]
        window = quantities[i - 7:i]
        mean7 = float(np.mean(window))
        std7 = float(np.std(window))
        daily_change = quantities[i] - quantities[i - 1]
        dow = datetime.fromtimestamp(timestamps[i] / 1000).weekday()
        is_weekend = 1 if dow >= 5 else 0
        day_num = i

        X.append([lag1, lag3, lag7, mean7, std7, daily_change, dow, is_weekend, day_num])
        y.append(quantities[i + 1])

    return np.array(X, dtype=np.float64), np.array(y, dtype=np.float64)


def fit_scaler(X):
    """StandardScaler: mean=0, std=1 per feature."""
    mean = X.mean(axis=0)
    std = X.std(axis=0)
    std[std == 0] = 1.0
    return mean, std


def transform_scaler(X, mean, std):
    return (X - mean) / std


def ols_fit(X, y):
    """OLS via normal equation."""
    X_b = np.column_stack([np.ones(len(X)), X])
    try:
        beta = np.linalg.lstsq(X_b, y, rcond=None)[0]
    except np.linalg.LinAlgError:
        beta = np.zeros(X_b.shape[1])
    return beta[0], beta[1:]  # intercept, coefficients


def predict_next_day(history, model, ts):
    """Predict stok besok pakai MLR (jika tersedia) atau fallback dow."""
    coefs = model.get('coefficients')
    sm_mean = model.get('scaler_mean')
    sm_std = model.get('scaler_std')
    intercept = model.get('intercept', 0.0)

    if len(history) >= 7 and coefs is not None and sm_mean is not None:
        i = len(history)
        lag1 = history[i - 1]
        lag3 = history[i - 3]
        lag7 = history[i - 7]
        window = history[i - 7:i]
        mean7 = float(np.mean(window))
        std7 = float(np.std(window))
        daily_change = history[i - 1] - history[i - 2] if i >= 2 else 0
        dow = datetime.fromtimestamp(ts / 1000).weekday()
        is_weekend = 1 if dow >= 5 else 0
        day_num = i

        features = np.array([lag1, lag3, lag7, mean7, std7, daily_change, dow, is_weekend, day_num])
        scaled = (features - np.array(sm_mean)) / np.array(sm_std)
        pred = float(scaled @ np.array(coefs) + intercept)
        return max(0, pred)

    # Fallback: dow consumption pattern
    dow_consumption = model.get('dowConsumption', [])
    avg = model.get('avgDailyConsumption', 1.0)
    if dow_consumption:
        dow = datetime.fromtimestamp(ts / 1000).weekday()
        consumption = dow_consumption[dow] * (0.85 + np.random.random() * 0.3)
    else:
        consumption = avg
    last_qty = history[-1]
    return max(0, last_qty - consumption)


def predict_stock(series, horizon_days=14, train_ratio=0.8):
    series = sorted(series, key=lambda x: x['timestamp'])
    timestamps = [s['timestamp'] for s in series]
    quantities = [s['quantity'] for s in series]
    n = len(series)

    # Hitung dow consumption (untuk fallback + summary)
    daily_deltas = []
    dow_deltas = [[] for _ in range(7)]
    for i in range(1, n):
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

    # Feature engineering
    X, y = build_features(quantities, timestamps)

    if len(X) < 5:
        return {
            'error': 'Data setelah feature engineering < 5 titik',
            'source': 'mlr-numpy',
        }

    # Train/test split kronologis
    split_idx = max(2, int(len(X) * train_ratio))
    X_train, X_test = X[:split_idx], X[split_idx:]
    y_train, y_test = y[:split_idx], y[split_idx:]

    # StandardScaler (fit on train)
    sm_mean, sm_std = fit_scaler(X_train)
    X_train_s = transform_scaler(X_train, sm_mean, sm_std)
    X_test_s = transform_scaler(X_test, sm_mean, sm_std) if len(X_test) > 0 else None

    # Fit OLS
    intercept, coefs = ols_fit(X_train_s, y_train)

    # Evaluate
    if X_test_s is not None and len(X_test_s) > 0:
        y_pred_test = X_test_s @ coefs + intercept
        mae = float(np.mean(np.abs(y_test - y_pred_test)))
        rmse = float(np.sqrt(np.mean((y_test - y_pred_test) ** 2)))
        ss_res = float(np.sum((y_test - y_pred_test) ** 2))
        ss_tot = float(np.sum((y_test - np.mean(y_test)) ** 2))
        r2 = 1 - ss_res / ss_tot if ss_tot > 0 else 0.0
    else:
        y_pred_train = X_train_s @ coefs + intercept
        mae = float(np.mean(np.abs(y_train - y_pred_train)))
        rmse = float(np.sqrt(np.mean((y_train - y_pred_train) ** 2)))
        ss_res = float(np.sum((y_train - y_pred_train) ** 2))
        ss_tot = float(np.sum((y_train - np.mean(y_train)) ** 2))
        r2 = 1 - ss_res / ss_tot if ss_tot > 0 else 0.0

    # Iterative forecast
    model_state = {
        'intercept': float(intercept),
        'coefficients': coefs.tolist(),
        'scaler_mean': sm_mean.tolist(),
        'scaler_std': sm_std.tolist(),
        'dowConsumption': dow_consumption,
        'avgDailyConsumption': avg_daily,
    }

    last_qty = quantities[-1]
    last_ts = timestamps[-1]
    history = list(quantities)
    forecast = []
    prev_qty = last_qty

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

    # Stockout estimation
    stockout_date = None
    if avg_daily > 0 and last_qty > 0:
        days_left = last_qty / avg_daily
        stockout_ts = datetime.now() + timedelta(days=days_left)
        stockout_date = stockout_ts.strftime('%Y-%m-%d')

    return {
        'source': 'mlr-numpy',
        'model': {
            'type': 'Multi Linear Regression + StandardScaler',
            'intercept': round(float(intercept), 4),
            'slope': round(-avg_daily, 4),  # backward compat
            'avgDailyConsumption': round(avg_daily, 2),
            'dowConsumption': [round(d, 2) for d in dow_consumption],
            'n': int(split_idx),
            'coefficients': [round(float(c), 4) for c in coefs],
            'featureNames': FEATURE_NAMES,
            'scalerMean': [round(float(m), 4) for m in sm_mean],
            'scalerStd': [round(float(s), 4) for s in sm_std],
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
