# Deployment Guide - Vercel

## 🚀 Environment Variables Setup

### Required Environment Variables untuk Vercel:

1. **NEXT_PUBLIC_FIREBASE_API_KEY**
   - Value: `AIzaSyBDMTHkz_BwbqKfkVQYvKEI3yfrOLa_jLY`

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
**Value**: `AIzaSyBDMTHkz_BwbqKfkVQYvKEI3yfrOLa_jLY`  
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
