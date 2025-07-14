# 📦 StokManager - Sistem Manajemen Inventaris Real-time

[![Next.js](https://img.shields.io/badge/Next.js-15.2.4-black)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.1.0-blue)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8.3-blue)](https://www.typescriptlang.org/)
[![Firebase](https://img.shields.io/badge/Firebase-Latest-orange)](https://firebase.google.com/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.4.17-06B6D4)](https://tailwindcss.com/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Production Ready](https://img.shields.io/badge/Production-Ready-brightgreen)](https://vercel.com/)

> 🚀 **Sistem manajemen inventaris dan absensi real-time dengan integrasi ESP32 dan pemindai barcode**
> 
> **StokManager** adalah solusi lengkap untuk manajemen stok dan inventory dengan teknologi IoT yang modern, menggabungkan web application berbasis Next.js dengan hardware ESP32 untuk scanning barcode real-time.

## 🌟 **PRODUCTION READY** - Siap Deploy!

✅ **Build Status**: Passing  
✅ **Environment**: Configured for Vercel  
✅ **Firebase**: Connected & Optimized  
✅ **Performance**: Optimized Bundle Size  
✅ **Security**: Production Headers Configured  

## 📋 Daftar Isi

- [✨ Fitur Utama](#-fitur-utama)
- [🔧 Teknologi](#-teknologi)
- [📱 Demo & Screenshot](#-demo--screenshot)
- [🚀 Quick Start](#-quick-start)
- [⚙️ Instalasi](#️-instalasi)
- [📦 Production Deployment](#-production-deployment)
- [🔥 Konfigurasi Firebase](#-konfigurasi-firebase)
- [🛠️ Development](#️-development)
- [📦 Deployment](#-deployment)
- [🏗️ Arsitektur](#️-arsitektur)
- [📡 API Endpoints](#-api-endpoints)
- [🔌 ESP32 Integration](#-esp32-integration)
- [🎯 Usage Guide](#-usage-guide)
- [🛡️ Security](#️-security)
- [🔧 Troubleshooting](#-troubleshooting)
- [📄 License](#-license)

## ✨ Fitur Utama

### 🏭 **Manajemen Inventaris**
- ✅ **Real-time Barcode Scanning** dengan ESP32
- ✅ **Product Information Management** 
- ✅ **Stock Tracking & Analytics**
- ✅ **Transaction History** dengan export Excel
- ✅ **QR Code Generation** untuk produk

### 👥 **Sistem Absensi**
- ✅ **NIM-based Attendance** untuk mahasiswa/karyawan
- ✅ **Real-time Status Monitoring**
- ✅ **Device Heartbeat Tracking**
- ✅ **Attendance Analytics & Reporting**

### 📱 **Web Application Features**
- ✅ **Responsive Design** (Mobile & Desktop)
- ✅ **Real-time Updates** dengan Firebase
- ✅ **Modern UI/UX** dengan shadcn/ui + Radix UI
- ✅ **Dark/Light Theme** toggle
- ✅ **Toast Notifications** dengan auto-dismiss
- ✅ **Fast Refresh** untuk development optimal
- ✅ **TypeScript Strict Mode** untuk type safety
- ✅ **Progressive Web App (PWA)** ready

### 🔧 **Device Management**
- ✅ **ESP32 Device Monitoring** dengan heartbeat real-time
- ✅ **Connection Status Tracking** dan auto-reconnection
- ✅ **Multiple Device Support** dalam satu network
- ✅ **Remote Device Configuration** via web interface
- ✅ **Offline Mode Detection** dan local storage fallback

### 🔥 **Backend & Data Processing**
- ✅ **Firebase Realtime Database** untuk sync instant
- ✅ **RESTful API** endpoints untuk ESP32 integration
- ✅ **WebSocket Communication** untuk real-time updates
- ✅ **Data Export** ke Excel/CSV format
- ✅ **Database Rules** untuk security dan validation

## 🔧 Teknologi Stack

### **Frontend**
- **Framework**: Next.js 15.2.4 dengan App Router
- **UI Library**: React 19.1.0
- **Language**: TypeScript 5.8.3 (strict mode)
- **Styling**: TailwindCSS 3.4.17 + shadcn/ui + Radix UI
- **State Management**: React Hooks + Context API
- **Real-time Updates**: Firebase listeners + WebSocket
- **Notifications**: Sonner toast dengan auto-dismiss

### **Backend & Database**
- **Database**: Firebase Realtime Database
- **API Routes**: Next.js serverless functions
- **Real-time**: WebSocket + Firebase listeners
- **Authentication**: Firebase Auth dengan session management
- **File Processing**: Export ke Excel dengan react-excel-export

### **Hardware Integration**
- **Microcontroller**: ESP32 (Arduino framework)
- **Scanner Module**: Barcode scanner via UART/Serial
- **Connectivity**: WiFi 802.11 b/g/n
- **Communication**: HTTP REST API + WebSocket
- **Protocol**: JSON untuk data exchange

### **UI Components**
- **Radix UI** - Accessible primitives
- **Lucide React** - Icon library
- **React Hook Form** - Form management
- **Recharts** - Data visualization

## 📱 Demo & Screenshot

### 🏠 **Dashboard**
```
┌─────────────────────────────────────┐
│  🏢 StokManager                    │
├─────────────────────────────────────┤
│  📊 Device Status: 1 Online        │
│  📱 Last Scan: ESP32_001           │
│  ⏰ Session: 23:45 remaining       │
├─────────────────────────────────────┤
│  🔍 [Scan Barcode]                 │
│  👥 [Absensi]                      │
│  ⚙️  [Pengaturan]                   │
└─────────────────────────────────────┘
```

### 📱 **Mobile View**
- Responsive design untuk semua device
- Touch-optimized interface
- Swipe gestures support

## 🚀 Quick Start

### Prasyarat
- Node.js 18+ 
- npm atau yarn
- Firebase account
- ESP32 device (optional)

### Install & Run
```bash
# Clone repository
git clone https://github.com/your-username/webinvesp32.git
cd webinvesp32

# Install dependencies
npm install

# Setup environment variables
cp .env.example .env.local
# Edit .env.local dengan konfigurasi Firebase Anda

# Run development server
npm run dev
```

🌐 **Open [http://localhost:3000](http://localhost:3000)**

## ⚙️ Instalasi

### 1. **Clone Repository**
```bash
git clone https://github.com/your-username/webinvesp32.git
cd webinvesp32
```

### 2. **Install Dependencies**
```bash
npm install
# atau
yarn install
```

### 3. **Setup Environment Variables**
Buat file `.env.local` di root project:
```env
# Firebase Configuration
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_auth_domain
NEXT_PUBLIC_FIREBASE_DATABASE_URL=https://barcodescanesp32-default-rtdb.asia-southeast1.firebasedatabase.app
NEXT_PUBLIC_FIREBASE_PROJECT_ID=barcodescanesp32
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_storage_bucket
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id

# Optional: Development settings
CRON_SECRET=your-secret-key
NEXT_PUBLIC_USE_FIREBASE_EMULATOR=false
```

### 4. **Run Development Server**
```bash
npm run dev
```

## 🔥 Konfigurasi Firebase

### 🔐 **PENTING: Setup Environment Variables**

1. **Copy template environment variables**:
   ```bash
   cp .env.example .env.local
   ```

2. **Edit .env.local dengan Firebase credentials Anda**:
   ```bash
   # Buka .env.local dan isi dengan nilai dari Firebase Console
   NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key_here
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
   # ... dst
   ```

3. **Dapatkan Firebase Config**:
   - Buka [Firebase Console](https://console.firebase.google.com/)
   - Pilih project Anda → Project Settings → General
   - Scroll ke "Your apps" → Web app → Config
   - Copy semua values ke .env.local

**⚠️ JANGAN COMMIT file .env.local ke Git!**

### 1. **Buat Firebase Project**
1. Buka [Firebase Console](https://console.firebase.google.com/)
2. Klik "Create a project"
3. Aktifkan **Realtime Database**

### 2. **Setup Database Rules**
Buka Firebase Console → Database → Rules:
```json
{
  "rules": {
    "inventory": {
      ".read": true,
      ".write": true,
      "$itemId": {
        ".validate": "newData.hasChildren(['name', 'barcode', 'category'])"
      }
    },
    "scans": {
      ".read": true,
      ".write": true,
      "$scanId": {
        ".validate": "newData.hasChildren(['barcode', 'timestamp', 'deviceId'])"
      }
    },
    "devices": {
      ".read": true,
      ".write": true,
      "$deviceId": {
        ".validate": "newData.hasChildren(['deviceId', 'lastSeen', 'status'])"
      }
    },
    "attendance": {
      ".read": true,
      ".write": true,
      "$attendanceId": {
        ".validate": "newData.hasChildren(['nim', 'timestamp', 'deviceId'])"
      }
    },
    "settings": {
      ".read": true,
      ".write": true
    },
    "analytics": {
      ".read": true,
      ".write": true
    }
  }
}
```

### 3. **Update Configuration**
Edit `lib/firebase.ts` dengan konfigurasi Firebase Anda:
```typescript
// Firebase Configuration
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
}

// Initialize Firebase
const app = initializeApp(firebaseConfig)
export const database = getDatabase(app)
```

### 4. **Test Firebase Connection**
Gunakan built-in Firebase setup di aplikasi:
1. Jalankan aplikasi (`npm run dev`)
2. Buka halaman `/pengaturan`
3. Klik "Test Firebase Connection"
4. Inisialisasi database dengan sample data

## 🛠️ Development

### **Available Scripts**
```bash
# Development
npm run dev          # Start development server
npm run build        # Build for production
npm run start        # Start production server
npm run lint         # Run ESLint

# Type Checking
npx tsc --noEmit     # Check TypeScript errors
```

### **Project Structure**
```
webinvesp32/
├── app/                         # Next.js App Router
│   ├── page.tsx                # Dashboard utama (inventory management)
│   ├── layout.tsx              # Root layout dengan providers
│   ├── loading.tsx             # Global loading component
│   ├── absensi/               # Sistem absensi
│   │   └── page.tsx           # QR code attendance scanning
│   ├── scan/                  # Riwayat scanning
│   │   └── page.tsx           # History dan analytics
│   ├── transaksi/             # Manajemen transaksi
│   │   ├── page.tsx           # Transaction management
│   │   └── loading.tsx        # Loading state
│   ├── pengaturan/            # Settings dan konfigurasi
│   │   └── page.tsx           # Firebase setup, device config
│   ├── login/                 # Authentication
│   │   └── page.tsx           # Login interface
│   └── api/                   # API endpoints
│       ├── barcode-scan/      # ESP32 scan endpoint
│       ├── attendance/        # Attendance processing
│       ├── devices-status/    # Device monitoring
│       ├── firebase-*/        # Firebase utilities
│       └── heartbeat/         # Device heartbeat
├── components/                # React components
│   ├── ui/                   # shadcn/ui base components
│   │   ├── button.tsx        # Button component
│   │   ├── card.tsx          # Card layouts
│   │   ├── toast.tsx         # Notification system
│   │   └── ...               # Other UI primitives
│   ├── scanner-integration.tsx # ESP32 hardware integration
│   ├── firebase-setup.tsx    # Firebase configuration UI
│   ├── realtime-*-provider.tsx # Real-time data providers
│   ├── product-info-popup.tsx # Product information modal
│   ├── scan-history.tsx      # Scan history table
│   ├── device-status.tsx     # Device monitoring UI
│   └── navigation.tsx        # App navigation
├── hooks/                    # Custom React hooks
│   ├── use-firebase.ts       # Firebase data operations
│   ├── use-realtime-*.ts     # Real-time data hooks
│   ├── use-session.ts        # Session management
│   ├── use-toast.ts          # Toast notifications
│   └── use-mobile.tsx        # Mobile detection
├── lib/                      # Utility libraries
│   ├── firebase.ts           # Firebase configuration
│   ├── utils.ts              # General utilities
│   └── device-status-monitor.ts # Device monitoring logic
├── types/                    # TypeScript type definitions
│   ├── global.d.ts           # Global type declarations
│   └── file-saver.d.ts       # File export types
├── public/                   # Static assets
│   ├── placeholder-*.png     # UI placeholders
│   └── beep.mp3             # Scanner notification sound
└── styles/                   # Global styles
    └── globals.css           # Tailwind CSS + custom styles
```

### **Component Architecture**
```
┌─────────────────────────┐
│       Layout            │
├─────────────────────────┤
│   ┌─────────────────┐   │
│   │   Navigation    │   │
│   └─────────────────┘   │
│   ┌─────────────────┐   │
│   │   Page Content  │   │
│   └─────────────────┘   │
│   ┌─────────────────┐   │
│   │   Toaster       │   │
│   └─────────────────┘   │
└─────────────────────────┘
```

## 📦 Deployment

### **Netlify (Recommended)**
1. Fork repository ke GitHub
2. Connect ke Netlify
3. Set environment variables
4. Deploy!

```bash
# Build command
npm run build

# Publish directory
.next

# Environment variables
FIREBASE_DATABASE_URL=your-database-url
CRON_SECRET=your-secret-key
```

### **Vercel**
```bash
npm install -g vercel
vercel

# atau deploy langsung dari GitHub
```

### **Manual Deployment**
```bash
# Build untuk production
npm run build

# Upload folder .next ke hosting
```

## 🏗️ Arsitektur

### **System Architecture**
```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   ESP32     │───▶│  Firebase   │◀───│  Web App    │
│  Devices    │    │  Realtime   │    │  (Next.js)  │
└─────────────┘    │  Database   │    └─────────────┘
                   └─────────────┘            │
                          │                   │
                   ┌─────────────┐    ┌─────────────┐
                   │   Device    │    │   Browser   │
                   │ Monitoring  │    │   Client    │
                   └─────────────┘    └─────────────┘
```

### **Data Flow**
1. **ESP32** scan barcode/NIM → Firebase
2. **Firebase** real-time sync → Web App
3. **Web App** process data → Display
4. **Device Monitor** check status → Update UI

## 📡 API Endpoints

### **Device Management**
```http
POST /api/check-device-status    # Check device health
GET  /api/devices-status         # Get all device status
POST /api/heartbeat             # Device heartbeat
```

### **Scanning & Data**
```http
POST /api/barcode-scan          # Process barcode scan
POST /api/attendance            # Process attendance
GET  /api/attendance-export     # Export attendance data
```

### **Firebase Integration**
```http
GET  /api/firebase-test         # Test Firebase connection
POST /api/firebase-init         # Initialize Firebase
GET  /api/firebase-rules        # Get database rules
```

### **Utilities**
```http
GET  /api/current-page          # Get current page info
GET  /api/test                  # Health check
```

## 🔌 ESP32 Integration

### **Hardware Requirements**
- **ESP32 DevKit V1** atau compatible board
- **Barcode Scanner Module** dengan output UART/Serial
- **Power Supply 5V 2A** untuk ESP32 dan scanner
- **Breadboard dan jumper wires** untuk koneksi
- **WiFi Router** dengan akses internet

### **Wiring Diagram**
```
ESP32 Pin          Barcode Scanner
---------          ---------------
GPIO16 (RX2)   ←   TX (Data Output)
GPIO17 (TX2)   →   RX (Data Input)  
GND            ←   GND
5V             ←   VCC (Power)
```

### **ESP32 Arduino Code Example**
```cpp
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// WiFi Configuration
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

// Server Configuration  
const char* serverUrl = "https://your-stokmanager-app.netlify.app";
const char* apiEndpoint = "/api/barcode-scan";

// Device Configuration
const char* deviceId = "ESP32_001";
String location = "Warehouse_A";

// Hardware Configuration
#define SCANNER_RX_PIN 16
#define SCANNER_TX_PIN 17
#define LED_PIN 2

HardwareSerial scannerSerial(2);

void setup() {
  Serial.begin(115200);
  scannerSerial.begin(9600, SERIAL_8N1, SCANNER_RX_PIN, SCANNER_TX_PIN);
  
  pinMode(LED_PIN, OUTPUT);
  
  // Connect to WiFi
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(1000);
    Serial.println("Connecting to WiFi...");
  }
  
  Serial.println("WiFi Connected!");
  Serial.print("IP Address: ");
  Serial.println(WiFi.localIP());
  
  // Send initial heartbeat
  sendHeartbeat();
}

void loop() {
  // Check for barcode scan
  if (scannerSerial.available()) {
    String barcode = scannerSerial.readStringUntil('\n');
    barcode.trim();
    
    if (barcode.length() > 0) {
      Serial.println("Barcode scanned: " + barcode);
      sendBarcodeToServer(barcode);
      
      // Blink LED to indicate scan
      digitalWrite(LED_PIN, HIGH);
      delay(200);
      digitalWrite(LED_PIN, LOW);
    }
  }
  
  // Send heartbeat every 8 seconds
  static unsigned long lastHeartbeat = 0;
  if (millis() - lastHeartbeat > 8000) {
    sendHeartbeat();
    lastHeartbeat = millis();
  }
  
  delay(100);
}

void sendBarcodeToServer(String barcode) {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(String(serverUrl) + apiEndpoint);
    http.addHeader("Content-Type", "application/json");
    
    // Create JSON payload
    StaticJsonDocument<200> doc;
    doc["barcode"] = barcode;
    doc["deviceId"] = deviceId;
    doc["timestamp"] = millis();
    doc["location"] = location;
    doc["mode"] = "inventory";  // atau "attendance"
    doc["type"] = "inventory_scan";
    
    String jsonString;
    serializeJson(doc, jsonString);
    
    int httpResponseCode = http.POST(jsonString);
    
    if httpResponseCode > 0) {
      String response = http.getString();
      Serial.println("Server response: " + response);
    } else {
      Serial.println("Error sending data: " + String(httpResponseCode));
    }
    
    http.end();
  }
}

void sendHeartbeat() {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(String(serverUrl) + "/api/heartbeat");
    http.addHeader("Content-Type", "application/json");
    
    StaticJsonDocument<150> doc;
    doc["deviceId"] = deviceId;
    doc["timestamp"] = millis();
    doc["status"] = "online";
    doc["ipAddress"] = WiFi.localIP().toString();
    doc["freeHeap"] = ESP.getFreeHeap();
    
    String jsonString;
    serializeJson(doc, jsonString);
    
    int httpResponseCode = http.POST(jsonString);
    
    if (httpResponseCode > 0) {
      Serial.println("Heartbeat sent successfully");
    }
    
    http.end();
  }
}
```

### **Device Communication Protocol**
```json
// Barcode Scan Payload
{
  "barcode": "1234567890123",
  "deviceId": "ESP32_001", 
  "timestamp": 1672531200000,
  "location": "Warehouse_A",
  "mode": "inventory",        // "inventory" | "attendance"
  "type": "inventory_scan"    // "inventory_scan" | "attendance_scan"
}

// Heartbeat Payload
{
  "deviceId": "ESP32_001",
  "timestamp": 1672531200000,
  "status": "online",
  "ipAddress": "192.168.1.100",
  "freeHeap": 280000,
  "scanCount": 45
}

// Server Response
{
  "success": true,
  "message": "Barcode scan saved successfully",
  "scanId": "scan_abc123",
  "itemFound": true,
  "itemId": "item_xyz789"
}
```

## 🎯 Usage Guide

### **1. 📊 Dashboard Inventaris (Halaman Utama)**
- **Menambah Item Baru**:
  1. Klik tombol "Tambah Item" 
  2. Isi form dengan nama, barcode, kategori, dll
  3. Klik "Simpan" - item akan tersync ke Firebase
- **Mengedit Item**:
  1. Klik icon edit pada item yang diinginkan
  2. Update informasi yang diperlukan
  3. Simpan perubahan
- **Menghapus Item**: Klik icon hapus dan konfirmasi
- **Export Data**: Klik "Export Excel" untuk download data

### **2. 📱 Scanning Barcode**
#### **ESP32 Hardware Scanner**:
1. Pastikan ESP32 terhubung ke WiFi dan server
2. Scan barcode dengan scanner fisik yang terhubung
3. Data otomatis dikirim ke Firebase real-time
4. Monitor hasil scanning di dashboard web
5. Lihat riwayat dan analytics di halaman `/scan`

#### **Manual Input** (Alternative):
1. Akses form input barcode di aplikasi
2. Ketik barcode secara manual jika diperlukan
3. Submit data untuk disimpan ke database

### **3. 👥 Sistem Absensi**
1. Buka halaman `/absensi`
2. Pastikan ESP32 dalam mode "attendance"
3. Scan QR code NIM mahasiswa/karyawan
4. Status kehadiran update real-time
5. Export laporan absensi jika diperlukan

### **4. 📈 Riwayat & Analytics**
- **Melihat Riwayat**: Akses `/scan` untuk history transaksi
- **Filter Data**: Gunakan filter berdasarkan tanggal, device, dll
- **Export Laporan**: Download data dalam format Excel/CSV
- **Real-time Monitoring**: Pantau aktivitas scanning live

### **5. ⚙️ Pengaturan Sistem**
1. **Firebase Setup**:
   - Akses `/pengaturan`
   - Test koneksi Firebase
   - Inisialisasi database dengan sample data
2. **Device Management**:
   - Monitor status ESP32 devices
   - Lihat heartbeat dan connection status
   - Konfigurasi device settings
3. **Preferences**:
   - Set notification preferences
   - Configure scanner timeout
   - Enable/disable features

## 🛡️ Security

### **Security Features**
- ✅ **Firebase Security Rules**
- ✅ **Environment Variables** untuk config
- ✅ **CRON_SECRET** untuk API protection
- ✅ **Type Safety** dengan TypeScript
- ✅ **Input Validation** dengan Zod

### **Best Practices**
```typescript
// API Route Security
const authHeader = request.headers.get("authorization")
if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
}
```

## 🔧 Troubleshooting

### **❗ Common Issues & Solutions**

#### **🌐 Browser Network & WebSocket Errors**
```bash
❌ ERR_NAME_NOT_RESOLVED for Firebase WebSocket connections
❌ WebSocket connection failed
❌ DNS resolution errors
```
**Solutions:**
1. **Network Connectivity Issues**:
   - These errors are often temporary and resolve automatically
   - The app implements automatic retry logic with exponential backoff
   - Firebase will fall back to HTTP long-polling if WebSocket fails
   
2. **DNS Resolution Problems**:
   ```javascript
   // The app includes network checking before Firebase initialization
   // Check browser network status
   console.log('Navigator online:', navigator.onLine);
   ```
   
3. **Firewall/Corporate Network**:
   - Some corporate networks block WebSocket connections
   - Firebase automatically falls back to HTTPS polling
   - No action required - functionality will work via fallback
   
4. **Development Environment**:
   - Restart development server if persistent
   - Clear browser cache and cookies
   - Check if running multiple dev servers on different ports

**Note**: These WebSocket errors are usually cosmetic and don't affect functionality. Firebase automatically handles connection fallbacks.

#### **⚠️ Browser Deprecation Warnings**
```bash
❌ Unload event listeners are deprecated
❌ beforeunload will be removed
```
**Solutions:**
- ✅ **Fixed**: Updated to use modern `pagehide` and `visibilitychange` events
- ✅ **Modern Lifecycle**: Implemented proper page lifecycle management
- ✅ **Firebase Cleanup**: Added robust listener cleanup on page unload

#### **🔥 Firebase Connection Issues**
```bash
❌ Error: Firebase not available
❌ Permission denied
❌ Database rules error
```
**Solutions:**
1. **Check Environment Variables**:
   ```bash
   # Verify all Firebase config variables are set
   echo $NEXT_PUBLIC_FIREBASE_DATABASE_URL
   echo $NEXT_PUBLIC_FIREBASE_PROJECT_ID
   ```
2. **Verify Firebase Rules**:
   - Open Firebase Console → Database → Rules
   - Ensure rules allow read/write access
   - Test with simplified rules for debugging
3. **Check Project ID**:
   - Ensure project ID matches in env variables
   - Verify database URL region (asia-southeast1)

#### **📡 ESP32 Connection Problems**
```bash
❌ Connection timeout - scanner not responding
❌ Device offline
❌ WiFi connection failed
```
**Solutions:**
1. **Network Issues**:
   ```cpp
   // Debug WiFi connection
   Serial.print("WiFi Status: ");
   Serial.println(WiFi.status());
   Serial.print("IP Address: ");
   Serial.println(WiFi.localIP());
   ```
2. **Firewall/Port Issues**:
   - Check if ports 80/443 are open
   - Verify ESP32 can reach internet
   - Test with simple HTTP request
3. **Power/Hardware**:
   - Ensure stable 5V power supply
   - Check wiring connections
   - Verify UART communication

#### ** Build & Development Errors**
```bash
❌ Type errors
❌ Module not found
❌ Build failed
```
**Solutions:**
1. **Clean Install**:
   ```bash
   # Remove cache and reinstall
   rm -rf node_modules package-lock.json .next
   npm install
   npm run build
   ```
2. **Type Checking**:
   ```bash
   # Check TypeScript errors
   npx tsc --noEmit
   
   # Fix common issues
   npm run lint --fix
   ```
3. **Dependency Issues**:
   ```bash
   # Update dependencies
   npm update
   
   # Check for vulnerabilities
   npm audit --fix
   ```

### **🚀 Performance Issues**

#### **🐌 Slow Loading**
**Solutions:**
- Enable Next.js optimization
- Implement code splitting
- Optimize images and assets
- Use Firebase indexes for queries

#### **📡 Real-time Lag**
**Solutions:**
- Check Firebase database rules
- Optimize listener subscriptions
- Implement proper cleanup
- Use debouncing for frequent updates

#### **💾 Memory Issues**
**Solutions:**
- Check for memory leaks in useEffect
- Proper cleanup of Firebase listeners
- Optimize state management
- Use React.memo for expensive components

### **🔍 Debug Mode**

#### **Enable Verbose Logging**
```bash
# Development debugging
DEBUG=* npm run dev

# Check Firebase connection
DEBUG=firebase:* npm run dev

# Monitor network requests  
# Open browser DevTools → Network → Fetch/XHR
```

#### **ESP32 Serial Monitor**
```cpp
// Add debug prints in ESP32 code
Serial.println("WiFi connecting...");
Serial.println("Barcode received: " + barcode);
Serial.println("HTTP Response: " + httpResponseCode);
```

#### **Browser Console Debugging**
```javascript
// Check Firebase status in browser console
console.log("Firebase config:", firebase.apps);
console.log("Database ref:", database);

// Monitor real-time updates
database.ref('scans').on('value', (snapshot) => {
  console.log('New scan data:', snapshot.val());
});
```

### **📞 Getting Additional Help**

1. **Check Documentation**:
   - Review Firebase documentation
   - Check Next.js troubleshooting guide
   - ESP32 Arduino reference

2. **Community Support**:
   - Open GitHub issue with error details
   - Join Discord/Telegram community
   - Stack Overflow with relevant tags

3. **Diagnostic Information**:
   ```bash
   # Include in issue reports
   node --version
   npm --version
   
   # Browser information
   # OS and version
   # Firebase project details (without sensitive info)
   ```

## 📈 Performance

### **Optimization Features**
- ✅ **Code Splitting** dengan Next.js
- ✅ **Image Optimization** built-in
- ✅ **Static Generation** untuk pages
- ✅ **Bundle Analysis** tersedia
- ✅ **Caching Strategy** implemented

### **Bundle Size Analysis**
```
Page                     Size       First Load JS
├ ○ /                   13.2 kB         244 kB    # Dashboard inventaris
├ ○ /absensi           5.98 kB         196 kB    # Sistem absensi  
├ ○ /login             4.17 kB         113 kB    # Authentication
├ ○ /pengaturan        11.4 kB         202 kB    # Settings & config
├ ○ /scan              5.34 kB         221 kB    # Scan history
└ ○ /transaksi         8.25 kB         227 kB    # Transaction mgmt

○ (Static)  automatically rendered as static HTML
```

### **Performance Optimizations**
- ✅ **Code Splitting** dengan Next.js dynamic imports
- ✅ **Tree Shaking** untuk bundle size optimal
- ✅ **Image Optimization** built-in Next.js
- ✅ **Static Generation** untuk pages yang memungkinkan
- ✅ **Memoization** dengan React.memo dan useMemo
- ✅ **Debounced Firebase Listeners** untuk mengurangi updates
- ✅ **Local Storage Caching** untuk offline support

## 🤝 Contributing

1. Fork the project
2. Create feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Open Pull Request

### **Development Guidelines**
- Follow TypeScript best practices
- Use semantic commit messages
- Add tests for new features
- Update documentation

## 📞 Support

### **Getting Help**
- 📖 Check [Documentation](./docs)
- 🐛 Report [Issues](./issues)
- 💬 Join [Discussions](./discussions)
- 📧 Email: support@webinvesp32.com

### **Links & Resources**
- 🌐 **Live Demo**: [https://stokmanager.netlify.app](https://stokmanager.netlify.app)
- 📚 **Documentation**: [GitHub Wiki](https://github.com/yourusername/webinvesp32/wiki)
- 🔥 **Firebase Console**: [https://console.firebase.google.com](https://console.firebase.google.com)
- 💬 **Community**: [GitHub Discussions](https://github.com/yourusername/webinvesp32/discussions)
- � **Issues**: [GitHub Issues](https://github.com/yourusername/webinvesp32/issues)

### **Related Projects**
- [ESP32 Arduino Libraries](https://github.com/espressif/arduino-esp32)
- [Firebase ESP Client](https://github.com/mobizt/Firebase-ESP-Client)
- [Next.js Documentation](https://nextjs.org/docs)
- [shadcn/ui Components](https://ui.shadcn.com/)

## � Production Deployment

### 🚀 Deploy to Vercel (Recommended)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2F100percentsrgb%2Fwebinvesp32&branch=555)

**Environment Variables Required:**
```bash
NEXT_PUBLIC_FIREBASE_API_KEY=YOUR_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=barcodescanesp32.firebaseapp.com
NEXT_PUBLIC_FIREBASE_DATABASE_URL=https://barcodescanesp32-default-rtdb.asia-southeast1.firebasedatabase.app
NEXT_PUBLIC_FIREBASE_PROJECT_ID=barcodescanesp32
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=barcodescanesp32.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=330721800882
NEXT_PUBLIC_FIREBASE_APP_ID=1:330721800882:web:f270138ef40229ec2ccfab
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=G-7J89KNJCCT
```

### 📋 Deployment Checklist

- [x] **Build**: Passing (`npm run build`)
- [x] **Environment Variables**: Configured in `next.config.mjs`
- [x] **Vercel Config**: `vercel.json` with optimized settings
- [x] **Firebase**: Production configuration ready
- [x] **Performance**: Bundle optimized (280kB total)
- [x] **Security**: CORS headers and CSP configured
- [x] **Debug Cleanup**: All debug components removed

### 🔧 Manual Build & Test

```bash
# Build for production
npm run build

# Test production build locally  
npm start

# Check bundle size
npm run build -- --analyze
```

### 📈 Performance Metrics

- **First Load JS**: 280kB (optimized)
- **Static Pages**: 19 routes generated
- **Build Time**: ~2-3 minutes
- **Bundle Chunks**: Vendor splitting enabled

> 📖 **For detailed deployment instructions, see [DEPLOYMENT.md](DEPLOYMENT.md)**

## �📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Next.js](https://nextjs.org/) - The React framework
- [Firebase](https://firebase.google.com/) - Backend as a Service
- [shadcn/ui](https://ui.shadcn.com/) - UI components
- [Tailwind CSS](https://tailwindcss.com/) - CSS framework
- [Radix UI](https://www.radix-ui.com/) - Primitive components

---

<div align="center">

### 🚀 **Ready to revolutionize your inventory management?**

**[⭐ Star this repo](../../stargazers) | [🍴 Fork it](../../fork) | [📖 Read the docs](../../wiki)**

**Made with ❤️ by the StokManager Team**

*Bridging IoT and Web Technologies for Smart Inventory Management*

</div>
