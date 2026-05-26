# DESIGN.md — StokManager

Dokumen desain teknis sistem manajemen inventaris real-time berbasis IoT + Web.

---

## 1. Gambaran Sistem

StokManager adalah sistem manajemen inventaris untuk AHASS (Honda Authorized Service Station) yang menggabungkan:

- **Hardware**: ESP32 + GM67 Barcode Scanner + OLED SSD1306 + baterai Li-Po
- **Backend**: Firebase Realtime Database (sumber kebenaran tunggal)
- **Frontend**: Next.js 16 (App Router, Turbopack) di Vercel
- **ML**: Multi Linear Regression + EMA Smoothing untuk prediksi stockout

---

## 2. Arsitektur Sistem

```
┌─────────────────────────────────────────────────────────┐
│                     ESP32 GM67 Scanner                   │
│  GM67 (UART) → ESP32 → Firebase RTDB                    │
│  Heartbeat tiap 8s: /devices/{id}                       │
│  Scan event: POST /scans/{id}                           │
│  Lookup: GET /inventory/{barcode}                       │
└────────────────────────┬────────────────────────────────┘
                         │ HTTPS / Firebase REST API
                         ▼
┌─────────────────────────────────────────────────────────┐
│              Firebase Realtime Database                  │
│  /inventory/{id}     → produk (name, qty, price, ...)   │
│  /devices/{id}       → status, battery, rssi, ip        │
│  /scans/{id}         → barcode, deviceId, timestamp     │
│  /transactions/{id}  → type, qty, operator, reason      │
│  /analytics          → totalScans, totalItems, alerts   │
└────────────────────────┬────────────────────────────────┘
                         │ onValue listeners (realtime)
                         ▼
┌─────────────────────────────────────────────────────────┐
│              Next.js 16 Website (Vercel)                 │
│  Dashboard   → inventaris, stock ±, prediksi ringkas    │
│  /transaksi  → history, filter, export CSV, pagination  │
│  /prediksi   → MLR chart + forecast + metrics           │
│  /scan       → manual barcode input                     │
│  /api/*      → Next.js API Routes + Python serverless   │
└─────────────────────────────────────────────────────────┘
```

---

## 3. Hardware

### Komponen

| Komponen | Spesifikasi |
|----------|-------------|
| Mikrokontroler | ESP32 DevKit V1 |
| Barcode Scanner | GM67 (UART: RX=GPIO16, TX=GPIO17) |
| Display | OLED SSD1306 128×64 (I2C: SDA=GPIO21, SCL=GPIO22) |
| Charger | TP4056 Li-ion/Li-Po |
| Baterai | Li-Po LP902040 3.7V 700mAh (PCM) |
| Battery Monitor | Voltage divider 2×100kΩ + kapasitor 100nF → GPIO34 |

### Wiring

```
ESP32              GM67            OLED SSD1306       Battery Monitor
─────              ────            ────────────       ───────────────
GPIO16 (RX2)  ←   TX              GPIO21 (SDA) ↔ SDA  B+ ─ R1(100k) ─ GPIO34
GPIO17 (TX2)  →   RX              GPIO22 (SCL) ↔ SCL  GPIO34 ─ R2(100k) ─ GND
5V            →   VCC             3.3V         → VCC  C(100nF) antara GPIO34 & GND
GND           ←   GND             GND          ← GND
```

### Battery Monitoring

- ADC kalibrasi via `esp_adc_cal` (eFuse Vref) + `driver/adc.h`
- EMA alpha=0.05 untuk smoothing antar heartbeat
- Hysteresis ±2% — hanya update jika perubahan ≥2%
- `sampleBattery()` dipanggil **sebelum** HTTP request (hindari voltage sag WiFi)
- Range: `BATTERY_MIN_MV=3200` (PCM cut-off LP902040), `BATTERY_MAX_MV=3800`

---

## 4. Firmware

**File**: `GM67_ESP32_BARCODESCANNER/GM67_ESP32_BARCODESCANNER.ino`  
**Version**: 6.1

### Flow Utama

```
Boot (~3 detik)
  → initOLED → oledShowBoot (500ms)
  → loadWiFiConfig (EEPROM)
  → WiFi.persistent(false) + connectToWiFi
  → initBatteryADC (esp_adc_cal eFuse Vref) + sampleBattery
  → loop()

loop() setiap iterasi:
  → handleClient (WebServer)
  → checkWiFiConnection
  → baca Serial2 (GM67) → processBarcodeInput
  → setiap 8s: sampleBattery → sendHeartbeatToFirebase
  → oledUpdateIdle
```

### Scan Flow (dioptimasi untuk popup cepat)

```
GM67 scan barcode
  → POST /scans/{id}         ← PERTAMA (popup website muncul cepat)
  → GET /inventory/{barcode} ← lookup nama produk
  → tampil di OLED
```

### OLED Layout (status idle)

```
┌────────────────────────────────┐
│ SCANNER v6.1          [▓▓▓░]  │  title + battery icon
│ [ONLINE]               98%    │  status + battery %
│────────────────────────────────│
│ WiFi: MySSID                  │  ssid (max 14 char)
│ RSSI: -50 dBm          [▓▓▓░] │  rssi dBm + wifi signal icon
│ IP: 192.168.1.100             │  ip address
│ Scan: 12                      │  total scan
│────────────────────────────────│
│ Ready                          │  status
└────────────────────────────────┘
```

### Konfigurasi (EEPROM)

- `WiFiConfig` (addr 0): ssid, password, checksum
- `DeviceConfig` (addr 512): deviceId, serverUrl, firebaseUrl, apiKey

---

## 5. Firebase Realtime Database

### Struktur Data

```json
{
  "inventory": {
    "{id}": {
      "name": "Oli Mesin AHM 10W-30",
      "barcode": "8992017013015",
      "category": "Oli & Pelumas",
      "quantity": 50,
      "minStock": 10,
      "price": 45000,
      "location": "Rak A1",
      "supplier": "AHM"
    }
  },
  "devices": {
    "{deviceId}": {
      "status": "online",
      "ipAddress": "192.168.1.100",
      "batteryLevel": 87,
      "rssi": -52,
      "lastSeen": 1716123456789,
      "uptime": 3600,
      "scanCount": 42,
      "version": "6.1"
    }
  },
  "scans": {
    "{id}": {
      "barcode": "8992017013015",
      "deviceId": "esp32-001",
      "timestamp": 1716123456789,
      "processed": false
    }
  },
  "transactions": {
    "{id}": {
      "itemId": "{id}",
      "productName": "Oli Mesin AHM",
      "productBarcode": "8992017013015",
      "type": "out",
      "quantity": 10,
      "operator": "Mekanik AHASS",
      "reason": "Penjualan",
      "source": "scanner",
      "timestamp": 1716123456789
    }
  },
  "analytics": {
    "totalScans": 150,
    "totalItems": 20,
    "lowStockAlerts": 3
  }
}
```

### Realtime Strategy

Semua data di-subscribe via `onValue` listener (bukan polling). Device online/offline dideteksi client-side: threshold 15 detik, re-evaluasi tiap 3 detik. Transaksi di-fetch dengan `limitToLast(5000)` untuk performa.

---

## 6. Frontend (Next.js 16)

### Halaman

| Route | File | Fungsi |
|-------|------|--------|
| `/` | `app/page.tsx` | Dashboard: inventaris, stock ±, prediksi ringkas (server-side batch), device status |
| `/transaksi` | `app/transaksi/page.tsx` | History transaksi, filter, export CSV, pagination 50/halaman |
| `/prediksi` | `app/prediksi/page.tsx` | MLR chart (30 hari historis + forecast), metrics, badge model |
| `/scan` | `app/scan/page.tsx` | Manual barcode input |

### Komponen Utama

| Komponen | Fungsi |
|----------|--------|
| `components/navigation.tsx` | Navbar responsif |
| `components/realtime-scan-provider.tsx` | Context provider untuk scan realtime dari ESP32 |
| `components/unified-quick-action-popup.tsx` | Popup Stock In/Out saat ESP32 scan barcode |
| `components/device-status.tsx` | Indikator online/offline + battery level |
| `components/prediction-chart.tsx` | SVG chart forecast stok |
| `components/dashboard/stats-cards.tsx` | Kartu statistik (total item, low stock, device) |
| `components/dashboard/inventory-table.tsx` | Tabel inventaris dengan CRUD |

### Hooks

| Hook | Fungsi |
|------|--------|
| `hooks/use-firebase.ts` | CRUD inventaris + transaksi via Firebase (`limitToLast(5000)`) |
| `hooks/use-realtime-scan.ts` | Subscribe `/scans` via `onValue` |
| `hooks/use-realtime-device-status.ts` | Subscribe `/devices`, hitung online/offline |
| `hooks/use-mobile.tsx` | Deteksi mobile viewport |

### Lib

| File | Fungsi |
|------|--------|
| `lib/firebase.ts` | Firebase init + helper functions |
| `lib/stock-prediction.ts` | MLR client-side fallback (TypeScript, pure math) |
| `lib/critical-css.ts` | Inline critical CSS untuk performa |

---

## 7. API Routes

| Method | Path | Fungsi |
|--------|------|--------|
| POST | `/api/predict` | Python MLR prediction — single item atau batch (`mode: 'batch'`) |
| POST | `/api/barcode-scan` | Process barcode scan dari ESP32 |
| GET | `/api/devices-status` | Status semua device |
| GET | `/api/heartbeat` | Health check |
| POST | `/api/check-device-status` | Cek status device (legacy) |
| GET | `/api/current-page` | ESP32 page mode detection |
| GET | `/api/firebase-init` | Firebase config check |
| GET | `/api/firebase-rules` | Get database rules |

---

## 8. Prediksi Stok (Multi Linear Regression)

### Model

Pure Python (no numpy) — OLS via Gauss-Jordan elimination + Tikhonov ridge regularization (λ=1.0). Tidak pakai numpy agar fit dalam Vercel 250MB serverless limit.

### Pipeline

```
1. Build daily stock series dari transaksi
2. Konversi level → raw consumption (clip restock ke 0)
3. EMA smoothing (alpha=0.05) → smoothed consumption
4. Feature engineering: [consumption_lag1, day_of_week, is_weekend]
5. StandardScaler (mean=0, std=1)
6. OLS fit (train 85%)
7. Iterative forecast: predict consumption → kurangi dari current_stock
```

### Features

| Feature | Deskripsi |
|---------|-----------|
| `consumption_lag1` | Konsumsi smoothed kemarin |
| `day_of_week` | Hari dalam minggu (0=Mon..6=Sun) |
| `is_weekend` | Flag akhir pekan (Sabtu/Minggu) |

### Kenapa EMA + Consumption (bukan level stok)?

Training pada **level stok** menyebabkan model belajar pola restock → forecast zigzag naik-turun. Training pada **konsumsi smoothed** menghasilkan forecast monoton turun yang realistis.

### Endpoint

```
POST /api/predict
Body (single): { transactions, currentQuantity, horizonDays, trainRatio }
Body (batch):  { mode: 'batch', items, transactions, horizonDays, topN, recentDays }
Response: { forecast, metrics: {mae, rmse, r2}, stockoutDate, source: 'mlr-py' }
```

### Performa (dataset uji: 20 suku cadang Honda, 365 hari)

| Metric | Nilai |
|--------|-------|
| Avg R² | 0.65 |
| Items R² > 0.7 | 10/20 (50%) |
| Items R² > 0.5 | 15/20 (75%) |
| Zigzag forecast | 0/20 |
| Train ratio | 85/15 |

### Fallback

Jika Python serverless gagal → client-side TypeScript di `lib/stock-prediction.ts` dengan badge "client-side".

### Dashboard Batch Prediction

Dashboard memanggil `/api/predict` dengan `mode: 'batch'` untuk mendapatkan top-3 item berisiko stockout. Prediksi dilakukan server-side agar browser tidak berat.

---

## 9. Service Worker

`public/sw.js` cache static assets. Firebase RTDB (`firebasedatabase.app`, `firebaseio.com`) di-exclude dari cache agar `onValue` listeners tetap realtime.

---

## 10. Deployment

| Layer | Platform |
|-------|----------|
| Frontend + API Routes | Vercel (auto-deploy dari branch `555`) |
| Python Serverless | Vercel Python Runtime (`api/predict.py`) — pure Python, no numpy |
| Database | Firebase Realtime Database (asia-southeast1) |
| Production URL | https://stokmanager.app |

### Environment Variables

```env
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_DATABASE_URL
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
```

---

## 11. Tech Stack

| Layer | Stack |
|-------|-------|
| Frontend | Next.js 16 (Turbopack), React 19, TypeScript 5.8 |
| Styling | Tailwind CSS 3.4, shadcn/ui, Radix UI |
| Backend | Firebase Realtime Database, Next.js API Routes |
| ML | Pure Python (OLS + EMA + StandardScaler), TypeScript fallback |
| Hardware | ESP32 + GM67 + OLED SSD1306 + TP4056 + Li-Po LP902040 |
| Deploy | Vercel |

---

*Updated: 2026-05-26*
