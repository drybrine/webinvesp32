# 🔧 Port 3001 Debug Guide

## 🤔 Apakah Port 3001 Menyebabkan Masalah?

### **Kemungkinan Masalah Port:**

1. **CORS Issues** - Cross-origin requests blocked
2. **Firebase Configuration** - Firebase expecting different origin
3. **Service Worker** - SW cache untuk port yang berbeda
4. **Browser Cache** - Cache dari port sebelumnya

## 🔍 TEST LANGKAH DEMI LANGKAH:

### **Test 1: Gunakan Port 3000**
```bash
PORT=3000 npm run dev
```
Akses: `http://localhost:3000`

### **Test 2: Gunakan Port 3001**
```bash
PORT=3001 npm run dev
```
Akses: `http://localhost:3001`

### **Test 3: Gunakan IP + Port**
```bash
npm run dev
```
Akses: `http://192.168.0.104:3001`

## 🔍 YANG HARUS DICEK:

### **1. Console Log Firebase**
Di setiap test, cek apakah muncul:
```
🔧 RealtimeScanProvider useEffect triggered
🔗 Setting up Firebase listener for scans...
✅ Firebase listener setup complete
📡 Firebase onValue callback triggered! (saat ESP32 scan)
```

### **2. Network Tab**
- Buka F12 → Network tab
- Cek apakah ada request ke Firebase
- Cek apakah ada error CORS atau 403

### **3. Debug Panel**
Lihat debug panel di pojok kanan atas:
- `showPopup: true/false`
- `currentBarcode: null/barcode`

## 🛠️ SOLUSI BERDASARKAN HASIL:

### **Jika Port 3000 WORK, Port 3001 TIDAK:**
- Ada masalah CORS atau Firebase origin
- Perlu update Firebase authorized domains

### **Jika SEMUA Port TIDAK WORK:**
- Masalah di Firebase configuration
- Masalah di API key atau database rules

### **Jika Firebase Log TIDAK MUNCUL:**
- Firebase tidak terkonfigurasi
- Database connection error

### **Jika Firebase Log MUNCUL tapi Popup TIDAK:**
- Masalah di logic trigger popup
- ESP32 data tidak sesuai format

## 🎯 NEXT STEPS:

1. **Test dengan port 3000 dulu**
2. **Lihat console log lengkap**
3. **Report hasil ke developer**
4. **Jika perlu, update Firebase authorized domains**

## 🔧 Firebase Authorized Domains:

Jika masalah di port, tambahkan di Firebase Console:
- Go to: Authentication → Settings → Authorized domains
- Add: `localhost:3001`, `192.168.0.104:3001`

Tapi untuk Realtime Database, ini biasanya tidak perlu.