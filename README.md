# StokManager

Sistem Manajemen Inventory Real-time berbasis Next.js + Firebase dengan integrasi ESP32 Barcode Scanner dan prediksi stok menggunakan Simple Linear Regression.

Updated: 2026-06-30

> Agent handoff: sebelum agent lain mengubah repo ini, baca `AGENTS.md` dulu. File itu adalah source-of-truth arsitektur, batasan schema, workflow, dan perintah verifikasi.

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
- Aplikasi internal-only dengan Firebase email/password authentication
- Peran `admin`, `operator`, dan `viewer` melalui Firebase custom claims
- Tidak ada UI pendaftaran publik; akun tanpa profil dan custom claim yang sah ditolak aplikasi/rules
- Administrasi pengguna/scanner dan auditnya diproses oleh Vercel Functions dengan Firebase Admin SDK
- Real-time barcode scanning dengan ESP32 GM67
- CRUD produk + stock adjustment (tambah/kurangi) via dashboard
- Edit item di dashboard dapat mengubah metadata produk termasuk `minStock` / stok minimum
- Popup ESP32 untuk barcode belum terdaftar dapat langsung tambah produk baru dengan field inventory utama: `barcode`, `name`, `category`, `quantity`, `minStock`, dan `location`
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
- Setiap scanner memakai akun Firebase Auth unik yang dipetakan ke satu `deviceId`
- Firmware 6.5.15 menyimpan refresh token saja di Preferences/NVS dan memperbarui ID token otomatis
- **OTA firmware update** — admin dispatch versi dari panel, perangkat HTTP-pull, verifikasi SHA-256 + ECDSA P-256, flash + auto-rollback (lihat bagian OTA Firmware Update)
- Monitoring realtime via Firebase `onValue` listener (bukan polling)
- Deteksi online/offline client-side: offline bila `lastSeen` >30 detik, re-evaluasi tiap 1 detik
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
    ├── PUT /devices/{id}     (heartbeat tiap ~5s + batteryLevel/rssi/scanMode)
    ├── POST /scans/{id}      (barcode scan event)
    └── GET /inventory        (lookup produk by barcode)
    │
    ▼
Firebase Realtime Database
    │
    ├── /inventory/{id}       (produk: barcode, name, category, quantity, minStock, location, timestamps)
    ├── /devices/{id}         (status, lastSeen, batteryLevel, rssi, ip)
    ├── /users/{uid}          (profil + role)
    ├── /deviceAuth/{uid}     (pemetaan akun perangkat ke deviceId)
    ├── /auditLogs/{id}       (audit immutable, admin-only)
    ├── /scans/{id}           (barcode, deviceId, timestamp, processed)
    ├── /transactions/{id}    (type, qty, operator, reason, timestamp)
    ├── /deviceCommands/{id}  (perintah OTA/kalibrasi; scanMode legacy ignored by firmware)
    ├── /deviceOtaStatus/{id} (fase OTA: downloading/verifying/flashing/success/failed/deferred/rollback)
    └── /analytics            (totalScans, totalItems, lowStockAlerts)
    │
    ▼
Next.js Website (Vercel)
    ├── Dashboard             (inventaris, stock +/-, prediksi ringkas, device status)
    ├── /transaksi            (history, filter jenis/sumber/periode, export CSV, pagination)
    ├── /prediksi             (detailed SVG Linear Regression chart, forecast tabel, metrics)
    ├── /scan                 (manual barcode input)
    ├── /api/admin/*          (Vercel Functions + Firebase Admin SDK)
    └── /api/predict          (Python serverless, Simple Linear Regression)
```

### Data Flow
1. ESP32 scan barcode → POST ke `/scans` → popup muncul di website
2. Jika barcode belum terdaftar, popup dapat membuat `/inventory/{id}` baru dengan schema inventory utama + transaksi stok awal
3. User pilih Stock In/Out di popup → atomic update: `increment()` ke `/inventory` + create `/transactions` dalam satu multi-path write
4. Website subscribe semua path via `onValue` → UI update realtime tanpa refresh
5. Prediksi: website POST token Firebase ke `/api/predict` → token diverifikasi via Identity Toolkit → forecast + metrics
6. Admin: website mengirim ID token ke `/api/admin/*` → Firebase Admin memverifikasi role + profil → mutasi Auth/RTDB + audit atomik per operasi

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
ALLOWED_ORIGINS=https://stokmanager.app,https://your-project.vercel.app
FIREBASE_SERVICE_ACCOUNT={"type":"service_account","project_id":"xxx",...}
```

`scripts/check-env.js` memvalidasi env vars sebelum dev server start.

## Scripts

```bash
npm run dev        # Turbopack dev server (:3000)
npm run build      # Production build (Turbopack)
npm run start      # Serve production build
npm run lint       # ESLint
npm run typecheck  # TypeScript strict check
npm run test:rules # Firebase Emulator security-rule matrix
npm run check-env  # Validate Firebase env vars
npm run bootstrap:admin -- --email=admin@example.com --password='minimum-12-char'
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
- Version: 6.5.15
- Mode: Inventory only (single mode)
- Heartbeat: tiap ~5 detik ke Firebase `/devices/{id}` berisi `batteryLevel`, `rssi`, dan `scanMode`
- Battery: `esp_adc_cal` eFuse Vref + EMA(α=0.05) + hysteresis ±2%, MIN=3200mV, MAX=3800mV
- OLED: battery icon (4-bar) + WiFi signal icon (4-bar RSSI)
- Boot time: ~3 detik (`WiFi.persistent(false)`, delay minimal)
- Libraries: WiFi, WebServer, EEPROM, HTTPClient, ArduinoJson v6, Wire, Adafruit_GFX, Adafruit_SSD1306, esp_adc_cal, driver/adc
- Auth: Firebase Identity Toolkit; refresh token saja disimpan di Preferences/NVS
- Provisioning: scan QR WiFi, daftarkan `deviceId` di panel admin, lalu scan PDF417 kredensial satu kali
- Scan mode: dikontrol dari tombol fisik UP/OK/DOWN; firmware melaporkan `Manual`, `Auto IN`, atau `Auto OUT` via heartbeat. Mode Auto IN/OUT bekerja standalone tanpa dashboard terbuka.
- OTA: HTTP-pull dari `/deviceCommands/{deviceId}/ota` (poll tiap 8s), `Update.h` + `esp_ota_ops.h`, verifikasi SHA-256 + ECDSA P-256 (public key tertanam), gate baterai ≥30% + idle, auto-rollback bila boot gagal 3x, status ke `/deviceOtaStatus/{deviceId}`

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

**Important**: `useFirebaseTransactions()` now accepts `null` as limit to fetch ALL transactions (no `limitToLast`). For prediction accuracy, always pass `null` to get the full history rather than a subset.

Card `Perkiraan Habis` pada `/prediksi` mengikuti forecast yang tampil di grafik/tabel: cari titik pertama pada `prediction.forecast` dengan `predictedQuantity <= 0`. API `stockoutDate` juga dihitung dari timestamp histori terakhir agar konsisten dengan forecast.

### Performa (dataset uji)
- 20 suku cadang Honda AHASS, 365 hari, 6736 transaksi
- Avg R² = 0.8962, R² > 0: 20/20 item
- Test command: `npx tsx scripts/generate-honda-dummy.ts --test`

### Endpoint
```
POST /api/predict
Authorization: Bearer <Firebase ID token>
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

## OTA Firmware Update

Update firmware ESP32 jarak jauh dari panel admin. Mekanisme **HTTP-pull**: perangkat polling perintah, download sendiri, verifikasi, flash, lalu reboot dengan auto-rollback.

### Alur end-to-end

```
[Admin Panel]  →  [GitHub Actions]  →  [GitHub Release: .bin + manifest.json (signed)]
     │                                          │
     │ POST /api/admin/devices/ota              │ binaryUrl, sha256, signature
     ▼                                          │
[Firebase RTDB]                                 │
  /deviceCommands/{deviceId}/ota  ◄─────────────┘
     │
     │ ESP32 GET tiap 8 detik
     ▼
[ESP32]  download → verify SHA-256 → verify ECDSA → flash → reboot → validate/rollback
     │
     │ PUT status tiap fase
     ▼
[Firebase RTDB] /deviceOtaStatus/{deviceId}  →  badge fase di panel admin
```

### Langkah

1. **Build & sign (GitHub Actions)** — admin klik build → `POST /api/admin/firmware/build` trigger workflow `.github/workflows/firmware-ota.yml`. CI: cek versi cocok `FIRMWARE_VERSION` di sketch → compile (arduino-cli, esp32@3.0.7) → cek ukuran ≤95% slot OTA → sign pakai `OTA_SIGNING_PRIVATE_KEY` (ECDSA P-256, `openssl dgst -sha256 -sign`) → publish GitHub Release (tag `firmware-v*`) berisi `.bin` + `manifest.json`.
2. **Dispatch** — panel admin pilih versi + perangkat (max 50/batch) → `POST /api/admin/devices/ota` → `lib/server/firmware-ota.ts` ambil release dari GitHub → tulis `deviceCommands/{deviceId}/ota` via Firebase Admin SDK → audit `ota-dispatch`. `binaryUrl` diambil dari daftar aset release (bukan manifest) untuk cegah manifest-tampering redirect.
3. **Poll (ESP32)** — `checkForOtaCommand()` GET `/deviceCommands/{deviceId}/ota.json` tiap 8s. Idempotency via NVS `Preferences` (`doneId`); skip kalau `version == FIRMWARE_VERSION`; gate prasyarat `otaPreconditionsMet()` (baterai ≥30% + idle ≥10s) → lapor `"deferred"` bila belum siap.
4. **Download → verify → flash** — `performOtaUpdate()`: stream binary HTTPS, hash SHA-256 streaming vs manifest, verifikasi tanda tangan ECDSA `verifyOtaSignature()` pakai public key tertanam, `Update.begin/write/end(true)`, simpan `pendingId`, `ESP.restart()`.
5. **Validate / rollback** — setelah reboot, `validateOtaBootSuccess()`: heartbeat pertama sukses → `esp_ota_mark_app_valid_cancel_rollback()` (commit). Gagal boot 3x → `Update.rollBack()` balik ke firmware lama (anti-bricking).
6. **Status** — `reportOtaStatus()` PUT ke `/deviceOtaStatus/{deviceId}` tiap fase; OLED tampil progress; panel admin tampil badge per-perangkat + tombol cancel.

### Prasyarat deploy

- **`OTA_PUBLIC_KEY_PEM`** di firmware (`GM67_ESP32_BARCODESCANNER.ino`) harus pasangan dari `OTA_SIGNING_PRIVATE_KEY` (secret GitHub Actions). Mismatch → semua verifikasi tanda tangan gagal.
- **Ruleset `firebase-rules-strict.json`** harus aktif — path `/deviceCommands` + `/deviceOtaStatus` hanya ada di sini. Ruleset lain → polling OTA kena 403.
- **Versi sinkron** — CI menolak build bila versi dispatch ≠ `FIRMWARE_VERSION` di sketch.
- Env web: `GITHUB_OTA_REPO`, `GITHUB_OTA_TOKEN`, `GITHUB_OTA_WORKFLOW` (default `firmware-ota.yml`), `GITHUB_OTA_REF` (default `555`).

### Endpoint OTA

```
GET    /api/admin/devices/ota       List status OTA semua perangkat
POST   /api/admin/devices/ota       Dispatch perintah OTA (per-perangkat, max 50)
DELETE /api/admin/devices/ota       Batalkan perintah OTA
POST   /api/admin/firmware/build    Trigger GitHub Actions build
GET    /api/admin/firmware/releases List release signed yang valid
GET    /api/admin/firmware/builds   History workflow run
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
| POST | `/api/predict` | Python Simple Linear Regression prediction — single item atau batch (`mode: 'batch'`). |
| GET/POST/PATCH | `/api/admin/users` | List, buat, dan ubah pengguna internal. |
| POST | `/api/admin/users/reset-password` | Buat tautan reset kata sandi pengguna. |
| GET/POST/PATCH/DELETE | `/api/admin/devices` | List, daftar, ubah status, dan cabut scanner. |
| POST | `/api/admin/devices/rotate` | Rotasi kredensial scanner. |
| GET/POST/DELETE | `/api/admin/devices/ota` | List status OTA, dispatch perintah OTA, batalkan perintah. |
| POST | `/api/admin/firmware/build` | Trigger GitHub Actions build firmware. |
| GET | `/api/admin/firmware/releases` | List release firmware signed yang valid. |
| GET | `/api/admin/firmware/builds` | History workflow run build. |

Semua `/api/admin/*` berjalan sebagai Vercel Functions, mewajibkan Firebase ID token dengan role admin aktif, dan memakai `FIREBASE_SERVICE_ACCOUNT` hanya di server. ESP32 tetap berkomunikasi langsung dengan Firebase RTDB. Status online/offline dihitung client-side dari usia heartbeat; tidak ada scheduled Firebase Function.

## Security Rollout

1. Backup RTDB production.
2. Set `FIREBASE_SERVICE_ACCOUNT` pada Vercel untuk Preview dan Production, lalu deploy aplikasi.
3. Deploy `firebase-rules-migration.json` dan jalankan bootstrap admin.
4. Buat akun pengguna dan scanner dari panel admin; operasi admin dicatat ke `/auditLogs` oleh Vercel Functions.
5. Flash firmware 6.5.15, scan QR WiFi, daftarkan `deviceId` dari OLED, lalu scan PDF417 kredensial yang ditampilkan panel admin.
6. Verifikasi login, heartbeat, scan, role, dan audit administrasi.
7. Jalankan workflow `Deploy Strict Firebase Rules` setelah approval environment.

`firebase.json` sengaja menunjuk rules migrasi. Cutover strict memakai `firebase.strict.json` sehingga request anonim dan firmware lama baru ditolak setelah scanner 6.5.15 diverifikasi. Karena Firebase Spark tidak mendukung blocking/database-trigger Functions, tidak ada self-registration UI dan akun tanpa profil + custom claim yang sah tidak mendapat akses; audit otomatis hanya dijamin untuk operasi admin melalui Vercel Functions.

## License

MIT License - see [LICENSE](LICENSE).

---

Made by [drybrine](https://github.com/drybrine) — IoT + Web Technologies for Smart Inventory Management
