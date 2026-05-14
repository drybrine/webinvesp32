# =============================================================================
# Stock Forecasting Model - Linear Regression
# Test di Google Colab
# Project: StokManager (webinvesp32)
# =============================================================================

import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from datetime import datetime, timedelta
import warnings
warnings.filterwarnings('ignore')

# =============================================================================
# 1. DUMMY DATA - Produk & History Transaksi
# =============================================================================

# Daftar produk
products = [
    {"id": "P001", "name": "76 Apel", "barcode": "8991906106250", "category": "Rokok", "price": 15000, "minStock": 5, "currentQty": 23},
    {"id": "P002", "name": "Indomie Goreng", "barcode": "8996001600016", "category": "Makanan", "price": 3500, "minStock": 10, "currentQty": 45},
    {"id": "P003", "name": "Aqua 600ml", "barcode": "8886008101053", "category": "Minuman", "price": 4000, "minStock": 15, "currentQty": 12},
    {"id": "P004", "name": "Teh Pucuk 350ml", "barcode": "8996001600108", "category": "Minuman", "price": 4500, "minStock": 10, "currentQty": 38},
    {"id": "P005", "name": "Roti Sari Roti Coklat", "barcode": "8992907777010", "category": "Makanan", "price": 7500, "minStock": 8, "currentQty": 5},
    {"id": "P006", "name": "Sabun Lifebuoy", "barcode": "8999999527273", "category": "Toiletries", "price": 3000, "minStock": 5, "currentQty": 30},
    {"id": "P007", "name": "Minyak Goreng Bimoli 1L", "barcode": "8991102221015", "category": "Bahan Pokok", "price": 18000, "minStock": 5, "currentQty": 8},
    {"id": "P008", "name": "Gula Pasir 1kg", "barcode": "8991102331012", "category": "Bahan Pokok", "price": 15000, "minStock": 3, "currentQty": 15},
]

products_df = pd.DataFrame(products)
print("=" * 60)
print("  DAFTAR PRODUK")
print("=" * 60)
print(products_df[["id", "name", "category", "price", "currentQty", "minStock"]].to_string(index=False))
print()

# Generate history transaksi 60 hari terakhir
np.random.seed(42)
base_date = datetime.now() - timedelta(days=60)

def generate_transactions(product, days=60):
    """Generate realistic transaction history for a product."""
    transactions = []
    qty = product["currentQty"] + np.random.randint(20, 50)  # stok awal lebih tinggi

    for day in range(days):
        date = base_date + timedelta(days=day)

        # Pola: weekday lebih ramai, weekend lebih sepi
        is_weekend = date.weekday() >= 5
        base_out = np.random.poisson(2 if is_weekend else 3)

        # Kadang ada restock (in)
        restock = 0
        if qty < product["minStock"] * 2 and np.random.random() < 0.3:
            restock = np.random.randint(10, 30)

        # Stock out
        out_qty = min(base_out, qty)
        qty -= out_qty
        if out_qty > 0:
            transactions.append({
                "productId": product["id"],
                "productName": product["name"],
                "productBarcode": product["barcode"],
                "type": "out",
                "quantity": out_qty,
                "date": date,
                "timestamp": int(date.timestamp() * 1000),
                "operator": np.random.choice(["ESP32 Scanner", "Dashboard"]),
                "stockAfter": qty,
            })

        # Stock in (restock)
        if restock > 0:
            qty += restock
            transactions.append({
                "productId": product["id"],
                "productName": product["name"],
                "productBarcode": product["barcode"],
                "type": "in",
                "quantity": restock,
                "date": date,
                "timestamp": int(date.timestamp() * 1000) + 3600000,
                "operator": "Dashboard",
                "stockAfter": qty,
            })

    return transactions, qty

all_transactions = []
for product in products:
    txs, final_qty = generate_transactions(product)
    all_transactions.extend(txs)
    product["currentQty"] = final_qty  # update to match generated history

transactions_df = pd.DataFrame(all_transactions)
transactions_df = transactions_df.sort_values("timestamp").reset_index(drop=True)

print("=" * 60)
print(f"  HISTORY TRANSAKSI ({len(transactions_df)} records, 60 hari)")
print("=" * 60)
print(transactions_df.head(15).to_string(index=False))
print(f"\n... ({len(transactions_df)} total transaksi)")
print()

# =============================================================================
# 2. REKONSTRUKSI TIME SERIES STOK HARIAN
# =============================================================================

def build_daily_stock_series(product_id, transactions_df, current_qty):
    """Rekonstruksi level stok harian dari history transaksi."""
    txs = transactions_df[transactions_df["productId"] == product_id].copy()
    if txs.empty:
        return pd.DataFrame()

    txs["date_only"] = txs["date"].dt.date

    # Hitung delta per hari
    daily_delta = txs.groupby("date_only").apply(
        lambda g: g.apply(
            lambda row: row["quantity"] if row["type"] == "in" else -row["quantity"],
            axis=1
        ).sum()
    ).reset_index()
    daily_delta.columns = ["date", "delta"]

    # Rekonstruksi mundur dari current_qty
    total_delta = daily_delta["delta"].sum()
    start_qty = current_qty - total_delta

    daily_delta = daily_delta.sort_values("date").reset_index(drop=True)
    daily_delta["quantity"] = start_qty + daily_delta["delta"].cumsum()
    daily_delta["timestamp"] = pd.to_datetime(daily_delta["date"])

    return daily_delta[["timestamp", "quantity"]]


# =============================================================================
# 3. MODEL LINEAR REGRESSION + EVALUASI
# =============================================================================

def train_and_evaluate(series, product_name, train_ratio=0.8, horizon_days=14):
    """Train linear regression, evaluate, dan forecast."""
    if len(series) < 3:
        print(f"  ⚠ {product_name}: data kurang (hanya {len(series)} titik)")
        return None

    # Feature: hari ke-N sejak awal
    series = series.sort_values("timestamp").reset_index(drop=True)
    series["day"] = (series["timestamp"] - series["timestamp"].iloc[0]).dt.days

    X = series["day"].values.reshape(-1, 1)
    y = series["quantity"].values

    # Train/test split kronologis
    split_idx = max(2, int(len(series) * train_ratio))
    X_train, X_test = X[:split_idx], X[split_idx:]
    y_train, y_test = y[:split_idx], y[split_idx:]

    # Fit model
    model = LinearRegression()
    model.fit(X_train, y_train)

    # Evaluate
    if len(X_test) > 0:
        y_pred_test = model.predict(X_test)
        mae = mean_absolute_error(y_test, y_pred_test)
        rmse = np.sqrt(mean_squared_error(y_test, y_pred_test))
        r2 = r2_score(y_test, y_pred_test)
    else:
        y_pred_train = model.predict(X_train)
        mae = mean_absolute_error(y_train, y_pred_train)
        rmse = np.sqrt(mean_squared_error(y_train, y_pred_train))
        r2 = r2_score(y_train, y_pred_train)

    # Forecast
    last_day = int(X[-1][0])
    forecast_days = np.arange(last_day + 1, last_day + horizon_days + 1).reshape(-1, 1)
    forecast_qty = model.predict(forecast_days)
    forecast_qty = np.maximum(forecast_qty, 0)  # clamp ke 0

    forecast_dates = [series["timestamp"].iloc[-1] + timedelta(days=i+1) for i in range(horizon_days)]

    # Stockout estimation
    stockout_date = None
    if model.coef_[0] < 0:
        days_to_zero = -model.intercept_ / model.coef_[0]
        if days_to_zero > last_day:
            stockout_date = series["timestamp"].iloc[0] + timedelta(days=int(days_to_zero))

    return {
        "product": product_name,
        "model": model,
        "slope": model.coef_[0],
        "intercept": model.intercept_,
        "n_train": len(X_train),
        "n_test": len(X_test),
        "mae": mae,
        "rmse": rmse,
        "r2": r2,
        "series": series,
        "forecast_dates": forecast_dates,
        "forecast_qty": forecast_qty,
        "stockout_date": stockout_date,
    }


# =============================================================================
# 4. JALANKAN MODEL UNTUK SEMUA PRODUK
# =============================================================================

print("=" * 60)
print("  HASIL MODEL LINEAR REGRESSION")
print("=" * 60)

results = []
for product in products:
    series = build_daily_stock_series(product["id"], transactions_df, product["currentQty"])
    if series.empty:
        continue
    result = train_and_evaluate(series, product["name"])
    if result:
        results.append(result)
        print(f"\n  📦 {result['product']}")
        print(f"     Slope     : {result['slope']:.4f} unit/hari")
        print(f"     Intercept : {result['intercept']:.2f}")
        print(f"     n_train   : {result['n_train']}, n_test: {result['n_test']}")
        print(f"     MAE       : {result['mae']:.3f}")
        print(f"     RMSE      : {result['rmse']:.3f}")
        print(f"     R²        : {result['r2']:.3f}")
        if result['stockout_date']:
            days_left = (result['stockout_date'] - datetime.now()).days
            print(f"     ⚠ Stockout : {result['stockout_date'].strftime('%Y-%m-%d')} ({days_left} hari lagi)")
        else:
            print(f"     ✓ Stockout : Tidak diprediksi (tren tidak menurun)")


# =============================================================================
# 5. VISUALISASI
# =============================================================================

print("\n" + "=" * 60)
print("  VISUALISASI")
print("=" * 60)

# Plot semua produk
n_products = len(results)
fig, axes = plt.subplots(n_products, 1, figsize=(14, 4 * n_products), sharex=False)
if n_products == 1:
    axes = [axes]

for idx, result in enumerate(results):
    ax = axes[idx]
    series = result["series"]

    # Historical
    ax.plot(series["timestamp"], series["quantity"], 'b-o', markersize=3, label="Historis", linewidth=1.5)

    # Trend line (full range)
    X_full = series["day"].values.reshape(-1, 1)
    y_trend = result["model"].predict(X_full)
    ax.plot(series["timestamp"], y_trend, 'r--', alpha=0.5, label=f"Trend (slope={result['slope']:.2f}/hari)")

    # Forecast
    ax.plot(result["forecast_dates"], result["forecast_qty"], 'g--s', markersize=4, label="Forecast 14 hari", linewidth=2)

    # Min stock line
    product = next(p for p in products if p["name"] == result["product"])
    ax.axhline(y=product["minStock"], color='orange', linestyle=':', label=f"Min Stock ({product['minStock']})")

    # Stockout marker
    if result["stockout_date"]:
        ax.axvline(x=result["stockout_date"], color='red', linestyle='--', alpha=0.7, label=f"Stockout ~{result['stockout_date'].strftime('%d %b')}")

    ax.set_title(f"{result['product']} | R²={result['r2']:.3f} | MAE={result['mae']:.2f}", fontsize=11, fontweight='bold')
    ax.set_ylabel("Stok (unit)")
    ax.legend(loc="upper right", fontsize=8)
    ax.grid(True, alpha=0.3)
    ax.set_ylim(bottom=0)

plt.xlabel("Tanggal")
plt.tight_layout()
plt.savefig("stock_forecast_results.png", dpi=150, bbox_inches='tight')
plt.show()
print("\n✅ Chart disimpan ke: stock_forecast_results.png")


# =============================================================================
# 6. TABEL FORECAST 14 HARI
# =============================================================================

print("\n" + "=" * 60)
print("  FORECAST 14 HARI KE DEPAN")
print("=" * 60)

for result in results:
    product = next(p for p in products if p["name"] == result["product"])
    print(f"\n  📦 {result['product']} (stok sekarang: {product['currentQty']})")
    print(f"  {'Tanggal':<12} {'Prediksi':>10} {'Status':<15}")
    print(f"  {'-'*12} {'-'*10} {'-'*15}")
    for date, qty in zip(result["forecast_dates"], result["forecast_qty"]):
        status = ""
        if qty <= 0:
            status = "❌ HABIS"
        elif qty <= product["minStock"]:
            status = "⚠️ RENDAH"
        else:
            status = "✓ Aman"
        print(f"  {date.strftime('%Y-%m-%d'):<12} {qty:>10.1f} {status:<15}")


# =============================================================================
# 7. RINGKASAN RISIKO
# =============================================================================

print("\n" + "=" * 60)
print("  RINGKASAN RISIKO STOCKOUT")
print("=" * 60)
print(f"\n  {'Produk':<25} {'Tren/hari':>10} {'R²':>6} {'Stockout':>12} {'Hari Lagi':>10}")
print(f"  {'-'*25} {'-'*10} {'-'*6} {'-'*12} {'-'*10}")

for result in sorted(results, key=lambda r: r['slope']):
    days_left = ""
    stockout_str = "-"
    if result["stockout_date"]:
        dl = (result["stockout_date"] - datetime.now()).days
        days_left = str(dl)
        stockout_str = result["stockout_date"].strftime("%Y-%m-%d")

    print(f"  {result['product']:<25} {result['slope']:>+10.2f} {result['r2']:>6.3f} {stockout_str:>12} {days_left:>10}")

print("\n" + "=" * 60)
print("  SELESAI")
print("=" * 60)
