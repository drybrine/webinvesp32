# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Agent workflow rules

- Always spawn subagent when doing exploration.

## Commands

Package manager: both `pnpm-lock.yaml` and `package-lock.json` are committed. README recommends pnpm; `npm run dev` is the standard dev command invoked elsewhere in docs and CI/Vercel.

```bash
npm install            # or: pnpm install
npm run dev            # runs scripts/check-env.js first, then next dev on :3000
npm run build          # next build (production)
npm run start          # next start (serves prebuilt .next)
npm run lint           # eslint . (ESLint 9 flat config)
npm run check-env      # validates NEXT_PUBLIC_FIREBASE_* are set
npm run typecheck      # tsc --noEmit (strict)
npm run test:predict   # Python prediction unit tests
npm run test:rules     # Firebase RTDB security-rule matrix (needs Java + emulator)
npx tsx scripts/test-stock-prediction.ts                              # dummy dataset
npx tsx scripts/test-stock-prediction.ts --export barcodescanesp32-default-rtdb-export.json
npx tsc --noEmit       # type-check only (strict mode)
npm run migrate:strip-price           # dry-run: list legacy price fields in RTDB
npm run migrate:strip-price:apply     # actually delete them (idempotent)
python3 api/predict.py # test Python predict serverless locally (requires requests library for HTTP mode)
```

Notebook seminar/model website: `scripts/model_prediksi_stok_linear_regression.ipynb` reads `barcodescanesp32-default-rtdb-export.json`, mirrors the Python prediction pipeline, and reports MAE/RMSE/MAPE/R².

No test runner is wired up. Type-check + build is the verification loop. If `/prediksi` or dashboard changes touch hook order, run a full `rm -rf .next && npm run build` — minified React #310 (hook order) only shows in production builds.

Port 3000 is hard-coded in several places; `kill <pid>` the existing `next-server` process before restarting.

## Environment

Firebase Realtime Database + Auth is the backend. Client config keys are `NEXT_PUBLIC_FIREBASE_*` (client-exposed by design) and loaded from `.env.local`; `scripts/check-env.js` runs before `next dev` and blocks startup if they are missing. Admin Vercel Functions additionally need server-only `FIREBASE_SERVICE_ACCOUNT` (one-line JSON or base64; loader accepts both). Never prefix service account with `NEXT_PUBLIC_` and never commit it.

## Architecture

This is a Next.js 16 App Router app (Turbopack) paired with an ESP32 firmware sketch (`GM67_ESP32_BARCODESCANNER.ino`, single-mode inventory scanner, v6.5.15). The web app and the firmware share one Firebase Realtime Database.

### Data flow

- **ESP32 → Firebase**: firmware PUTs directly to `/devices/{deviceId}` (heartbeat every ~5s, includes batteryLevel/rssi/scanMode) and pushes scans to `/scans/{id}`. Firmware also reads `/inventory` to display product info on its OLED.
- **Firebase → web**: every `hooks/use-firebase.ts` hook subscribes via `onValue` — inventory, scans, devices, transactions are all reactive. No polling.
- **Web → Firebase**: all stock changes (dashboard + ESP32 scan popup) use **atomic `adjustStock()`** — a single multi-path `update()` that writes `inventory/{id}/quantity` via server-side `increment(delta)` AND creates `transactions/{id}` in one atomic operation. This eliminates race conditions from concurrent writes (scanner + dashboard + multi-tab). Operator = `"Dashboard"` for manual, `"Scanner"` for ESP32.
- **Unknown barcode quick add**: `components/unified-quick-action-popup.tsx` handles ESP32 scans whose barcode is not yet in `/inventory`. It queries the Next.js API `/api/lookup?barcode=...` which queries Searchanise API (`searchserverapi1.com`) with fallback catalog scraping of the Honda Cengkareng website to auto-fill the "Tambah Produk Baru" form (barcode, name, category, quantity, minStock, supplier, description, lastUpdated). `id`, `createdAt`, and `updatedAt` are handled by `firebaseHelpers.addInventoryItem`. Do not reintroduce a `price` field.
- **Device liveness & status**: `hooks/use-realtime-device-status.ts` subscribes to `/devices` via `onValue`. Firmware controls `scanMode` from the physical UP/OK/DOWN buttons and reports `"Manual"`, `"Auto IN"`, or `"Auto OUT"` inside each heartbeat. If a device goes offline (lastSeen age > 30s, evaluated every 1s), the dashboard treats it as offline until the next heartbeat.
- **Auto stock mode**: When scanner mode is set to `Auto IN` or `Auto OUT` on the device, scanned barcodes matching existing inventory automatically adjust stock by +1 or -1 directly from the firmware and create a `transactions/{id}` record with `operator: "Scanner"`. Manual mode still sends scans for the web quick-action flow.
- **Admin server API**: `/api/admin/*` are Next.js Route Handlers for user/device administration. `/api/lookup` is the Next.js route handler for the Honda catalog/Searchanise scraper API. `/api/predict` is mapped to the Python serverless function at `api/predict.py`.
- **Audit scope**: Karena Firebase Spark tidak mendukung database triggers, `/auditLogs` server-generated mencakup mutasi user/device melalui Vercel admin API. Write inventory/transaksi/scan yang langsung menuju RTDB tidak otomatis diaudit oleh Vercel.

### Inventory mode is the only mode

Attendance was fully removed from both web and firmware. Do not reintroduce attendance routes, scanner modes, or Firebase paths. `ScannerMode` in the firmware is a single-variant enum; `ESP32_CONFIG.MODES` in `lib/esp32-config.ts` has only `INVENTORY`.

### Data model is price-free

This project manages warehouse sparepart stock, not retail inventory. Price is intentionally not part of the schema:

- `InventoryItem` (`hooks/use-firebase.ts`) has no `price` field.
- `Transaction` has no `unitPrice` or `totalAmount` fields — it records stock movement (`type`, `quantity`, `reason`, `operator`, `timestamp`, optional `notes`) only.
- Firebase security rules do not require `price` on `/inventory` (see `firebase-rules-*.json`).
- Stats cards surface counts and units (Total Item · Total Transaksi · Stok Rendah · Scanner), never currency.
- CSV exports from dashboard and transaksi pages do not include price/total columns.

Legacy data migration: if the production database still has `price` on `/inventory/{id}` or `unitPrice`/`totalAmount` on `/transactions/{id}`, run `npm run migrate:strip-price` first (dry-run, prints counts), then `npm run migrate:strip-price:apply` (commits). The script is idempotent (sets absent keys to `null`, a no-op). The hook layer also strips these fields defensively when reading from `localStorage` cache, so old cached records will be cleaned up the next time the page loads.

### Pages and their responsibilities

- `app/page.tsx` — dashboard: inventory table, stock adjustment dialogs, prediction summary card (top-3 risk items via server-side batch `/api/predict?mode=batch`), stockout toast notifier (session-scoped, one notification per item per day), device status card with battery level (only shown when scanner is online). All hooks must be declared before any conditional early-return — see the #310 incident in git history.
- `app/transaksi/page.tsx` — transaction feed, filters by type/period/**source** (Manual = operator is Dashboard/Manual/empty; legacy Admin is also treated as Manual; Scanner = anything else). Pagination 50/halaman. Export CSV.
- `app/prediksi/page.tsx` — Simple Linear Regression prediction per item via Python serverless, detailed SVG chart in `components/prediction-chart.tsx`, model metrics (R², MAE, RMSE), forecast table, testing model panel, badge sumber model. Do not display anomaly detection in this page; it is outside the thesis scope.
- `app/scan/page.tsx` — manual barcode input, PDF417 barcode render via bwip-js (`components/pdf417-barcode.tsx`), scan history.
- `app/login/page.tsx` — Firebase email/password sign-in + password reset request. No public sign-up.
- `app/admin/users/page.tsx` & `app/admin/devices/page.tsx` — admin-only management UIs calling `/api/admin/*` via `lib/admin-api.ts`. Guarded by `components/auth-provider.tsx` (redirects non-admins). One-time secrets shown via `components/credential-dialog.tsx`.
- `app/audit/page.tsx` — admin-only read view of `/auditLogs`.
- `/api/predict` — **not a Next.js route**. `vercel.json` maps `api/predict.py` (Vercel Python function, `@vercel/python@4.3.1`, maxDuration 30s) to handle `/api/predict` directly. The frontend `fetch("/api/predict", …)` calls hit the Python handler. Supports single item and batch mode (`mode: 'batch'` for dashboard top-N risk items). There is no `app/api/predict/route.ts`.
- `/api/admin/*` — Next.js Route Handlers for user/device administration. These are the only `app/api/*` routes. They use Node.js runtime + Firebase Admin SDK, require a bearer ID token for an active admin, and write administration audit records. ESP32 never calls these endpoints and pushes to Firebase directly.

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

**Important**: `useFirebaseTransactions()` now accepts `null` as limit to fetch ALL transactions (no `limitToLast`). For prediction accuracy, always pass `null` to get the full history rather than a subset.

The prediction chart is hand-built SVG with no chart library dependency. It shows the last 30 days of history, forecast area, minimum-stock zone, hover/focus tooltip, safe/low/stockout status, and summary counts. Keep this SVG approach unless production build testing proves a new chart library works with the custom splitChunks config.

The `/prediksi` "Perkiraan Habis" card must stay synchronized with the chart/table by deriving its date from the first `prediction.forecast` point whose `predictedQuantity <= 0`. API `stockoutDate` is also based on the last reconstructed history timestamp, so backend and forecast dates stay aligned.

### Webpack config landmines

`next.config.mjs` has custom `splitChunks` with `maxSize: 50000` and `vendorSplit` that splits node_modules per-package. This previously shattered `recharts` across 7 chunks and broke cross-chunk references (`s(...) is not a function`). The fix was to render charts as hand-built SVG (`components/prediction-chart.tsx`) instead of recharts. `recharts` and `components/ui/chart.tsx` (the shadcn recharts wrapper) were removed entirely. If you add a library with heavy internal cross-module references, test a production build, not just dev.

### Service worker

`public/sw.js` caches pages and Firebase resources. After deploys, stale SW can serve old chunks and surface errors that look like code bugs. When debugging user-reported runtime errors, suggest unregister + clear site data before chasing source.

### Firmware notes (`GM67_ESP32_BARCODESCANNER.ino`)

Single file, ~1800 lines. Requires `Adafruit_GFX`, `Adafruit_SSD1306`, `esp_adc_cal`, `driver/adc` libraries; OTA additionally uses `Update.h`, `esp_ota_ops.h`, `WiFiClientSecure`, and mbedTLS (`mbedtls_sha256`, `mbedtls_pk_verify`). OLED wired on SDA=21, SCL=22, address 0x3C. Firmware version constant `FIRMWARE_VERSION = "6.5.15"` is reported in heartbeat payload and shown on the boot screen. EEPROM layout: WiFi config at 0, device config at 512, size 1024. Heartbeat PUTs the full device state (including batteryLevel, rssi, scanMode) to `/devices/{deviceId}` every 5s. Scan mode is controlled from the physical buttons and `/deviceCommands/{deviceId}/scanMode` is ignored by current firmware.

Battery monitoring: `esp_adc_cal` eFuse Vref calibration, EMA smoothing (α=0.05), hysteresis ±2%, range 3200–3800mV. Battery sampled before HTTP request to avoid WiFi voltage sag. OLED shows 4-bar battery icon + 4-bar WiFi signal icon (RSSI-based).

### OTA firmware update (HTTP-pull)

Remote firmware update dispatched from the admin panel. Flow: admin builds/signs via GitHub Actions (`.github/workflows/firmware-ota.yml`, secret `OTA_SIGNING_PRIVATE_KEY`, published as a GitHub Release `firmware-v*` with `.bin` + `manifest.json`) → admin dispatches a version → `app/api/admin/devices/ota/route.ts` writes `/deviceCommands/{deviceId}/ota` (commandId, version, binaryUrl, sha256, signature, size) via Admin SDK → ESP32 `checkForOtaCommand()` polls every 8s, `performOtaUpdate()` downloads + verifies (SHA-256 + ECDSA P-256 via embedded `OTA_PUBLIC_KEY_PEM`) + flashes (`Update.h`), reboots, `validateOtaBootSuccess()` commits via `esp_ota_mark_app_valid_cancel_rollback()` on first OK heartbeat or `Update.rollBack()` after 3 failed boots → device reports phases to `/deviceOtaStatus/{deviceId}`. Gated on battery ≥30% + idle (else reports `"deferred"`).

- `lib/server/firmware-ota.ts` is the GitHub API integration (env: `GITHUB_OTA_REPO`, `GITHUB_OTA_TOKEN`, `GITHUB_OTA_WORKFLOW` default `firmware-ota.yml`, `GITHUB_OTA_REF` default `555`). It takes `binaryUrl` from the release asset list, NOT the manifest, to prevent manifest-tampering redirects.
- Admin routes: `app/api/admin/devices/ota` (GET/POST/DELETE), `app/api/admin/firmware/build` (POST), `app/api/admin/firmware/releases` (GET), `app/api/admin/firmware/builds` (GET). UI: `components/firmware-ota-panel.tsx` in `app/admin/devices/page.tsx`. Contracts: `types/firmware.ts`.
- `/deviceCommands` + `/deviceOtaStatus` rules exist **only** in `firebase-rules-strict.json` — must be the deployed ruleset or OTA polling 403s.
- `OTA_PUBLIC_KEY_PEM` in the sketch must be the pair of the CI signing key, or all signature verification fails.
- CI rejects a build whose dispatch version ≠ the sketch's `FIRMWARE_VERSION`.

## Coding conventions

- TypeScript strict mode, paths alias `@/*`.
- Hooks in `hooks/` are all client-only (`"use client"`); they own Firebase subscriptions and cleanup via returned `Unsubscribe`.
- Place all hook calls before conditional returns in pages — React #310 surfaces only in prod builds.
- UI is shadcn/ui + Radix via `components/ui/*`. Dashboard-specific composites live in `components/dashboard/`.
- Indonesian is the user-facing language in pages, toasts, and labels. Keep new UI copy in Indonesian to match.
- Prediction/forecast code uses `Math.max(0, …)` to clamp forecasts and assumes timestamps in ms.
- All stock mutations go through `firebaseHelpers.adjustStock()` (atomic multi-path `update()` with `increment()`). Never do read-modify-write on quantity.
- Dashboard edit item dialog can update product metadata including `minStock`. Quantity edits from that dialog must still be applied as an atomic delta through `firebaseHelpers.adjustStock()`, not by writing absolute quantity.
- ESP32 unknown-barcode quick add should reuse `useFirebaseInventory.addItem()` and sanitize numeric fields before writing (`quantity` and `minStock` must be non-negative numbers). Do not write a `price` field — the inventory schema is price-free.
- Barcode rendering uses bwip-js for PDF417 (2D). Component: `components/pdf417-barcode.tsx`.
- Anomaly detection is intentionally not surfaced in the `/prediksi` UI or chart. If `api/predict.py` returns an `anomalies` field, frontend code should ignore it unless the thesis scope changes.
- `hooks/use-toast.ts` uses `TOAST_LIMIT = 5` (raised from 1 so loop-driven
  stockout/battery notifications in `app/page.tsx` and device-transition
  notifications in `hooks/use-realtime-device-status.ts` can show
  multiple toasts in a batch). Session-scoped dedup (`sessionStorage` +
  `previousStatusRef`) keeps repeat alerts from flooding the queue.
- API surfaces are intentionally limited: `/api/predict` is the Vercel Python
  function at `api/predict.py`; `/api/admin/*` are authenticated Vercel Node.js
  Functions for user/device administration. Inventory, transaction, scan, and
  heartbeat traffic still goes directly through `firebase/database`.
- Admin one-time secrets (temporary passwords, scanner credentials, reset
  links) are surfaced via `components/credential-dialog.tsx` — a persistent
  dialog with copy buttons. Never put a one-time secret in a toast; it
  disappears before the user can copy it.
- `FIREBASE_SERVICE_ACCOUNT` is server-only (one-line JSON or base64;
  `lib/server/firebase-admin.ts` accepts both). On Vercel set it for **both
  Preview and Production** — the deploy branch `555` is the Production branch,
  so a Preview-only secret is invisible to it.
- `functions/` (Firebase Cloud Functions) was removed; the project cannot use
  Blaze. Do not reintroduce callable/blocking functions, RTDB triggers, or a
  device-status sweeper. Server logic lives in Vercel Functions.
