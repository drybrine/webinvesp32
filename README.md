# StokManager

Sistem Manajemen Inventory Real-time berbasis Next.js + Firebase dengan integrasi ESP32 Barcode Scanner dan prediksi stok menggunakan Simple Linear Regression.

Updated: 2026-06-11

[![Next.js](https://img.shields.io/badge/Next.js-16.2.6-black)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.1.0-blue)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8.3-blue)](https://www.typescriptlang.org/)
[![Firebase](https://img.shields.io/badge/Firebase-11.10.0-orange)](https://firebase.google.com/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.4.17-06B6D4)](https://tailwindcss.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

**Production:** https://stokmanager.app

## Quick Start

```bash
git clone https://github.com/drybrine/webinvesp32.git
cd webinvesp32
cp .env.example .env.local
npm install
npm run dev
```

Buka http://localhost:3000

## Fitur Utama

### Manajemen Inventory
- Real-time barcode scanning dengan ESP32 GM67
- CRUD produk + stock adjustment (tambah/kurangi) via dashboard
- Edit item di dashboard dapat mengubah metadata produk termasuk `minStock` / stok minimum
- Popup ESP32 untuk barcode belum terdaftar dapat langsung tambah produk baru dengan field inventory utama: `barcode`, `name`, `category`, `quantity`, `minStock`, `price`, dan `location`
- **Atomic stock update** — server-side `increment()` + transaksi dalam satu multi-path update, anti race condition (scanner + dashboard + multi-tab tidak saling menimpa)
- Transaksi otomatis tercatat saat stock in/out (manual maupun scanner)
- Search, filter kategori, dan sorting inventory di dashboard
- Filter transaksi berdasarkan sumber: Manual (Dashboard) / Scanner ESP32
- **Barcode PDF417 (2D)** — render via bwip-js, dapat di-scan GM67
- Export data ke CSV
- Pagination 50 transaksi per halaman

### Prediksi Stok (Simple Linear Regression)
- Halaman `/prediksi` — pilih item, atur horizon 1-90 hari
- Model: regresi linear sederhana `Y = a + bX` (pure Python, no numpy)
- Target model: `Y = konsumsi hari ini`, `X = konsumsi hari sebelumnya`
- Pipeline: level stok → raw consumption → EMA(α=0.05) → OLS lag-1 consumption
- Iterative forecast: prediksi konsumsi harian → kurangi stok saat ini
- Train ratio 85/15 untuk split kronologis
- Avg R² = 0.8962, 20/20 item R² positif (dataset dummy 20 suku cadang Honda, 365 hari)
- UI `/prediksi` menampilkan parameter model, grafik SVG historis + forecast, tabel forecast, dan testing model
- Grafik prediksi detail: zona forecast, zona stok minimum, tooltip titik data, status aman/rendah/habis, ringkasan titik historis/forecast
- Card `Perkiraan Habis` di `/prediksi` dihitung dari titik forecast pertama yang `predictedQuantity <= 0`, agar tanggalnya sama dengan grafik dan tabel forecast
- Kartu ringkas di dashboard: top-3 barang paling berisiko stockout (server-side batch)
- Notifikasi otomatis saat prediksi habis ≤ 7 hari
- Badge sumber prediksi: "Linear Regression (server/client)"
- Notebook seminar: replikasi model website dengan validasi MAE, RMSE, MAPE, dan R²

### Device Management (ESP32)
- Monitoring realtime via Firebase `onValue` listener (bukan polling)
- Deteksi online/offline dalam ~16 detik (threshold 15s, re-evaluasi tiap 3s)
- Battery level monitoring (voltage divider GPIO34, `esp_adc_cal` eFuse Vref, EMA + hysteresis ±2%)
- Battery icon + WiFi signal icon di OLED display
- Notifikasi baterai rendah (<20%) otomatis
- OLED SSD1306 display: status, IP, RSSI, battery, scan count

### Teknologi

| Layer | Stack |
|-------|-------|
| Frontend | Next.js 16 (Turbopack), React 19, TypeScript, Tailwind, shadcn/ui |
| Backend | Firebase Realtime Database, Next.js API Routes, Python Serverless (pure Python OLS) |
| Barcode | bwip-js (PDF417 2D render) |
| Hardware | ESP32 + GM67 Barcode Scanner + OLED SSD1306 + TP4056 + Li-Po LP902040 |
| Deploy | Vercel (auto-deploy dari branch `555`) |

## Arsitektur

```
ESP32 GM67 Scanner
    │
    ├── PUT /devices/{id}     (heartbeat tiap 8s + batteryLevel)
    ├── POST /scans/{id}      (barcode scan event)
    └── GET /inventory        (lookup produk by barcode)
    │
    ▼
Firebase Realtime Database
    │
    ├── /inventory/{id}       (produk: barcode, name, category, quantity, minStock, price, location, timestamps)
    ├── /devices/{id}         (status, lastSeen, batteryLevel, rssi, ip)
    ├── /scans/{id}           (barcode, deviceId, timestamp, processed)
    ├── /transactions/{id}    (type, qty, operator, reason, timestamp)
    └── /analytics            (totalScans, totalItems, lowStockAlerts)
    │
    ▼
Next.js Website (Vercel)
    ├── Dashboard             (inventaris, stock +/-, prediksi ringkas, device status)
    ├── /transaksi            (history, filter jenis/sumber/periode, export CSV, pagination)
    ├── /prediksi             (detailed SVG Linear Regression chart, forecast tabel, metrics)
    ├── /scan                 (manual barcode input)
    └── /api/predict          (Python serverless, Simple Linear Regression)
```

### Data Flow
1. ESP32 scan barcode → POST ke `/scans` → popup muncul di website
2. Jika barcode belum terdaftar, popup dapat membuat `/inventory/{id}` baru dengan schema inventory utama + transaksi stok awal
3. User pilih Stock In/Out di popup → atomic update: `increment()` ke `/inventory` + create `/transactions` dalam satu multi-path write
4. Website subscribe semua path via `onValue` → UI update realtime tanpa refresh
5. Prediksi: website POST ke `/api/predict` (Python) → forecast + metrics

## Environment Variables

Buat `.env.local` dari `.env.example`:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=xxx
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=xxx.firebaseapp.com
NEXT_PUBLIC_FIREBASE_DATABASE_URL=https://xxx.firebasedatabase.app
NEXT_PUBLIC_FIREBASE_PROJECT_ID=xxx
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=xxx.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=xxx
NEXT_PUBLIC_FIREBASE_APP_ID=xxx
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=xxx
```

`scripts/check-env.js` memvalidasi env vars sebelum dev server start.

## Scripts

```bash
npm run dev        # Turbopack dev server (:3000)
npm run build      # Production build (Turbopack)
npm run start      # Serve production build
npm run lint       # ESLint
npm run check-env  # Validate Firebase env vars
```

## ESP32 Hardware

### Komponen
- ESP32 DevKit V1
- GM67 Barcode Scanner (UART: RX=GPIO16, TX=GPIO17)
- OLED SSD1306 128x64 (I2C: SDA=GPIO21, SCL=GPIO22)
- TP4056 Li-Po Charger
- Li-Po Battery LP902040 3.7V 700mAh (PCM)
- Voltage Divider: 2x 100kΩ + kapasitor 100nF (B+ → GPIO34 → GND)

### Wiring

```
ESP32              GM67 Scanner        OLED SSD1306       Battery Monitor
─────              ────────────        ────────────       ───────────────
GPIO16 (RX2)  ←    TX                 GPIO21 (SDA) ↔ SDA  B+ ── R1(100k) ── GPIO34
GPIO17 (TX2)  →    RX                 GPIO22 (SCL) ↔ SCL  GPIO34 ── R2(100k) ── GND
5V            →    VCC                3.3V         → VCC  C(100nF) antara GPIO34 & GND
GND           ←    GND                GND          ← GND
```

### Firmware
- File: `GM67_ESP32_BARCODESCANNER/GM67_ESP32_BARCODESCANNER.ino`
- Version: 6.1
- Mode: Inventory only (single mode)
- Heartbeat: tiap 8 detik ke Firebase `/devices/{id}`
- Battery: `esp_adc_cal` eFuse Vref + EMA(α=0.05) + hysteresis ±2%, MIN=3200mV, MAX=3800mV
- OLED: battery icon (4-bar) + WiFi signal icon (4-bar RSSI)
- Boot time: ~3 detik (`WiFi.persistent(false)`, delay minimal)
- Libraries: WiFi, WebServer, EEPROM, HTTPClient, ArduinoJson v6, Wire, Adafruit_GFX, Adafruit_SSD1306, esp_adc_cal, driver/adc

## Prediksi Stok

### Model
Simple Linear Regression (OLS) dengan persamaan `Y = a + bX`. Model memprediksi konsumsi harian, bukan langsung level stok:

- `X` = konsumsi hari sebelumnya
- `Y` = konsumsi hari ini

Implementasi pure Python — tidak pakai numpy agar fit dalam Vercel 250MB serverless limit.

### Pipeline
```
1. Transaksi → daily stock series
2. Level → raw consumption (clip restock ke 0)
3. EMA smoothing (alpha=0.05) → smoothed consumption
4. Linear Regression: `consumption_today = a + b * consumption_yesterday`
5. Iterative forecast: predict consumption → kurangi dari current_stock
```

### Kenapa EMA + Consumption?
Training langsung pada level stok membuat forecast regresi linear menjadi garis lurus dan mudah terdistraksi event restock. Training pada konsumsi smoothed menjaga metodologi tetap Simple Linear Regression, tetapi forecast stok dihitung iteratif sehingga grafik tidak dipaksa menjadi garis lurus.

### Grafik Website
`components/prediction-chart.tsx` memakai SVG native, bukan Recharts. Grafik menampilkan 30 hari historis terakhir, forecast sesuai horizon, zona stok minimum, area forecast, tooltip hover/focus, status titik data, dan ringkasan jumlah titik historis/forecast.

Card `Perkiraan Habis` pada `/prediksi` mengikuti forecast yang tampil di grafik/tabel: cari titik pertama pada `prediction.forecast` dengan `predictedQuantity <= 0`. API `stockoutDate` juga dihitung dari timestamp histori terakhir agar konsisten dengan forecast.

### Performa (dataset uji)
- 20 suku cadang Honda AHASS, 365 hari, 6736 transaksi
- Avg R² = 0.8962, R² > 0: 20/20 item
- Test command: `npx tsx scripts/generate-honda-dummy.ts --test`

### Endpoint
```
POST /api/predict
Body (single): { transactions, currentQuantity, horizonDays, trainRatio }
Body (batch):  { mode: 'batch', items, transactions, horizonDays, topN, recentDays }
Response: { forecast, metrics: {mae, rmse, r2}, stockoutDate, source }
```

Source response: `lr-consumption-py` atau `lr-consumption-batch`.

### Notebook Testing
```bash
# Google Colab (upload langsung)
scripts/model_prediksi_stok_linear_regression.ipynb  # model website + Firebase export + MAE/RMSE/MAPE/R²
scripts/honda_tune_model.ipynb      # model tuning (TSCV, alpha, features)
scripts/stock_forecast_colab.ipynb  # original notebook

# Jalankan script CLI model website
npx tsx scripts/test-stock-prediction.ts --export barcodescanesp32-default-rtdb-export.json

# Generate dummy data
npx tsx scripts/generate-honda-dummy.ts --test
npx tsx scripts/generate-honda-dummy.ts --output honda-dummy.json
```

## Deployment

### Vercel (Production)
```bash
vercel login
vercel link
vercel --prod
```

Set environment variables di Vercel Dashboard → Project Settings → Environment Variables.

### Build Settings (auto-detected)
- Framework: Next.js
- Build Command: `npm run build`
- Output: `.next`
- Python Function: `api/predict.py` (@vercel/python, pure Python no numpy)

## Service Worker

`public/sw.js` caches static assets. Firebase Realtime Database traffic (`firebasedatabase.app`, `firebaseio.com`) di-exclude dari cache agar `onValue` listeners tetap realtime.

## API Endpoints

| Method | Path | Fungsi |
|--------|------|--------|
| POST | `/api/predict` | Python Simple Linear Regression prediction — single item atau batch (`mode: 'batch'`) |
| POST | `/api/check-device-status` | Cek status device (legacy) |
| POST | `/api/barcode-scan` | Process barcode scan |
| GET | `/api/devices-status` | Get all device status |
| GET | `/api/current-page` | ESP32 page mode detection |
| GET | `/api/firebase-init` | Firebase config check |
| GET | `/api/firebase-rules` | Get database rules |
| GET | `/api/heartbeat` | Health check |

## License

MIT License - see [LICENSE](LICENSE).

---

Made by [drybrine](https://github.com/drybrine) — IoT + Web Technologies for Smart Inventory Management
