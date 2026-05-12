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
```

No test runner is wired up. Type-check + build is the verification loop. If `/prediksi` or dashboard changes touch hook order, run a full `rm -rf .next && npm run build` — minified React #310 (hook order) only shows in production builds.

Port 3000 is hard-coded in several places; `kill <pid>` the existing `next-server` process before restarting.

## Environment

Firebase Realtime Database is the only backend. All config keys are `NEXT_PUBLIC_FIREBASE_*` (client-exposed by design) and loaded from `.env.local`. `scripts/check-env.js` runs before `next dev` and blocks startup if keys are missing. Values also live in `DEPLOYMENT.md` for reference.

## Architecture

This is a Next.js 15 App Router app paired with an ESP32 firmware sketch (`GM67_ESP32_BARCODESCANNER.ino`, single-mode inventory scanner, v6). The web app and the firmware share one Firebase Realtime Database.

### Data flow

- **ESP32 → Firebase**: firmware PUTs directly to `/devices/{deviceId}` (heartbeat every ~8s) and pushes scans to `/scans/{id}`. Firmware also reads `/inventory` to display product info on its OLED and decrements quantity after a successful lookup.
- **Firebase → web**: every `hooks/use-firebase.ts` hook subscribes via `onValue` — inventory, scans, devices, transactions are all reactive. No polling.
- **Web → Firebase**: dashboard stock adjustments write to `/inventory/{id}` and ALSO create a `/transactions/{id}` record via `firebaseHelpers.addTransaction` (operator = `"Dashboard"`). The transaction feed is the source of truth for stock history.
- **Device liveness**: `hooks/use-realtime-device-status.ts` subscribes to `/devices` via `onValue`, then re-evaluates online/offline client-side every 3 seconds based on the age of `lastHeartbeat`/`lastSeen`. Threshold: 15s. There is an older `/api/check-device-status` route still present but no longer called from any hook — kept as a cron/fallback helper.

### Inventory mode is the only mode

Attendance was fully removed from both web and firmware. Do not reintroduce attendance routes, scanner modes, or Firebase paths. `ScannerMode` in the firmware is a single-variant enum; `ESP32_CONFIG.MODES` in `lib/esp32-config.ts` has only `INVENTORY`.

### Pages and their responsibilities

- `app/page.tsx` — dashboard: inventory table, stock adjustment dialogs, prediction summary card (top-3 risk items), stockout toast notifier (session-scoped, one notification per item per day). All hooks must be declared before any conditional early-return — see the #310 incident in git history.
- `app/transaksi/page.tsx` — transaction feed, filters by type/period/**source** (Manual = operator is Dashboard/Manual/empty; Scanner = anything else).
- `app/prediksi/page.tsx` — linear regression prediction per item, SVG-native chart in `components/prediction-chart.tsx`.
- `app/scan/page.tsx` — manual/camera barcode input helper.
- `app/api/current-page/route.ts`, `/api/firebase-*`, `/api/heartbeat`, `/api/devices-status`, `/api/barcode-scan`, `/api/check-device-status` — helper endpoints for ESP32 and diagnostics.

### Prediction pipeline

`lib/stock-prediction.ts` implements OLS linear regression on a daily stock timeseries. Because the Firebase schema stores only current `quantity` + transaction history (not daily snapshots), `buildDailySeriesFromTransactions` reconstructs the series by walking backwards from current quantity through daily signed deltas. The same module is used by the `/prediksi` page, the dashboard summary card, and the standalone `scripts/test-stock-prediction.ts`. Minimum 2 points to fit — callers must guard.

### Webpack config landmines

`next.config.mjs` has custom `splitChunks` with `maxSize: 50000` and `vendorSplit` that splits node_modules per-package. This previously shattered `recharts` across 7 chunks and broke cross-chunk references (`s(...) is not a function`). The fix was to drop recharts entirely in favor of SVG charts. If you add a library with heavy internal cross-module references, test a production build, not just dev.

### Service worker

`public/sw.js` caches pages and Firebase resources. After deploys, stale SW can serve old chunks and surface errors that look like code bugs. When debugging user-reported runtime errors, suggest unregister + clear site data before chasing source.

### Firmware notes (`GM67_ESP32_BARCODESCANNER.ino`)

Single file, ~980 lines. Requires `Adafruit_GFX` and `Adafruit_SSD1306` libraries. OLED wired on SDA=21, SCL=22, address 0x3C. Firmware version constant `FIRMWARE_VERSION = "6.0"` is reported in heartbeat payload and shown on the boot screen. EEPROM layout: WiFi config at 0, device config at 512, size 1024. Heartbeat PUTs the full device state (not merge) to `/devices/{deviceId}` every 8s.

## Coding conventions

- TypeScript strict mode, paths alias `@/*`.
- Hooks in `hooks/` are all client-only (`"use client"`); they own Firebase subscriptions and cleanup via returned `Unsubscribe`.
- Place all hook calls before conditional returns in pages — React #310 surfaces only in prod builds.
- UI is shadcn/ui + Radix via `components/ui/*`. Dashboard-specific composites live in `components/dashboard/`.
- Indonesian is the user-facing language in pages, toasts, and labels. Keep new UI copy in Indonesian to match.
- Prediction/forecast code uses `Math.max(0, …)` to clamp forecasts and assumes timestamps in ms.
