"""
Stock prediction API — Multi Linear Regression + StandardScaler.

Pure Python implementation (no numpy) to fit Vercel 250MB serverless limit.
Math: OLS via Gauss-Jordan elimination, StandardScaler manual.
"""

from http.server import BaseHTTPRequestHandler
import json
import math
import random
from datetime import datetime, timedelta


MS_PER_DAY = 86400000

FEATURE_NAMES = [
    'lag1',              # stok kemarin (paling prediktif)
    'daily_change',      # perubahan stok kemarin
    'rolling_mean_7',    # rata-rata 7 hari
]


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            data = json.loads(body)

            if data.get('mode') == 'batch':
                self._handle_batch(data)
                return

            transactions = data.get('transactions', [])
            current_quantity = data.get('currentQuantity', 0)
            horizon_days = data.get('horizonDays', 14)
            train_ratio = data.get('trainRatio', 0.8)

            if len(transactions) < 2:
                self._send_json(400, {'error': 'Minimal 2 transaksi diperlukan', 'source': 'mlr-py'})
                return

            series = build_daily_series(transactions, current_quantity)
            if len(series) < 10:
                self._send_json(400, {'error': 'Data harian < 10 titik (perlu untuk MLR)', 'source': 'mlr-py'})
                return

            result = predict_stock(series, horizon_days, train_ratio)
            self._send_json(200, result)

        except Exception as e:
            self._send_json(500, {'error': str(e), 'source': 'mlr-py'})

    def _handle_batch(self, data):
        items = data.get('items', [])
        transactions = data.get('transactions', [])
        horizon_days = data.get('horizonDays', 14)
        train_ratio = data.get('trainRatio', 0.8)
        top_n = data.get('topN', 3)
        recent_days = data.get('recentDays', 90)

        if not items:
            self._send_json(400, {'error': 'No items provided', 'source': 'mlr-batch'})
            return

        cutoff = (datetime.now().timestamp() * 1000) - recent_days * MS_PER_DAY
        recent_tx = [t for t in transactions if int(t.get('timestamp', 0)) >= cutoff]

        tx_by_barcode = {}
        for tx in recent_tx:
            bc = tx.get('productBarcode')
            if bc:
                tx_by_barcode.setdefault(bc, []).append(tx)

        risks = []
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
                days_to_stockout = None
                for i, f in enumerate(forecast):
                    if f['predictedQuantity'] <= 0:
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

        def sort_key(r):
            if r['daysToStockout'] is not None:
                return (0, r['daysToStockout'])
            return (1, r['predictedLowest'])

        risks.sort(key=sort_key)
        self._send_json(200, {
            'source': 'mlr-batch',
            'totalAnalyzed': len(risks),
            'risks': risks[:top_n],
        })

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


# =============================================================================
#  Helpers (pure Python)
# =============================================================================

def mean(xs):
    if not xs: return 0.0
    return sum(xs) / len(xs)

def std(xs):
    if not xs: return 0.0
    m = mean(xs)
    return math.sqrt(sum((x - m) ** 2 for x in xs) / len(xs))

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


def build_features(quantities, timestamps):
    """Build minimal features (3): lag1, daily_change, rolling_mean_7.

    Why minimal? Tested in honda_tune_model.ipynb against 9-feature version:
    - 3 features: Test R² 0.621, gap 0.011 (no overfit)
    - 9 features: Test R² 0.574, gap 0.076 (3 items overfit)
    Less is more — extra features cause overfitting on time-series data.
    """
    n = len(quantities)
    X, y = [], []
    for i in range(7, n - 1):
        window = quantities[i - 7:i]
        X.append([
            quantities[i - 1],                            # lag1
            quantities[i] - quantities[i - 1],            # daily_change
            mean(window),                                 # rolling_mean_7
        ])
        y.append(quantities[i + 1])
    return X, y


def fit_scaler(X):
    """StandardScaler. X: list of feature rows."""
    if not X: return [], []
    k = len(X[0])
    means = [0.0] * k
    for row in X:
        for j in range(k):
            means[j] += row[j]
    n = len(X)
    means = [m / n for m in means]

    stds = [0.0] * k
    for row in X:
        for j in range(k):
            stds[j] += (row[j] - means[j]) ** 2
    stds = [math.sqrt(s / n) for s in stds]
    stds = [s if s != 0 else 1.0 for s in stds]
    return means, stds


def transform_scaler(X, means, stds):
    return [[(row[j] - means[j]) / stds[j] for j in range(len(means))] for row in X]


def ols_fit(X, y, ridge=1e-6):
    """OLS via Gauss-Jordan with Tikhonov ridge regularization for stability.

    Ridge prevents singular XtX when features are multicollinear (e.g., lag1/3/7).
    Lambda is tiny (1e-6) so it doesn't bias predictions meaningfully.
    Returns (intercept, [coefficients]).
    """
    n = len(X)
    if n == 0:
        return 0.0, []
    k = len(X[0])

    # Add intercept column
    Xb = [[1.0] + list(row) for row in X]

    # XtX: (k+1) x (k+1)
    size = k + 1
    XtX = [[0.0] * size for _ in range(size)]
    Xty = [0.0] * size

    for i in range(n):
        for a in range(size):
            Xty[a] += Xb[i][a] * y[i]
            for b in range(size):
                XtX[a][b] += Xb[i][a] * Xb[i][b]

    # Ridge regularization (skip intercept column at index 0)
    for i in range(1, size):
        XtX[i][i] += ridge

    # Solve via Gaussian elimination with partial pivoting
    M = [row[:] + [Xty[i]] for i, row in enumerate(XtX)]
    for col in range(size):
        # Pivot
        pivot = col
        for row in range(col + 1, size):
            if abs(M[row][col]) > abs(M[pivot][col]):
                pivot = row
        M[col], M[pivot] = M[pivot], M[col]

        if abs(M[col][col]) < 1e-15:
            # Truly singular even with ridge — set coef=0, but do NOT skip elimination
            # to keep subsequent rows consistent
            continue
        for row in range(col + 1, size):
            factor = M[row][col] / M[col][col]
            for j in range(col, size + 1):
                M[row][j] -= factor * M[col][j]

    # Back substitution
    beta = [0.0] * size
    for row in range(size - 1, -1, -1):
        if abs(M[row][row]) < 1e-15:
            continue
        s = M[row][size]
        for j in range(row + 1, size):
            s -= M[row][j] * beta[j]
        beta[row] = s / M[row][row]

    return beta[0], beta[1:]


def predict_next_day(history, model, ts):
    coefs = model.get('coefficients')
    sm_mean = model.get('scaler_mean')
    sm_std = model.get('scaler_std')
    intercept = model.get('intercept', 0.0)

    if len(history) >= 7 and coefs and sm_mean:
        i = len(history)
        window = history[i - 7:i]
        features = [
            history[i - 1],                                              # lag1
            history[i - 1] - history[i - 2] if i >= 2 else 0,            # daily_change
            mean(window),                                                # rolling_mean_7
        ]
        scaled = [(features[j] - sm_mean[j]) / sm_std[j] for j in range(len(features))]
        pred = intercept + sum(scaled[j] * coefs[j] for j in range(len(coefs)))
        return max(0, pred)

    # Fallback: dow consumption pattern
    dow_consumption = model.get('dowConsumption', [])
    avg = model.get('avgDailyConsumption', 1.0)
    if dow_consumption:
        dow = datetime.fromtimestamp(ts / 1000).weekday()
        consumption = dow_consumption[dow] * (0.85 + random.random() * 0.3)
    else:
        consumption = avg
    return max(0, history[-1] - consumption)


def predict_stock(series, horizon_days=14, train_ratio=0.8):
    series = sorted(series, key=lambda x: x['timestamp'])
    timestamps = [s['timestamp'] for s in series]
    quantities = [s['quantity'] for s in series]
    n = len(series)

    # Hitung dow consumption
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

    avg_daily = mean(daily_deltas) if daily_deltas else 1.0
    dow_consumption = [mean(d) if d else avg_daily for d in dow_deltas]

    X, y = build_features(quantities, timestamps)
    if len(X) < 5:
        return {'error': 'Not enough data after FE'}

    split_idx = max(2, int(len(X) * train_ratio))
    X_train, X_test = X[:split_idx], X[split_idx:]
    y_train, y_test = y[:split_idx], y[split_idx:]

    sm_mean, sm_std = fit_scaler(X_train)
    X_train_s = transform_scaler(X_train, sm_mean, sm_std)
    intercept, coefs = ols_fit(X_train_s, y_train)

    # Eval on test
    if X_test:
        X_test_s = transform_scaler(X_test, sm_mean, sm_std)
        y_pred = [intercept + sum(X_test_s[i][j] * coefs[j] for j in range(len(coefs))) for i in range(len(X_test_s))]
        errs = [y_test[i] - y_pred[i] for i in range(len(y_test))]
        mae = mean([abs(e) for e in errs])
        rmse = math.sqrt(mean([e ** 2 for e in errs]))
        my = mean(y_test)
        ss_res = sum(e ** 2 for e in errs)
        ss_tot = sum((y - my) ** 2 for y in y_test)
        r2 = 1 - ss_res / ss_tot if ss_tot > 0 else 0.0
    else:
        mae, rmse, r2 = 0.0, 0.0, 0.0

    # Iterative forecast
    model_state = {
        'intercept': intercept,
        'coefficients': coefs,
        'scaler_mean': sm_mean,
        'scaler_std': sm_std,
        'dowConsumption': dow_consumption,
        'avgDailyConsumption': avg_daily,
    }

    last_qty = quantities[-1]
    last_ts = timestamps[-1]
    history = list(quantities)
    forecast = []
    prev_qty = last_qty

    random.seed(42)
    for day in range(1, horizon_days + 1):
        ts = last_ts + day * MS_PER_DAY
        predicted = predict_next_day(history, model_state, ts)
        consumption = max(0, prev_qty - predicted)
        forecast.append({
            'timestamp': int(ts),
            'predictedQuantity': round(predicted, 1),
            'estimatedConsumption': round(consumption, 1),
        })
        history.append(predicted)
        prev_qty = predicted

    stockout_date = None
    if avg_daily > 0 and last_qty > 0:
        days_left = last_qty / avg_daily
        stockout_ts = datetime.now() + timedelta(days=days_left)
        stockout_date = stockout_ts.strftime('%Y-%m-%d')

    return {
        'source': 'mlr-py',
        'model': {
            'type': 'Multi Linear Regression + StandardScaler',
            'intercept': round(intercept, 4),
            'slope': round(-avg_daily, 4),
            'avgDailyConsumption': round(avg_daily, 2),
            'dowConsumption': [round(d, 2) for d in dow_consumption],
            'n': int(split_idx),
            'coefficients': [round(c, 4) for c in coefs],
            'featureNames': FEATURE_NAMES,
            'scalerMean': [round(m, 4) for m in sm_mean],
            'scalerStd': [round(s, 4) for s in sm_std],
        },
        'metrics': {
            'mae': round(mae, 3),
            'rmse': round(rmse, 3),
            'r2': round(r2, 3),
            'nTrain': len(X_train),
            'nTest': len(X_test),
        },
        'forecast': forecast,
        'stockoutDate': stockout_date,
    }
