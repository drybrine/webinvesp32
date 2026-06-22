# Audit Findings — UI & Backend

**Date**: 2026-06-22
**Scope**: 10.6k LOC · 8 admin route handlers · 1 Python serverless · 4 client hooks · 6+ UI components · Firebase RTDB rules · config
**Method**: Multi-agent adversarial audit (74 finder+verifier agents + 5 focused security agents + inline review). Each finding verified by ≥2 independent reviewers reading actual code.

## Fix status

- ✅ Fixed: #1, #2, #3, #5, #6, #7, #8, #9, #10, #11, #12, #13.
- ⚠️ Deferred: #4 stock-ledger atomicity. Current direct-client Firebase model cannot strictly enforce paired inventory+transaction writes with a small rules-only patch. Proper fix = move stock mutations behind an authenticated Vercel API route using Admin SDK, then deny client writes to inventory quantity + transactions.

---

## HIGH

### 1. Identity Toolkit fallback bypasses token revocation check

- **File**: `lib/server/admin-api.ts:128-142`
- **Category**: authz / security
- **Problem**: `requireAdmin()` calls `verifyIdToken(token, true)` with `checkRevoked=true`. The catch block only re-throws three specific error codes: `auth/id-token-revoked`, `auth/id-token-expired`, `auth/argument-error`. Any OTHER error (network glitch, cert-fetch failure, `auth/internal-error`) silently falls through to `verifyWithIdentityToolkit()` at line 142, which calls the `accounts:lookup` REST endpoint. That endpoint does **not** enforce token revocation. A revoked admin session can still pass auth if the primary verifier fails for a transient reason. The downstream `getUser()` recheck (L149-154) verifies `disabled` and `role` but does **not** compare `tokensValidAfterTime` against token `iat`.
- **Fix**: Fail closed — on any `verifyIdToken` failure, reject with 401. If a fallback is needed for resilience, compare `user.tokensValidAfterTime` against the decoded token's `iat` before accepting:

```typescript
// In the catch block (line 128), replace the fallback with:
catch (error) {
  const code = typeof error === "object" && error !== null && "code" in error
    ? String((error as {code: unknown}).code)
    : "unknown"
  console.error("Firebase ID token verification failed:", code)
  // Fail closed on ALL verification errors
  if (code === "auth/id-token-revoked") {
    throw new AdminApiError("unauthorized", "Sesi telah dicabut. Silakan masuk kembali")
  }
  throw new AdminApiError("unauthorized", "Verifikasi token gagal. Silakan coba lagi")
}
```

---

### 2. `ignoreBuildErrors: true` disables TypeScript safety

- **File**: `next.config.mjs:3-4`
- **Category**: config / correctness
- **Problem**: `typescript: { ignoreBuildErrors: true }` lets the build succeed even with type errors. Since there is no test runner, the type-check + build loop is the **only** verification mechanism. Type bugs ship to production silently.
- **Fix**: Set `ignoreBuildErrors: false`. Then fix any type errors that surface during `npm run build`.

```javascript
// next.config.mjs line 3-4
typescript: {
  ignoreBuildErrors: false,
},
```

---

## MEDIUM

### 3. RTDB rules: no `hasOnly()` — extra fields accepted on inventory/transactions

- **File**: `firebase-rules-strict.json:9,17`
- **Category**: data-integrity / security
- **Problem**: Rules use `hasChildren([...])` (minimum required fields) but no `hasOnly()` allowlist. Any authenticated client with write access can add arbitrary extra fields (`price`, `unitPrice`, `totalAmount`, HTML-laden notes, etc.) to `/inventory/{id}` and `/transactions/{id}`. The price-free invariant is not enforced at the database boundary.
- **Fix**: Add `.validate` rules with `newData.hasOnly([...])` allowlists:

```json
// For /inventory/$itemId
".validate": "newData.hasOnly(['name','category','quantity','barcode','minStock','location','description','supplier','lastUpdated','operationId','updatedByUid','createdAt','updatedAt','deleted'])"

// For /transactions/$txId
".validate": "newData.hasOnly(['id','type','productName','productBarcode','quantity','reason','operator','operatorUid','operationId','timestamp','notes'])"
```

---

### 4. RTDB rules: stock ledger atomicity not enforced

- **File**: `firebase-rules-strict.json:8-17`
- **Category**: data-integrity
- **Problem**: A client can write `/inventory/{id}/quantity` directly without creating a matching `/transactions` entry (or vice versa). The app uses atomic `adjustStock()` (multi-path `update()` with `increment()`), but rules don't enforce paired writes. A malicious or buggy SDK client can desync the stock ledger from the transaction log.
- **Fix** (pick one):
  - **Option A** (recommended): Move stock mutations to an authenticated Vercel API route using Admin SDK. Set client `.write: false` for `/inventory/$itemId/quantity` and `/transactions`.
  - **Option B**: Key transactions by `operationId` and add a rule that checks `/transactions/$operationId` exists when `/inventory/$itemId/quantity` is written (and vice versa) within the same multi-path update.

---

### 5. CSV formula injection

- **File**: `lib/csv.ts:6-7`
- **Category**: security
- **Problem**: `buildCsv()` wraps values in double quotes and escapes inner quotes, but does **not** escape formula-injection characters (`=`, `+`, `-`, `@`, `\t`, `\r`). If an inventory name or description starts with `=cmd(...)` or `+cmd(...)`, Excel/Google Sheets will execute it when the CSV is opened.
- **Fix**: Prepend a tab character to cell values that start with formula-trigger characters:

```typescript
export function buildCsv(rows: unknown[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const value = cell === null || cell === undefined ? "" : String(cell)
          // Escape formula injection: prepend tab to values starting with =, +, -, @
          const safe = /^[=+\-@\t\r]/.test(value) ? `\t${value}` : value
          return `"${safe.replace(/"/g, '""')}"`
        })
        .join(","),
    )
    .join("\n")
}
```

---

### 6. Python predict: raw exception text leaked to caller

- **File**: `api/predict.py:174`
- **Category**: error-handling / security
- **Problem**: The generic `except Exception as e` handler returns `str(e)` in the JSON response body. This could leak internal file paths, stack trace fragments, Firebase database URLs, or other sensitive server information to the client.
- **Fix**: Return a generic error message; log the real error server-side only:

```python
except Exception as e:
    import traceback
    traceback.print_exc()  # server-side logging
    self._send_json(500, {'error': 'Terjadi kesalahan internal', 'source': 'lr-consumption-py'})
```

---

### 7. Python predict: batch mode crashes on malformed items

- **File**: `api/predict.py:195,209`
- **Category**: validation / error-handling
- **Problem**: In `_handle_batch()`, `int(t.get('timestamp', 0))` at line 195 and `int(item.get('quantity', 0))` at line 209 are called **outside** the per-item try/except block (which starts at line 214). If any single transaction has a non-numeric `timestamp` or any item has a non-numeric `quantity`, `int()` raises `ValueError` → the entire batch request returns 500. The per-item error handling at L214-250 only catches errors from `predict_stock()` and below.
- **Fix**: Move `current_qty = int(...)` inside the try block. Add safe numeric casting for the timestamp filter:

```python
# Line 195: safe timestamp filter
recent_tx = []
for t in transactions:
    try:
        ts = int(t.get('timestamp', 0))
    except (TypeError, ValueError):
        continue
    if ts >= cutoff:
        recent_tx.append(t)

# Line 209: move inside try block
for item in items:
    if item.get('deleted') or not item.get('barcode'):
        continue
    try:
        item_tx = tx_by_barcode.get(item['barcode'], [])
        current_qty = int(item.get('quantity', 0))  # now inside try
        series = build_daily_series(item_tx, current_qty)
        # ... rest of prediction logic
    except Exception:
        continue
```

---

### 8. Missing Content-Security-Policy and HSTS headers

- **File**: `vercel.json:13-36` and `next.config.mjs:25-37`
- **Category**: config / security
- **Problem**: No `Content-Security-Policy` or `Strict-Transport-Security` response headers are configured. The app loads Firebase JS SDK and connects to external Firebase domains — a CSP would limit injection surface. HSTS is free security for HTTPS-only apps.
- **Fix**: Add headers in `next.config.mjs` (single source of truth — see also finding #10):

```javascript
// Add to the headers array in next.config.mjs
{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
{ key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
{ key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.firebaseapp.com; connect-src 'self' https://*.firebaseio.com https://*.googleapis.com wss://*.firebaseio.com https://*.firebasedatabase.app; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" },
```

> **Note**: The CSP above is a baseline. Test thoroughly — Firebase SDK may need additional directives depending on features used. Start with `Content-Security-Policy-Report-Only` to identify violations before enforcing.

---

## LOW

### 9. Service worker serves stale chunks after deploy

- **File**: `public/sw.js:1,114-147`
- **Category**: correctness
- **Problem**: Cache-first strategy for same-origin resources with a static cache name (`stokmanager-v2`) that is never bumped per deploy. After deploying new code, the SW serves old cached JS chunks with stale hashes → broken app until user manually clears cache or the SW eventually updates.
- **Fix** (pick one):
  - Switch HTML/JS to network-first strategy (cache-first only for static assets like images/fonts)
  - Inject a build hash into `CACHE_NAME` at build time (e.g. `stokmanager-${BUILD_ID}`)
  - Add `?v=${BUILD_HASH}` to precached URLs

---

### 10. Duplicate security headers + deprecated X-XSS-Protection

- **File**: `vercel.json:13-36` and `next.config.mjs:29-33`
- **Category**: config
- **Problem**: `X-Content-Type-Options`, `X-Frame-Options`, and `X-XSS-Protection` are set in **both** `vercel.json` and `next.config.mjs` `headers()`. `X-XSS-Protection: 1; mode=block` is deprecated and can actually introduce XSS in older IE versions.
- **Fix**:
  1. Remove the `headers` block from `vercel.json` entirely — use `next.config.mjs` as single source of truth
  2. Remove `X-XSS-Protection` from `next.config.mjs`

---

### 11. Device heartbeat: unbounded/spoofed telemetry accepted

- **File**: `firebase-rules-strict.json:32-33`
- **Category**: data-integrity
- **Problem**: Device can write to `/devices/{deviceId}` with weak validation. Fields like `batteryLevel`, `rssi`, `version`, `scanCount`, `freeHeap`, `currentMode`, `lastHeartbeat` are displayed in the admin dashboard but not typed or range-checked in rules. `lastSeen` only checks `isNumber()`, not proximity to server `now`. A compromised device account can spoof its own dashboard telemetry.
- **Fix**: Add `hasOnly()` field allowlist + type/range `.validate` rules:

```json
"$deviceId": {
  ".validate": "newData.hasOnly(['status','lastSeen','lastHeartbeat','ipAddress','batteryLevel','rssi','version','scanCount','freeHeap','currentMode','uptime','name'])",
  "batteryLevel": { ".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() <= 100" },
  "lastSeen": { ".validate": "newData.isNumber() && newData.val() <= now + 30000" }
}
```

---

### 12. OTA status spoofable by device

- **File**: `firebase-rules-strict.json:45-46`
- **Category**: data-integrity
- **Problem**: Device can write arbitrary `phase`, `version`, `commandId`, `message` fields to `/deviceOtaStatus/{deviceId}`. Rules validate only `phase`, `updatedAt`, and optional `progress` — no cross-check against `/deviceCommands/{deviceId}/ota`. Admin panel can be misled about OTA rollout state.
- **Fix**: Add `hasOnly()` allowlist + type/length checks + constrain `updatedAt` near `now`:

```json
"$deviceId": {
  ".validate": "newData.hasOnly(['phase','updatedAt','progress','version','commandId','message']) && newData.child('updatedAt').isNumber() && newData.child('updatedAt').val() <= now + 30000"
}
```

---

### 13. `check-env.js` doesn't validate server-only secrets

- **File**: `scripts/check-env.js:1-33`
- **Category**: config
- **Problem**: Only validates `NEXT_PUBLIC_FIREBASE_*` client vars. Server routes require `FIREBASE_SERVICE_ACCOUNT` (or `FIREBASE_SERVICE_ACCOUNT_BASE64`) but this is not checked at startup. Missing secret causes unclear 500 errors at runtime when admin routes are hit.
- **Fix**: Add an optional warning (not blocking — dev env may not need admin routes):

```javascript
// Add after the required check (line 33):
const serverOptional = ["FIREBASE_SERVICE_ACCOUNT", "FIREBASE_SERVICE_ACCOUNT_BASE64"]
const hasServerSecret = serverOptional.some((key) => values[key])
if (!hasServerSecret) {
  console.warn(
    "Warning: No FIREBASE_SERVICE_ACCOUNT or FIREBASE_SERVICE_ACCOUNT_BASE64 found. " +
    "Admin API routes (/api/admin/*) will fail at runtime."
  )
}
```

---

## Rejected (false-positive / by-design)

| Claim | Reason |
|-------|--------|
| Device liveness ignores `lastHeartbeat` | FP: `computeStatus()` correctly uses `lastSeen` which firmware writes as `{".sv":"timestamp"}` (server time). `lastHeartbeat` is local device ms — not server-synced, using it would cause clock skew issues. |
| Stockout/battery toast one-shot refs block alerts | FP: `sessionStorage` dedup per item/device per day works correctly. `ref.current = true` prevents re-running within same effect cycle but new data triggers effect re-run via dependency change. |
| Edit-item quantity delta can drive stock negative | FP: `handleStockAdjustment` (L442) checks `newQuantity < 0`. Edit dialog path uses `adjustStock` with server-side `increment()` — RTDB rules validate `quantity >= 0`. |
| Pagination currentPage exceeds totalPages | Cosmetic; self-corrects on next render cycle. |
| Admin route gate `startsWith('/admin')` | Current routes are all under `/admin/`; adequate for existing structure. |

---

## Summary

| Severity | Count | Key areas |
|----------|-------|-----------|
| 🔴 High | 2 | Auth bypass, disabled type safety |
| 🟡 Medium | 6 | RTDB schema, CSV injection, Python validation, missing headers |
| 🟢 Low | 5 | SW caching, duplicate headers, telemetry validation, env check |
| **Total** | **13** | |

### Recommended fix order

1. **#1** — Token revocation bypass (security, quick fix)
2. **#5** — CSV formula injection (security, one-liner)
3. **#6** — Python exception leak (security, one-liner)
4. **#2** — `ignoreBuildErrors: false` (then fix type errors)
5. **#7** — Python batch validation (correctness)
6. **#3 + #4** — RTDB rules hardening (data integrity)
7. **#8 + #10** — Headers consolidation + CSP/HSTS
8. **#9** — SW cache versioning
9. **#11 + #12** — Device/OTA telemetry validation
10. **#13** — Env check improvement
