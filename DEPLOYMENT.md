# Deployment Guide - Vercel

## 🚀 Environment Variables Setup

### Required Environment Variables untuk Vercel:

1. **NEXT_PUBLIC_FIREBASE_API_KEY**
   - Value: `YOUR_FIREBASE_API_KEY`

2. **NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN**
   - Value: `barcodescanesp32.firebaseapp.com`

3. **NEXT_PUBLIC_FIREBASE_DATABASE_URL**
   - Value: `https://barcodescanesp32-default-rtdb.asia-southeast1.firebasedatabase.app`

4. **NEXT_PUBLIC_FIREBASE_PROJECT_ID**
   - Value: `barcodescanesp32`

5. **NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET**
   - Value: `barcodescanesp32.firebasestorage.app`

6. **NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID**
   - Value: `330721800882`

7. **NEXT_PUBLIC_FIREBASE_APP_ID**
   - Value: `1:330721800882:web:f270138ef40229ec2ccfab`

8. **NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID**
   - Value: `G-7J89KNJCCT`

## 📋 Steps untuk Deploy di Vercel:

### 1. **Import Project dari GitHub**
```bash
1. Masuk ke vercel.com
2. Klik "Import Project" atau "Add New Project"
3. Pilih repository: 100percentsrgb/webinvesp32
4. Branch: 555
```

### 2. **Set Environment Variables**
Di Vercel Dashboard > Project Settings > Environment Variables, tambahkan:

**Key**: `NEXT_PUBLIC_FIREBASE_API_KEY`  
**Value**: `YOUR_FIREBASE_API_KEY`  
**Environment**: Production, Preview, Development

**Key**: `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`  
**Value**: `barcodescanesp32.firebaseapp.com`  
**Environment**: Production, Preview, Development

**Key**: `NEXT_PUBLIC_FIREBASE_DATABASE_URL`  
**Value**: `https://barcodescanesp32-default-rtdb.asia-southeast1.firebasedatabase.app`  
**Environment**: Production, Preview, Development

**Key**: `NEXT_PUBLIC_FIREBASE_PROJECT_ID`  
**Value**: `barcodescanesp32`  
**Environment**: Production, Preview, Development

**Key**: `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`  
**Value**: `barcodescanesp32.firebasestorage.app`  
**Environment**: Production, Preview, Development

**Key**: `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`  
**Value**: `330721800882`  
**Environment**: Production, Preview, Development

**Key**: `NEXT_PUBLIC_FIREBASE_APP_ID`  
**Value**: `1:330721800882:web:f270138ef40229ec2ccfab`  
**Environment**: Production, Preview, Development

**Key**: `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID`  
**Value**: `G-7J89KNJCCT`  
**Environment**: Production, Preview, Development

### 3. **Build Settings (Auto-detected)**
Vercel akan otomatis mendeteksi:
```bash
Framework Preset: Next.js
Build Command: npm run build
Output Directory: .next
Install Command: npm install
Development Command: npm run dev
```

### 4. **Deploy**
```bash
1. Klik "Deploy" 
2. Tunggu build process (~2-3 menit)
3. Vercel akan memberikan URL production
```

## ⚠️ Important Notes:

1. **Environment Variables**: Semua variable harus diset di Vercel Dashboard, tidak cukup hanya di file .env.local
2. **NEXT_PUBLIC_ Prefix**: Semua Firebase config menggunakan prefix ini karena dibutuhkan di client-side
3. **Build Timeout**: Build process membutuhkan ~2-3 menit
4. **Region**: Pilih region terdekat untuk performa optimal

## 🔍 Troubleshooting:

### Error: "System environment variables will not be available"
**Solution**: Pastikan semua environment variables sudah diset di Vercel Dashboard

### Build Failed
**Solution**: 
1. Cek logs di Vercel Dashboard
2. Pastikan semua dependencies ter-install
3. Verifikasi environment variables

### Firebase Connection Error
**Solution**:
1. Cek Firebase project masih aktif
2. Verifikasi API keys dan URLs
3. Pastikan Firebase Realtime Database rules allow read/write

## 📱 Production URLs:
- **Main**: https://your-project.vercel.app
- **Preview**: https://your-project-git-555-your-team.vercel.app

## 🔄 Auto-Deploy:
Setiap push ke branch `555` akan trigger automatic deployment ke Vercel.

## Security and Firebase Cutover

Vercel Functions menangani operasi admin; Firebase RTDB tetap dideploy terpisah:

1. Aktifkan Firebase Authentication provider Email/Password.
2. Buat service account Firebase Admin dengan akses Auth + Realtime Database, lalu simpan JSON satu baris sebagai `FIREBASE_SERVICE_ACCOUNT` pada Vercel Preview dan Production. Jangan gunakan prefix `NEXT_PUBLIC_` dan jangan commit nilainya.
3. Set `ALLOWED_ORIGINS` untuk endpoint Python `/api/predict`; endpoint `/api/admin/*` same-origin dan tidak memakai wildcard CORS.
4. Deploy Vercel preview, kemudian gunakan service account yang sama atau Application Default Credentials untuk bootstrap admin:

```bash
npm run bootstrap:admin -- --email=admin@example.com --password='minimum-12-char' --name='Administrator'
```

5. Deploy `firebase-rules-migration.json` lebih dulu. File ini mempertahankan akses legacy sementara firmware dimigrasikan.
6. Login sebagai admin, daftarkan scanner di `/admin/devices`, lalu scan PDF417 kredensial satu kali dengan firmware 6.5.15. Verifikasi inventory lookup, heartbeat, scan, dan audit administrasi backend.
7. Buat GitHub environment `firebase-production` dengan approval, Workload Identity secrets, serta `FIREBASE_PROJECT_ID` untuk deploy rules.
8. Setelah backup RTDB dan verifikasi firmware, jalankan workflow `Deploy Strict Firebase Rules` (`firebase.strict.json`).

Strict rules menolak anonymous access, hard-delete inventory, perubahan ledger lama, dan seluruh client write ke `/auditLogs`. Pada Firebase Spark tidak ada blocking/database-trigger Functions: aplikasi tidak menyediakan UI signup dan rules menolak akun tanpa profil + role valid, sedangkan audit server-generated mencakup operasi administrasi melalui Vercel Functions. Path OTA `/deviceCommands` + `/deviceOtaStatus` hanya ada di `firebase-rules-strict.json` — harus jadi ruleset aktif agar polling OTA tidak kena 403.

## OTA Firmware Update Setup

OTA dispatch dari panel admin membutuhkan integrasi GitHub (build/sign firmware) + ruleset strict.

### Vercel env (Preview + Production)

| Key | Keterangan |
|-----|------------|
| `GITHUB_OTA_REPO` | `owner/repo` tempat workflow + release firmware (mis. `100percentsrgb/webinvesp32`). |
| `GITHUB_OTA_TOKEN` | GitHub PAT/token dengan akses `actions:write` + `contents:read` (trigger build, baca release). Server-only, jangan `NEXT_PUBLIC_`. |
| `GITHUB_OTA_WORKFLOW` | Opsional. Nama file workflow, default `firmware-ota.yml`. |
| `GITHUB_OTA_REF` | Opsional. Branch ref untuk dispatch build, default `555`. |

### GitHub Actions secret

- **`OTA_SIGNING_PRIVATE_KEY`** — private key ECDSA P-256 (PEM) untuk menandatangani `.bin`. Set di repo Settings → Secrets and variables → Actions.
- Public key pasangannya **wajib** ditanam sebagai `OTA_PUBLIC_KEY_PEM` di `GM67_ESP32_BARCODESCANNER.ino`. Mismatch → semua verifikasi tanda tangan di perangkat gagal.

### Verifikasi

1. Pastikan `firebase-rules-strict.json` adalah ruleset yang dideploy.
2. Build firmware via panel admin (`/admin/devices` → panel OTA) → tunggu GitHub Release `firmware-v*` muncul.
3. Dispatch ke 1 perangkat dulu (bukan batch) → pantau badge fase di panel + progress OLED.
4. CI menolak build bila versi dispatch ≠ `FIRMWARE_VERSION` di sketch (sekarang `6.5.15`).
