# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Package manager: both `pnpm-lock.yaml` and `package-lock.json` are committed. README recommends pnpm; `npm run dev` is the standard dev command invoked elsewhere in docs and CI/Vercel.

```bash
npm install            # or: pnpm install
npm run dev            # runs scripts/check-env.js first, then next dev on :3000
npm run build          # next build (production)
npm run start          # next start (serves prebuilt .next)
npm run lint           # next lint (ESLint 9)
npm run check-env      # validates NEXT_PUBLIC_FIREBASE_* are set
npx tsx scripts/test-stock-prediction.ts                              # dummy dataset
npx tsx scripts/test-stock-prediction.ts --export barcodescanesp32-default-rtdb-export.json
npx tsc --noEmit       # type-check only (strict mode)
python3 api/predict.py # test Python predict serverless locally (requires requests library for HTTP mode)
```

Notebook seminar/model website: `scripts/model_prediksi_stok_linear_regression.ipynb` reads `barcodescanesp32-default-rtdb-export.json`, mirrors the Python prediction pipeline, and reports MAE/RMSE/MAPE/R².

No test runner is wired up. Type-check + build is the verification loop. If `/prediksi` or dashboard changes touch hook order, run a full `rm -rf .next && npm run build` — minified React #310 (hook order) only shows in production builds.

Port 3000 is hard-coded in several places; `kill <pid>` the existing `next-server` process before restarting.

## Environment

Firebase Realtime Database is the only backend. All config keys are `NEXT_PUBLIC_FIREBASE_*` (client-exposed by design) and loaded from `.env.local`. `scripts/check-env.js` runs before `next dev` and blocks startup if keys are missing. Values also live in `DEPLOYMENT.md` for reference.

## Architecture

This is a Next.js 16 App Router app (Turbopack) paired with an ESP32 firmware sketch (`GM67_ESP32_BARCODESCANNER.ino`, single-mode inventory scanner, v6.1). The web app and the firmware share one Firebase Realtime Database.

### Data flow

- **ESP32 → Firebase**: firmware PUTs directly to `/devices/{deviceId}` (heartbeat every ~8s, includes batteryLevel/rssi) and pushes scans to `/scans/{id}`. Firmware also reads `/inventory` to display product info on its OLED.
- **Firebase → web**: every `hooks/use-firebase.ts` hook subscribes via `onValue` — inventory, scans, devices, transactions are all reactive. No polling.
- **Web → Firebase**: all stock changes (dashboard + ESP32 scan popup) use **atomic `adjustStock()`** — a single multi-path `update()` that writes `inventory/{id}/quantity` via server-side `increment(delta)` AND creates `transactions/{id}` in one atomic operation. This eliminates race conditions from concurrent writes (scanner + dashboard + multi-tab). Operator = `"Dashboard"` for manual, `"Scanner"` for ESP32.
- **Device liveness**: `hooks/use-realtime-device-status.ts` subscribes to `/devices` via `onValue`, then re-evaluates online/offline client-side every 3 seconds based on the age of `lastHeartbeat`/`lastSeen`. Threshold: 15s. There is an older `/api/check-device-status` route still present but no longer called from any hook — kept as a cron/fallback helper.

### Inventory mode is the only mode

Attendance was fully removed from both web and firmware. Do not reintroduce attendance routes, scanner modes, or Firebase paths. `ScannerMode` in the firmware is a single-variant enum; `ESP32_CONFIG.MODES` in `lib/esp32-config.ts` has only `INVENTORY`.

### Pages and their responsibilities

- `app/page.tsx` — dashboard: inventory table, stock adjustment dialogs, prediction summary card (top-3 risk items via server-side batch `/api/predict?mode=batch`), stockout toast notifier (session-scoped, one notification per item per day), device status card. All hooks must be declared before any conditional early-return — see the #310 incident in git history.
- `app/transaksi/page.tsx` — transaction feed, filters by type/period/**source** (Manual = operator is Dashboard/Manual/empty; Scanner = anything else). Pagination 50/halaman. Export CSV.
- `app/prediksi/page.tsx` — Simple Linear Regression prediction per item via Python serverless, detailed SVG chart in `components/prediction-chart.tsx`, model metrics (R², MAE, RMSE), forecast table, testing model panel, badge sumber model. Do not display anomaly detection in this page; it is outside the thesis scope.
- `app/scan/page.tsx` — manual barcode input, PDF417 barcode render via bwip-js (`components/pdf417-barcode.tsx`), scan history.
- `/api/predict` — **not a Next.js route**. `vercel.json` maps `api/predict.py` (Vercel Python function, `@vercel/python@4.3.1`, maxDuration 30s) to handle `/api/predict` directly. The frontend `fetch("/api/predict", …)` calls hit the Python handler. Supports single item and batch mode (`mode: 'batch'` for dashboard top-N risk items). There is no `app/api/predict/route.ts`.
- `app/api/current-page/route.ts`, `/api/firebase-*`, `/api/heartbeat`, `/api/devices-status`, `/api/barcode-scan`, `/api/check-device-status` — Next.js helper endpoints for ESP32 and diagnostics (all under `app/api/**/*.ts`, maxDuration 30s).

### Prediction pipeline

Primary prediction runs on **Python serverless** (`api/predict.py`) — pure Python Simple Linear Regression / OLS (no numpy, fits Vercel 250MB limit). Pipeline:

```
transactions → daily stock series → raw consumption (clip restock ke 0)
→ EMA smoothing (α=0.05)
→ simple linear regression: Y = consumption_today, X = consumption_yesterday
→ iterative forecast: predict consumption → subtract from current stock
```

Performance (dataset: 20 suku cadang Honda, 365 hari, 6736 tx): avg R²=0.8962, R² > 0: 20/20.

**Client-side fallback** in `lib/stock-prediction.ts` (TypeScript, same OLS math) — used if Python serverless fails or `/api/predict` is unavailable in local `next start`. Badge shows "Linear Regression (server)" or "Linear Regression (client)".

The `/prediksi` page calls single-item prediction and displays only the regression/forecast outputs needed for the thesis: model parameters, chart, metrics, forecast table, and testing model details. The dashboard calls batch mode (`mode: 'batch'`) to get top-N risk items. Standalone test: `scripts/test-stock-prediction.ts`. Minimum 2 points to fit — callers must guard.

The prediction chart is hand-built SVG with no chart library dependency. It shows the last 30 days of history, forecast area, minimum-stock zone, hover/focus tooltip, safe/low/stockout status, and summary counts. Keep this SVG approach unless production build testing proves a new chart library works with the custom splitChunks config.

The `/prediksi` "Perkiraan Habis" card must stay synchronized with the chart/table by deriving its date from the first `prediction.forecast` point whose `predictedQuantity <= 0`. Do not use API `stockoutDate` for this card because that date is relative to server/current time, while the chart uses forecast timestamps based on the last reconstructed history point.

### Webpack config landmines

`next.config.mjs` has custom `splitChunks` with `maxSize: 50000` and `vendorSplit` that splits node_modules per-package. This previously shattered `recharts` across 7 chunks and broke cross-chunk references (`s(...) is not a function`). The fix was to render charts as hand-built SVG (`components/prediction-chart.tsx`) instead of recharts. Note: `recharts` is still in `package.json` and `components/ui/chart.tsx` (the shadcn recharts wrapper) still exists but is **not imported anywhere** — safe to ignore/remove. If you add a library with heavy internal cross-module references, test a production build, not just dev.

### Service worker

`public/sw.js` caches pages and Firebase resources. After deploys, stale SW can serve old chunks and surface errors that look like code bugs. When debugging user-reported runtime errors, suggest unregister + clear site data before chasing source.

### Firmware notes (`GM67_ESP32_BARCODESCANNER.ino`)

Single file, ~1100 lines. Requires `Adafruit_GFX`, `Adafruit_SSD1306`, `esp_adc_cal`, `driver/adc` libraries. OLED wired on SDA=21, SCL=22, address 0x3C. Firmware version constant `FIRMWARE_VERSION = "6.1"` is reported in heartbeat payload and shown on the boot screen. EEPROM layout: WiFi config at 0, device config at 512, size 1024. Heartbeat PUTs the full device state (including batteryLevel, rssi) to `/devices/{deviceId}` every 8s.

Battery monitoring: `esp_adc_cal` eFuse Vref calibration, EMA smoothing (α=0.05), hysteresis ±2%, range 3200–3800mV. Battery sampled before HTTP request to avoid WiFi voltage sag. OLED shows 4-bar battery icon + 4-bar WiFi signal icon (RSSI-based).

## Coding conventions

- TypeScript strict mode, paths alias `@/*`.
- Hooks in `hooks/` are all client-only (`"use client"`); they own Firebase subscriptions and cleanup via returned `Unsubscribe`.
- Place all hook calls before conditional returns in pages — React #310 surfaces only in prod builds.
- UI is shadcn/ui + Radix via `components/ui/*`. Dashboard-specific composites live in `components/dashboard/`.
- Indonesian is the user-facing language in pages, toasts, and labels. Keep new UI copy in Indonesian to match.
- Prediction/forecast code uses `Math.max(0, …)` to clamp forecasts and assumes timestamps in ms.
- All stock mutations go through `firebaseHelpers.adjustStock()` (atomic multi-path `update()` with `increment()`). Never do read-modify-write on quantity.
- Dashboard edit item dialog can update product metadata including `minStock`. Quantity edits from that dialog must still be applied as an atomic delta through `firebaseHelpers.adjustStock()`, not by writing absolute quantity.
- Barcode rendering uses bwip-js for PDF417 (2D). Component: `components/pdf417-barcode.tsx`.
- Anomaly detection is intentionally not surfaced in the `/prediksi` UI or chart. If `api/predict.py` returns an `anomalies` field, frontend code should ignore it unless the thesis scope changes.
