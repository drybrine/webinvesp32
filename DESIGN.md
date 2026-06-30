# DESIGN.md — StokManager

Dokumen desain teknis sistem manajemen inventory real-time berbasis IoT + Web.

---

## 1. Gambaran Sistem

StokManager adalah sistem manajemen inventory untuk AHASS (Honda Authorized Service Station) yang menggabungkan:

- **Hardware**: ESP32 + GM67 Barcode Scanner + OLED SSD1306 + baterai Li-Po
- **Backend**: Firebase Realtime Database (sumber kebenaran tunggal)
- **Frontend**: Next.js 16 (App Router, Turbopack) di Vercel
- **ML**: Simple Linear Regression + EMA Smoothing untuk prediksi stockout
- **Prediksi**: output regresi/forecast untuk scope skripsi; anomaly metadata dari API tidak ditampilkan di UI
- **Barcode**: PDF417 (2D) di-render via bwip-js, dapat di-scan GM67

---

## 2. Arsitektur Sistem

```
┌─────────────────────────────────────────────────────────┐
│                     ESP32 GM67 Scanner                   │
│  GM67 (UART) → ESP32 → Firebase RTDB                    │
│  Heartbeat tiap ~5s: /devices/{id}                      │
│  Scan event: POST /scans/{id}                           │
│  Lookup: GET /inventory/{barcode}                       │
└────────────────────────┬────────────────────────────────┘
                         │ HTTPS / Firebase REST API
                         ▼
┌─────────────────────────────────────────────────────────┐
│              Firebase Realtime Database                  │
│  /inventory/{id}     → produk (name, qty, category, ...)   │
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
│  /prediksi   → Linear Regression chart + forecast       │
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
**Version**: 6.5.15

### Flow Utama

```
Boot (~3 detik)
  → initOLED → oledShowBoot (500ms)
  → loadWiFiConfig (EEPROM)
  → WiFi.persistent(false) + connectToWiFi
  → initBatteryADC (esp_adc_cal eFuse Vref) + sampleBattery
  → loop()

loop() setiap iterasi:
  → checkWiFiConnection
  → baca Serial2 (GM67) → processBarcodeInput
  → setiap ~5s: sampleBattery → sendHeartbeatToFirebase
  → baca stream deviceCommands/{deviceId} untuk OTA/kalibrasi
  → setiap 8s atau saat stream memberi sinyal: poll deviceCommands/{deviceId}/ota
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
│ SCANNER v6.5.15       [▓▓▓░]  │  title + battery icon
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
      "version": "6.5.15",
      "scanMode": "Manual"
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
  "deviceCommands": {
    "{deviceId}": {
      "ota": {
        "commandId": "cmd-123",
        "version": "6.5.15",
        "binaryUrl": "https://github.com/.../firmware.bin",
        "sha256": "...",
        "signature": "...",
        "size": 1048576
      }
    }
  },
  "deviceOtaStatus": {
    "{deviceId}": {
      "phase": "success",
      "version": "6.5.15",
      "updatedAt": 1716123456789
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

Semua data web di-subscribe via `onValue` listener (bukan polling). Device online/offline dideteksi client-side: offline bila `lastSeen` >30 detik, re-evaluasi tiap 1 detik. `scanMode` di dashboard berasal dari heartbeat perangkat (`Manual`, `Auto IN`, `Auto OUT`); mode dikontrol dari tombol fisik alat. Untuk prediksi akurat, transaksi harus di-fetch penuh dengan `useFirebaseTransactions(null)`.

### Atomic Stock Update (anti race condition)

Semua perubahan stok memakai **server-side `increment(delta)`** dalam satu **multi-path `update()`** yang menulis `inventory/{id}/quantity` dan `transactions/{id}` sekaligus:

```
firebaseHelpers.adjustStock(itemId, delta, transactionData)
  → update(ref(database), {
      'inventory/{id}/quantity': increment(delta),   // atomic server-side
      'inventory/{id}/lastUpdated': Date.now(),
      'transactions/{newKey}': { ...transactionData },
    })
```

Pendekatan ini menghilangkan race condition read-modify-write: scanner, dashboard, dan multi-tab yang mengubah stok barang sama secara bersamaan tidak saling menimpa (lost update), dan stok + ledger transaksi tidak bisa diverge karena ditulis dalam satu operasi atomik.

---

## 6. Frontend (Next.js 16)

### Halaman

| Route | File | Fungsi |
|-------|------|--------|
| `/` | `app/page.tsx` | Dashboard: inventory, stock ±, search/filter/sort, prediksi ringkas (server-side batch), device status dengan battery level (hanya tampil saat scanner online) |
| `/transaksi` | `app/transaksi/page.tsx` | History transaksi, filter, export CSV, pagination 50/halaman |
| `/prediksi` | `app/prediksi/page.tsx` | Linear Regression chart (30 hari historis + forecast), metrics, badge model. Anomaly detection tidak ditampilkan di UI (di luar scope skripsi) |
| `/scan` | `app/scan/page.tsx` | Manual barcode input, riwayat scan, export CSV |

### Komponen Utama

| Komponen | Fungsi |
|----------|--------|
| `components/navigation.tsx` | Navbar responsif (Modern Minimal) |
| `components/realtime-scan-provider.tsx` | Context provider untuk scan realtime dari ESP32 |
| `components/unified-quick-action-popup.tsx` | Popup Stock In/Out saat ESP32 scan barcode (atomic adjustStock) |
| `components/device-status.tsx` | Indikator online/offline + battery level |
| `components/prediction-chart.tsx` | SVG chart forecast stok (no recharts dependency) |
| `components/pdf417-barcode.tsx` | Render barcode PDF417 (2D) ke canvas via bwip-js |
| `components/dashboard/stats-cards.tsx` | Kartu statistik (total item, low stock, device) |
| `components/dashboard/inventory-table.tsx` | Tabel inventory dengan CRUD |

### Hooks

| Hook | Fungsi |
|------|--------|
| `hooks/use-firebase.ts` | CRUD inventaris + transaksi via Firebase (limit bisa null untuk fetch semua transaksi) |
| `hooks/use-realtime-scan.ts` | Subscribe `/scans` via `onValue` |
| `hooks/use-realtime-device-status.ts` | Subscribe `/devices`, hitung online/offline |
| `hooks/use-mobile.tsx` | Deteksi mobile viewport |

### Lib

| File | Fungsi |
|------|--------|
| `lib/firebase.ts` | Firebase init + helper functions |
| `lib/stock-prediction.ts` | Simple Linear Regression client-side fallback (TypeScript, pure math) |
| `lib/critical-css.ts` | Inline critical CSS untuk performa |

---

## 7. API Routes

API web sengaja terbatas: `/api/predict` adalah Vercel Python function di `api/predict.py` (bukan Next.js route), sedangkan `/api/admin/*` adalah Next.js Route Handlers untuk administrasi user/device/OTA memakai Firebase Admin SDK. ESP32 tidak memanggil endpoint ini; scanner tetap push langsung ke Firebase. Tidak ada Firebase Cloud Functions, RTDB trigger, atau device-status sweeper.

| Method | Path | Fungsi |
|--------|------|--------|
| POST | `/api/predict` | Python Simple Linear Regression prediction — single item atau batch (`mode: 'batch'`). Handler Vercel Python di `api/predict.py`; tidak ada `app/api/predict/route.ts`. |
| GET/POST/PATCH | `/api/admin/users` | List, buat, dan ubah pengguna internal. |
| POST | `/api/admin/users/reset-password` | Buat tautan reset kata sandi pengguna. |
| GET/POST/PATCH/DELETE | `/api/admin/devices` | List, daftar, ubah status, dan cabut scanner. |
| POST | `/api/admin/devices/rotate` | Rotasi kredensial scanner. |
| GET/POST/DELETE | `/api/admin/devices/ota` | List status OTA, dispatch perintah OTA, batalkan perintah. |
| POST | `/api/admin/firmware/build` | Trigger GitHub Actions build firmware. |
| GET | `/api/admin/firmware/releases` | List release firmware signed yang valid. |
| GET | `/api/admin/firmware/builds` | History workflow run build. |

---

## 8. Prediksi Stok (Simple Linear Regression)

### Model

Pure Python (no numpy) — OLS regresi linear sederhana dengan persamaan `Y = a + bX`. Model memprediksi konsumsi harian, bukan langsung level stok:

- `X` = konsumsi hari sebelumnya
- `Y` = konsumsi hari ini

### Pipeline

```
1. Build daily stock series dari transaksi
2. Konversi level → raw consumption (clip restock ke 0)
3. EMA smoothing (alpha=0.05) → smoothed consumption
4. OLS fit: `consumption_today = a + b * consumption_yesterday`
5. Iterative forecast: predict consumption → kurangi dari current_stock
```

### Variabel Regresi

| Variabel | Deskripsi |
|---------|-----------|
| `X` | Konsumsi hari sebelumnya |
| `Y` | Konsumsi hari ini |

### Kenapa EMA + Consumption (bukan level stok)?

Training langsung pada **level stok** membuat forecast simple linear regression menjadi garis lurus dan rentan terdistraksi event restock. Training pada **konsumsi smoothed** menjaga metode tetap regresi linear sederhana, sementara stok diforecast iteratif sehingga grafik tidak dipaksa menjadi garis lurus.

### Endpoint

```
POST /api/predict
Body (single): { transactions, currentQuantity, horizonDays, trainRatio }
Body (batch):  { mode: 'batch', items, transactions, horizonDays, topN, recentDays }
Response: { forecast, metrics: {mae, rmse, r2}, stockoutDate, source }
Source: `lr-consumption-py` atau `lr-consumption-batch`
```

### Performa (dataset uji: 20 suku cadang Honda, 365 hari)

| Metric | Nilai |
|--------|-------|
| Avg R² | 0.8962 |
| Items R² > 0 | 20/20 (100%) |
| Metode | Simple Linear Regression lag-1 consumption |
| Train ratio | 85/15 |

### Fallback

Jika Python serverless gagal → client-side TypeScript di `lib/stock-prediction.ts` dengan badge "client-side".

### Dashboard Batch Prediction

Dashboard memanggil `/api/predict` dengan `mode: 'batch'` untuk mendapatkan top-3 item berisiko stockout. Prediksi dilakukan server-side agar browser tidak berat.

---

## 9. Scope Notes

Anomaly detection tidak ditampilkan di `/prediksi` karena di luar scope skripsi. Jika backend pernah mengembalikan metadata anomaly, frontend mengabaikannya sampai scope berubah.

---

## 10. Service Worker

`public/sw.js` cache static assets. Firebase RTDB (`firebasedatabase.app`, `firebaseio.com`) di-exclude dari cache agar `onValue` listeners tetap realtime.

---

## 11. Deployment

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

## 12. Tech Stack

| Layer | Stack |
|-------|-------|
| Frontend | Next.js 16 (Turbopack), React 19, TypeScript 5.8 |
| Styling | Tailwind CSS 3.4, shadcn/ui, Radix UI |
| Backend | Firebase Realtime Database, Vercel Node.js Functions, Vercel Python Function |
| ML | Pure Python Simple Linear Regression + EMA, TypeScript fallback |
| Barcode | bwip-js (PDF417 2D render ke canvas) |
| Hardware | ESP32 + GM67 + OLED SSD1306 + TP4056 + Li-Po LP902040 |
| Deploy | Vercel |

---

*Updated: 2026-06-30*
