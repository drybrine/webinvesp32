# StokManager

Sistem Manajemen Inventaris Real-time berbasis Next.js + Firebase dengan integrasi ESP32 Barcode Scanner dan prediksi stok menggunakan Linear Regression.

Updated: 2026-05-17

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

### Manajemen Inventaris
- Real-time barcode scanning dengan ESP32 GM67
- CRUD produk + stock adjustment (tambah/kurangi) via dashboard
- Transaksi otomatis tercatat saat stock in/out (manual maupun scanner)
- Filter transaksi berdasarkan sumber: Manual (Dashboard) / Scanner ESP32
- Export data ke CSV

### Prediksi Stok (Linear Regression)
- Halaman `/prediksi` — pilih item, atur horizon 1-90 hari
- Model OLS dengan lag features (lag1/3/7), rolling mean, day-of-week pattern
- Iterative forecast (stok turun realistis per hari, bukan garis lurus)
- Python serverless API (`/api/predict`) dengan numpy OLS, fallback ke client-side
- Kartu ringkas di dashboard: top-3 barang paling berisiko stockout
- Notifikasi otomatis saat prediksi habis ≤ 7 hari
- Badge sumber prediksi: "numpy-ols (server)" atau "client-side"

### Device Management (ESP32)
- Monitoring realtime via Firebase `onValue` listener (bukan polling)
- Deteksi online/offline dalam ~16 detik (threshold 15s, re-evaluasi tiap 3s)
- Battery level monitoring (voltage divider GPIO34, EMA smoothing)
- Notifikasi baterai rendah (<20%) otomatis
- OLED SSD1306 display: status, IP, scan result

### Teknologi

| Layer | Stack |
|-------|-------|
| Frontend | Next.js 16 (Turbopack), React 19, TypeScript, Tailwind, shadcn/ui |
| Backend | Firebase Realtime Database, Next.js API Routes, Python Serverless (numpy) |
| Hardware | ESP32 + GM67 Barcode Scanner + OLED SSD1306 + TP4056 + Li-ion |
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
    ├── /inventory/{id}       (produk: name, qty, price, barcode, minStock)
    ├── /devices/{id}         (status, lastSeen, batteryLevel, rssi, ip)
    ├── /scans/{id}           (barcode, deviceId, timestamp, processed)
    ├── /transactions/{id}    (type, qty, operator, reason, timestamp)
    └── /analytics            (totalScans, totalItems, lowStockAlerts)
    │
    ▼
Next.js Website (Vercel)
    ├── Dashboard             (inventaris, stock +/-, prediksi ringkas, device status)
    ├── /transaksi            (history, filter jenis/sumber/periode, export CSV)
    ├── /prediksi             (linear regression, chart SVG, forecast tabel)
    ├── /scan                 (manual barcode input)
    └── /api/predict          (Python serverless, numpy OLS)
```

### Data Flow
1. ESP32 scan barcode → POST ke `/scans` → popup muncul di website
2. User pilih Stock In/Out di popup → update `/inventory` + create `/transactions`
3. Website subscribe semua path via `onValue` → UI update realtime tanpa refresh
4. Prediksi: website POST ke `/api/predict` (Python) → fallback ke client-side TypeScript

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
- TP4056 Li-ion Charger
- Li-ion Battery 3.7V
- Voltage Divider: 2x 100kΩ (B+ → GPIO34 → GND)

### Wiring

```
ESP32              GM67 Scanner        OLED SSD1306       Battery Monitor
─────              ────────────        ────────────       ───────────────
GPIO16 (RX2)  ←    TX                 GPIO21 (SDA) ↔ SDA  B+ ── R1(100k) ── GPIO34
GPIO17 (TX2)  →    RX                 GPIO22 (SCL) ↔ SCL  GPIO34 ── R2(100k) ── GND
5V            →    VCC                3.3V         → VCC
GND           ←    GND                GND          ← GND
```

### Firmware
- File: `GM67_ESP32_BARCODESCANNER/GM67_ESP32_BARCODESCANNER.ino`
- Version: 6.1
- Mode: Inventory only (single mode)
- Heartbeat: tiap 8 detik ke Firebase `/devices/{id}`
- Battery: EMA smoothing, 10 samples, calibrated (MAX=3800mV, MIN=3000mV)
- Libraries: WiFi, WebServer, EEPROM, HTTPClient, ArduinoJson v6, Wire, Adafruit_GFX, Adafruit_SSD1306

## Prediksi Stok

### Model
Linear Regression (OLS) via normal equation (`numpy.linalg.lstsq`).

### Features
- `lag1`, `lag3`, `lag7` — stok hari sebelumnya
- `rolling_mean_7`, `rolling_std_7` — statistik 7 hari
- `day_of_week`, `is_weekend` — pola mingguan
- `day_number` — trend

### Endpoint
```
POST /api/predict
Body: { transactions: [...], currentQuantity: number, horizonDays: number }
Response: { forecast: [...], metrics: {mae, rmse, r2}, stockoutDate, model: {...} }
```

### Notebook Testing
```bash
# Google Colab (upload langsung)
scripts/stock_forecast_colab.ipynb

# Atau lokal
~/.jupyter-venv/bin/jupyter notebook scripts/stock_forecast_colab.ipynb
```

Dataset: 20 suku cadang Honda, 365 hari, realistic mix (promo/dead days/random variation).
Hasil: Test R² = 0.72, Gap < 0.05 (no overfitting).

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
- Python Function: `api/predict.py` (@vercel/python@4.3.1)

## Service Worker

`public/sw.js` caches static assets. Firebase Realtime Database traffic (`firebasedatabase.app`, `firebaseio.com`) di-exclude dari cache agar `onValue` listeners tetap realtime.

Setelah deploy baru, user mungkin perlu clear site data jika muncul chunk error dari cache lama.

## API Endpoints

| Method | Path | Fungsi |
|--------|------|--------|
| POST | `/api/predict` | Python OLS prediction (numpy) |
| POST | `/api/check-device-status` | Cek status device (legacy, tidak dipakai hook) |
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
