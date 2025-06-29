#include <WiFi.h>
#include <WebServer.h>
#include <EEPROM.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <time.h>

#define RXD2 16
#define TXD2 17
#define EEPROM_SIZE 1024
#define WIFI_CONFIG_ADDR 0
#define DEVICE_CONFIG_ADDR 512

// WiFi Configuration structure
struct WiFiConfig {
  char ssid[64];
  char password[64];
  bool isValid;
  uint32_t checksum;
};

// Device Configuration structure
struct DeviceConfig {
  char deviceId[32];
  char serverUrl[128];
  char firebaseUrl[128];
  char apiKey[64];
  bool isConfigured;
  uint32_t checksum;
  int currentMode; // 0=inventory, 1=attendance - untuk disimpan di EEPROM
  uint8_t version; // Add version field to track struct changes
  uint8_t padding[3]; // Add explicit padding to control memory layout
};

WebServer* server = nullptr;

WiFiConfig wifiConfig;
DeviceConfig deviceConfig;
String lastBarcode = "";
bool isWiFiConnected = false;
bool isServerStarted = false;
unsigned long lastScanTime = 0;
unsigned long lastHeartbeat = 0;
unsigned long scanCount = 0;
unsigned long bootTime = 0; // Tambahkan boot time
unsigned long lastWiFiCheck = 0; // Tambahkan WiFi monitoring
bool isOnline = false; // Status online/offline

// Mode switching variables
enum ScannerMode {
  MODE_INVENTORY,
  MODE_ATTENDANCE
};

ScannerMode currentMode = MODE_INVENTORY; // Default mode
String currentPageUrl = "";

struct ScanData {
  String barcode;
  String timestamp;
  String deviceId;
  bool processed;
  bool sentToFirebase;
};

// Improved checksum calculation with better algorithm
uint32_t calculateChecksum(const void* data, size_t length) {
  uint32_t checksum = 0xFFFFFFFF;
  const uint8_t* bytes = (const uint8_t*)data;
  
  for (size_t i = 0; i < length; i++) {
    checksum ^= bytes[i];
    for (int j = 0; j < 8; j++) {
      checksum = (checksum >> 1) ^ (0xEDB88320 & (-(checksum & 1)));
    }
  }
  
  return ~checksum;
}

std::vector<ScanData> scanHistory;

// Function declarations
void handleRoot();
void handleApiStatus();
void handleApiScan();
void handleApiHistory();
void handleApiConfig();
void handleReset();
void handleOptions();
void handleApiMode(); // New: Handle mode switching
void handleApiAttendance(); // New: Handle attendance API
void startWebServer();
void processBarcodeInput(String input);
void processInventoryBarcode(String barcode); // New: Process inventory barcode
void processAttendanceBarcode(String barcode); // New: Process attendance barcode
bool connectToWiFi();
bool sendBarcodeToFirebase(String barcode);
bool sendAttendanceToFirebase(String nim); // New: Send attendance data
bool sendHeartbeatToFirebase();
void broadcastBarcodeScan(String barcode);
void broadcastAttendanceResult(String nim, bool success); // New: Broadcast attendance
bool parseWiFiQR(String qrData, String &ssid, String &password, String &security);
uint32_t calculateChecksum(const void* data, size_t length);
void saveWiFiConfig();
void loadWiFiConfig();
void saveDeviceConfig();
void loadDeviceConfig();
void checkWiFiConnection(); // Tambahkan fungsi monitoring WiFi
void setDeviceOffline(); // Tambahkan fungsi offline
String getModeString(ScannerMode mode); // New: Get mode as string
bool isValidNIM(String input); // New: Validate NIM format


void saveWiFiConfig() {
  // Update to zero out the checksum field first
  wifiConfig.checksum = 0;
  wifiConfig.checksum = calculateChecksum(&wifiConfig, sizeof(wifiConfig));
  EEPROM.put(WIFI_CONFIG_ADDR, wifiConfig);
  EEPROM.commit();
  Serial.println("✅ WiFi configuration saved to EEPROM");
}

void loadWiFiConfig() {
  EEPROM.get(WIFI_CONFIG_ADDR, wifiConfig);
  
  // Store the original checksum
  uint32_t storedChecksum = wifiConfig.checksum;
  
  // Zero out the checksum field for calculation
  wifiConfig.checksum = 0;
  uint32_t calculatedChecksum = calculateChecksum(&wifiConfig, sizeof(wifiConfig));
  
  // Restore the original checksum
  wifiConfig.checksum = storedChecksum;
  
  Serial.println("🔍 Validating WiFi config from EEPROM:");
  Serial.println("   - Stored checksum: 0x" + String(storedChecksum, HEX));
  Serial.println("   - Calculated checksum: 0x" + String(calculatedChecksum, HEX));
  
  if (wifiConfig.checksum == calculatedChecksum && wifiConfig.isValid && strlen(wifiConfig.ssid) > 0) {
    Serial.println("✅ Valid WiFi configuration loaded from EEPROM");
    Serial.printf("SSID: %s\n", wifiConfig.ssid);
  } else {
    Serial.println("❌ No valid WiFi configuration found in EEPROM");
    memset(&wifiConfig, 0, sizeof(wifiConfig));
    wifiConfig.isValid = false;
  }
}

void saveDeviceConfig() {
  // Set version
  deviceConfig.version = 1;
  
  // Zero out padding bytes to ensure consistent checksum
  memset(deviceConfig.padding, 0, sizeof(deviceConfig.padding));
  
  // Simpan mode saat ini ke EEPROM
  deviceConfig.currentMode = (currentMode == MODE_ATTENDANCE) ? 1 : 0;
  
  // Calculate checksum last, after all fields are set
  deviceConfig.isConfigured = true; // Ensure this flag is set to true
  deviceConfig.checksum = 0; // First zero out the checksum field
  deviceConfig.checksum = calculateChecksum(&deviceConfig, sizeof(deviceConfig));
  
  Serial.println("📝 Saving configuration to EEPROM:");
  Serial.println("   - Device ID: " + String(deviceConfig.deviceId));
  Serial.println("   - Current Mode: " + String(deviceConfig.currentMode) + " (" + getModeString((ScannerMode)deviceConfig.currentMode) + ")");
  Serial.println("   - Struct size: " + String(sizeof(deviceConfig)) + " bytes");
  Serial.println("   - Version: " + String(deviceConfig.version));
  Serial.println("   - Calculated checksum: 0x" + String(deviceConfig.checksum, HEX));
  
  // Debug - Print raw bytes of DeviceConfig for verification
  Serial.println("Raw data (first 16 bytes):");
  const uint8_t* bytes = (const uint8_t*)&deviceConfig;
  for (int i = 0; i < 16; i++) {
    Serial.print(bytes[i], HEX);
    Serial.print(" ");
    if ((i + 1) % 8 == 0) Serial.println();
  }
  Serial.println();
  
  EEPROM.put(DEVICE_CONFIG_ADDR, deviceConfig);
  bool committed = EEPROM.commit();
  Serial.println(committed ? "✅ EEPROM commit successful" : "❌ EEPROM commit failed");
}

void loadDeviceConfig() {
  // First make a clean copy of the structure to avoid garbage data
  memset(&deviceConfig, 0, sizeof(deviceConfig));
  
  EEPROM.get(DEVICE_CONFIG_ADDR, deviceConfig);
  
  // Store the checksum value for comparison
  uint32_t storedChecksum = deviceConfig.checksum;
  
  // Calculate checksum with the checksum field zeroed out
  deviceConfig.checksum = 0;
  uint32_t calculatedChecksum = calculateChecksum(&deviceConfig, sizeof(deviceConfig));
  
  // Restore the original checksum
  deviceConfig.checksum = storedChecksum;
  
  Serial.println("🔍 Validating device config from EEPROM:");
  Serial.println("   - Stored checksum: 0x" + String(storedChecksum, HEX));
  Serial.println("   - Calculated checksum: 0x" + String(calculatedChecksum, HEX));
  Serial.println("   - isConfigured flag: " + String(deviceConfig.isConfigured));
  Serial.println("   - Stored Mode: " + String(deviceConfig.currentMode));
  Serial.println("   - Version: " + String(deviceConfig.version));
  
  // Debug - Print raw bytes from EEPROM for verification
  Serial.println("Raw data from EEPROM (first 16 bytes):");
  const uint8_t* bytes = (const uint8_t*)&deviceConfig;
  for (int i = 0; i < 16; i++) {
    Serial.print(bytes[i], HEX);
    Serial.print(" ");
    if ((i + 1) % 8 == 0) Serial.println();
  }
  Serial.println();
  
  if (storedChecksum == calculatedChecksum && deviceConfig.isConfigured) {
    Serial.println("✅ Valid device configuration loaded from EEPROM");
    Serial.printf("Device ID: %s\n", deviceConfig.deviceId);
    
    // Muat mode dari EEPROM
    if (deviceConfig.currentMode == 1) {
      currentMode = MODE_ATTENDANCE;
    } else {
      currentMode = MODE_INVENTORY;
    }
    Serial.println("📱 Current Mode loaded from EEPROM: " + getModeString(currentMode));
  } else {
    Serial.println("❌ No valid device configuration found, creating new defaults");
    Serial.println("   Checksum mismatch: 0x" + String(storedChecksum, HEX) + 
                  " != 0x" + String(calculatedChecksum, HEX));
    
    memset(&deviceConfig, 0, sizeof(deviceConfig));
    
    String defaultDeviceId = "ESP32-" + String((uint32_t)ESP.getEfuseMac(), HEX);
    strncpy(deviceConfig.deviceId, defaultDeviceId.c_str(), sizeof(deviceConfig.deviceId) - 1);
    strncpy(deviceConfig.serverUrl, "https://v0-website-export-request.vercel.app/", sizeof(deviceConfig.serverUrl) - 1);
    strncpy(deviceConfig.firebaseUrl, "https://barcodescanesp32-default-rtdb.asia-southeast1.firebasedatabase.app", sizeof(deviceConfig.firebaseUrl) - 1);
    strncpy(deviceConfig.apiKey, "", sizeof(deviceConfig.apiKey) - 1);
    
    // Keep the current mode instead of resetting it
    deviceConfig.currentMode = (currentMode == MODE_ATTENDANCE) ? 1 : 0;
    
    // Set version
    deviceConfig.version = 1;
    
    // Zero out padding bytes
    memset(deviceConfig.padding, 0, sizeof(deviceConfig.padding));
    
    deviceConfig.isConfigured = true;
    
    saveDeviceConfig();
    Serial.println("✅ Default configuration created and saved");
  }
}

// Parse WiFi QR Code format: WIFI:S:SSID;T:TYPE;P:PASSWORD;H:HIDDEN;;
bool parseWiFiQR(String qrData, String &ssid, String &password, String &security) {
  Serial.println("📱 Parsing WiFi QR code...");
  
  if (!qrData.startsWith("WIFI:")) {
    Serial.println("❌ Not a WiFi QR code");
    return false;
  }
  
  qrData = qrData.substring(5);
  
  int sIndex = qrData.indexOf("S:");
  int tIndex = qrData.indexOf("T:");
  int pIndex = qrData.indexOf("P:");
  
  if (sIndex == -1) {
    Serial.println("❌ SSID not found in WiFi QR");
    return false;
  }
  
  int sEnd = qrData.indexOf(";", sIndex);
  if (sEnd == -1) sEnd = qrData.length();
  ssid = qrData.substring(sIndex + 2, sEnd);
  
  if (tIndex != -1) {
    int tEnd = qrData.indexOf(";", tIndex);
    if (tEnd == -1) tEnd = qrData.length();
    security = qrData.substring(tIndex + 2, tEnd);
  } else {
    security = "WPA";
  }
  
  if (pIndex != -1) {
    int pEnd = qrData.indexOf(";", pIndex);
    if (pEnd == -1) pEnd = qrData.length();
    password = qrData.substring(pIndex + 2, pEnd);
  } else {
    password = "";
  }
  
  Serial.println("✅ WiFi QR parsed successfully!");
  return true;
}

bool connectToWiFi() {
  if (!wifiConfig.isValid || strlen(wifiConfig.ssid) == 0) {
    Serial.println("❌ No WiFi credentials available");
    return false;
  }
  
  Serial.printf("📶 Connecting to WiFi: %s\n", wifiConfig.ssid);
  
  WiFi.disconnect(true);
  delay(1000);
  
  WiFi.mode(WIFI_STA);
  delay(500);
  
  WiFi.begin(wifiConfig.ssid, wifiConfig.password);
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(1000);
    Serial.print(".");
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n✅ WiFi connected!");
    Serial.printf("IP address: %s\n", WiFi.localIP().toString().c_str());
    Serial.printf("RSSI: %d dBm\n", WiFi.RSSI());
    isWiFiConnected = true;
    isOnline = true;
    
    // Configure time
    configTime(0, 0, "pool.ntp.org");
    
    return true;
  } else {
    Serial.println("\n❌ WiFi connection failed");
    isWiFiConnected = false;
    isOnline = false;
    return false;
  }
}

// Fungsi untuk memonitor koneksi WiFi
void checkWiFiConnection() {
  if (millis() - lastWiFiCheck < 10000) return; // Check setiap 10 detik
  lastWiFiCheck = millis();
  
  if (WiFi.status() != WL_CONNECTED) {
    if (isWiFiConnected) {
      Serial.println("❌ WiFi connection lost! Attempting to reconnect...");
      isWiFiConnected = false;
      isOnline = false;
      
      // Set device offline di Firebase sebelum reconnect
      setDeviceOffline();
    }
    
    // Coba reconnect
    if (wifiConfig.isValid) {
      WiFi.reconnect();
      delay(5000);
      
      if (WiFi.status() == WL_CONNECTED) {
        Serial.println("✅ WiFi reconnected!");
        isWiFiConnected = true;
        isOnline = true;
        
        // Restart web server jika perlu
        if (!isServerStarted) {
          startWebServer();
        }
        
        // Send immediate heartbeat setelah reconnect
        lastHeartbeat = 0;
      }
    }
  } else {
    if (!isWiFiConnected) {
      Serial.println("✅ WiFi connection restored!");
      isWiFiConnected = true;
      isOnline = true;
      
      // Send immediate heartbeat
      lastHeartbeat = 0;
    }
  }
}

// Get mode as string
String getModeString(ScannerMode mode) {
  switch (mode) {
    case MODE_INVENTORY:
      return "inventory";
    case MODE_ATTENDANCE:
      return "attendance";
    default:
      return "unknown";
  }
}

// Validate NIM format (basic validation)
bool isValidNIM(String input) {
  // Check if input is numeric and has reasonable length (8-12 digits)
  if (input.length() < 8 || input.length() > 12) {
    return false;
  }
  
  for (int i = 0; i < input.length(); i++) {
    if (!isDigit(input.charAt(i))) {
      return false;
    }
  }
  
  return true;
}



// Send attendance to Firebase
bool sendAttendanceToFirebase(String nim) {
  if (!isWiFiConnected || strlen(deviceConfig.firebaseUrl) == 0) {
    Serial.println("❌ Cannot send attendance to Firebase: No WiFi or Firebase URL");
    return false;
  }
  
  // Only send to attendance endpoint if we're actually in attendance mode
  if (currentMode != MODE_ATTENDANCE) {
    Serial.println("❌ Cannot send attendance to Firebase: Not in attendance mode");
    return false;
  }
  
  HTTPClient http;
  String firebaseEndpoint = String(deviceConfig.firebaseUrl) + "/attendance.json";
  
  http.begin(firebaseEndpoint);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(10000);
  
  // Create JSON payload for attendance
  DynamicJsonDocument doc(1024);
  doc["nim"] = nim;
  doc["nama"] = "";
  doc["deviceId"] = deviceConfig.deviceId;
  doc["sessionId"] = "seminar-2025";
  doc["eventName"] = "Seminar Teknologi 2025";
  doc["location"] = "Auditorium Utama";
  doc["scanned"] = true;
  doc["mode"] = "attendance"; // Explicitly mark this as attendance mode data
  doc["type"] = "attendance_scan"; // Add type field to clarify the data purpose
  
  // Add server timestamp
  JsonObject timestamp = doc.createNestedObject("timestamp");
  timestamp[".sv"] = "timestamp";
  
  String jsonString;
  serializeJson(doc, jsonString);
  
  Serial.println("📤 Sending attendance to Firebase: " + jsonString);
  
  int httpResponseCode = http.POST(jsonString);
  
  if (httpResponseCode > 0) {
    String response = http.getString();
    Serial.println("✅ Attendance Firebase response: " + response);
    
    http.end();
    return true;
  } else {
    Serial.printf("❌ Attendance Firebase HTTP Error: %d\n", httpResponseCode);
    http.end();
    return false;
  }
}

// Fungsi untuk set device offline
void setDeviceOffline() {
  if (strlen(deviceConfig.firebaseUrl) == 0) return;
  
  HTTPClient http;
  String firebaseEndpoint = String(deviceConfig.firebaseUrl) + "/devices/" + String(deviceConfig.deviceId) + "/status.json";
  
  http.begin(firebaseEndpoint);
  http.addHeader("Content-Type", "application/json");
  
  int httpResponseCode = http.PUT("\"offline\"");
  
  if (httpResponseCode > 0) {
    Serial.println("📤 Device status set to offline");
  } else {
    Serial.printf("❌ Failed to set offline status: %d\n", httpResponseCode);
  }
  
  http.end();
}

// Send barcode data to Firebase Realtime Database
bool sendBarcodeToFirebase(String barcode) {
  if (!isWiFiConnected || strlen(deviceConfig.firebaseUrl) == 0) {
    Serial.println("❌ Cannot send to Firebase: No WiFi or Firebase URL");
    return false;
  }
  
  HTTPClient http;
  String firebaseEndpoint = String(deviceConfig.firebaseUrl) + "/scans.json";
  
  http.begin(firebaseEndpoint);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(10000); // 10 second timeout
  
  // Create JSON payload for Firebase
  DynamicJsonDocument doc(1024);
  doc["barcode"] = barcode;
  doc["deviceId"] = deviceConfig.deviceId;
  doc["processed"] = false;
  doc["location"] = "Warehouse-Scanner";
  doc["mode"] = "inventory"; // Explicitly mark this as inventory mode data
  doc["type"] = "inventory_scan"; // Add type field to clarify the data purpose
  
  // Add server timestamp
  JsonObject timestamp = doc.createNestedObject("timestamp");
  timestamp[".sv"] = "timestamp";
  
  String jsonString;
  serializeJson(doc, jsonString);
  
  Serial.println("📤 Sending inventory barcode to Firebase: " + jsonString);
  
  int httpResponseCode = http.POST(jsonString);
  
  if (httpResponseCode > 0) {
    String response = http.getString();
    Serial.println("✅ Firebase response: " + response);
    
    // Parse response to get the generated key
    DynamicJsonDocument responseDoc(512);
    deserializeJson(responseDoc, response);
    String scanId = responseDoc["name"];
    
    Serial.println("📝 Scan ID: " + scanId);
    
    http.end();
    return true;
  } else {
    Serial.printf("❌ Firebase HTTP Error: %d\n", httpResponseCode);
    
    // Jika error, cek koneksi WiFi
    if (httpResponseCode == -1 || httpResponseCode == -11) {
      Serial.println("🔍 Checking WiFi connection due to HTTP error...");
      checkWiFiConnection();
    }
    
    http.end();
    return false;
  }
}

// Send device heartbeat to Firebase - IMPROVED VERSION
bool sendHeartbeatToFirebase() {
  if (!isWiFiConnected || strlen(deviceConfig.firebaseUrl) == 0) {
    Serial.println("❌ Cannot send heartbeat: No WiFi or Firebase URL");
    return false;
  }
  
  HTTPClient http;
  String firebaseEndpoint = String(deviceConfig.firebaseUrl) + "/devices/" + String(deviceConfig.deviceId) + ".json";
  
  http.begin(firebaseEndpoint);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(5000); // 5 second timeout untuk heartbeat
  
  // Create JSON payload for device status
  DynamicJsonDocument doc(1024);
  doc["status"] = "online";
  doc["ipAddress"] = WiFi.localIP().toString();
  doc["uptime"] = (millis() - bootTime) / 1000; // Uptime sejak boot
  doc["freeHeap"] = ESP.getFreeHeap();
  doc["scanCount"] = scanCount;
  doc["rssi"] = WiFi.RSSI();
  doc["version"] = "3.1";
  doc["lastHeartbeat"] = millis(); // Client-side timestamp
  
  // Add server timestamp untuk lastSeen
  JsonObject lastSeen = doc.createNestedObject("lastSeen");
  lastSeen[".sv"] = "timestamp";
  
  String jsonString;
  serializeJson(doc, jsonString);
  
  Serial.println("💓 Sending heartbeat to Firebase...");
  
  int httpResponseCode = http.PUT(jsonString);
  
  if (httpResponseCode > 0) {
    String response = http.getString();
    Serial.printf("✅ Heartbeat sent successfully (HTTP %d)\n", httpResponseCode);
    isOnline = true;
    http.end();
    return true;
  } else {
    Serial.printf("❌ Heartbeat failed (HTTP %d)\n", httpResponseCode);
    
    // Jika gagal kirim heartbeat, cek koneksi
    if (httpResponseCode == -1 || httpResponseCode == -11) {
      Serial.println("🔍 Network issue detected, checking WiFi...");
      isOnline = false;
      checkWiFiConnection();
    }
    
    http.end();
    return false;
  }
}

void startWebServer() {
  if (isServerStarted || !isWiFiConnected) return;
  
  Serial.println("🌐 Starting web server...");
  
  server = new WebServer(80);
  
  // Setup HTTP routes
  server->on("/", HTTP_GET, handleRoot);
  server->on("/api/status", HTTP_GET, handleApiStatus);
  server->on("/api/scan", HTTP_GET, handleApiScan);
  server->on("/api/history", HTTP_GET, handleApiHistory);
  server->on("/api/config", HTTP_POST, handleApiConfig);
  server->on("/api/mode", HTTP_GET, handleApiMode);
  server->on("/api/mode", HTTP_POST, handleApiMode);
  server->on("/api/attendance", HTTP_POST, handleApiAttendance);
  server->on("/reset", HTTP_POST, handleReset);
  
  // Handle CORS preflight requests
  server->on("/api/status", HTTP_OPTIONS, handleOptions);
  server->on("/api/scan", HTTP_OPTIONS, handleOptions);
  server->on("/api/history", HTTP_OPTIONS, handleOptions);
  server->on("/api/config", HTTP_OPTIONS, handleOptions);
  server->on("/api/mode", HTTP_OPTIONS, handleOptions);
  server->on("/api/attendance", HTTP_OPTIONS, handleOptions);
  
  server->begin();
  isServerStarted = true;
  Serial.println("✅ Web server started successfully");
}

void handleRoot() {
  if (!server) return;
  
  String statusColor = isOnline ? "rgba(40,167,69,0.3)" : "rgba(220,53,69,0.3)";
  String statusText = isOnline ? "✓ Scanner Online" : "✗ Scanner Offline";
  String connectionStatus = isWiFiConnected ? "Connected" : "Disconnected";
  
  String html = R"rawliteral(
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>ESP32 barcodescanesp32 Scanner</title>
      <style>
        body { 
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
          text-align: center; 
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 20px;
          margin: 0;
          min-height: 100vh;
        }
        .container {
          background: rgba(255,255,255,0.1);
          backdrop-filter: blur(10px);
          padding: 30px;
          border-radius: 20px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.3);
          max-width: 800px;
          margin: 0 auto;
        }
        .status { 
          padding: 15px; 
          border-radius: 12px; 
          margin: 15px 0; 
          background: rgba(255,255,255,0.2);
          text-align: left;
          border: 1px solid rgba(255,255,255,0.3);
        }
        .online { background: )rawliteral" + statusColor + R"rawliteral(; border-color: rgba(40,167,69,0.5); }
        .firebase { background: rgba(255,193,7,0.3); border-color: rgba(255,193,7,0.5); }
        .wifi-info { background: rgba(34,197,94,0.3); border-color: rgba(34,197,94,0.5); }
        .barcode-display {
          background: rgba(0,0,0,0.4);
          padding: 25px;
          border-radius: 15px;
          margin: 20px 0;
          font-family: 'Courier New', monospace;
          font-size: 1.4em;
          font-weight: bold;
          word-break: break-all;
          border: 2px solid rgba(255,255,255,0.3);
          min-height: 60px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .btn {
          background: rgba(255,255,255,0.2);
          border: 1px solid rgba(255,255,255,0.4);
          color: white;
          padding: 12px 20px;
          border-radius: 10px;
          cursor: pointer;
          margin: 8px;
          font-size: 14px;
          text-decoration: none;
          display: inline-block;
          transition: all 0.3s ease;
        }
        .btn:hover {
          background: rgba(255,255,255,0.3);
          transform: translateY(-2px);
        }
        .config-section {
          background: rgba(255,255,255,0.1);
          padding: 20px;
          border-radius: 12px;
          margin: 20px 0;
          text-align: left;
        }
        .input-group {
          margin: 10px 0;
        }
        .input-group label {
          display: block;
          margin-bottom: 5px;
          font-weight: bold;
        }
        .input-group input {
          width: 100%;
          padding: 8px;
          border: 1px solid rgba(255,255,255,0.3);
          border-radius: 6px;
          background: rgba(255,255,255,0.1);
          color: white;
          font-size: 14px;
        }
        .input-group input::placeholder {
          color: rgba(255,255,255,0.7);
        }
        .status-indicator {
          display: inline-block;
          width: 12px;
          height: 12px;
          border-radius: 50%;
          margin-right: 8px;
        }
        .status-online { background-color: #28a745; }
        .status-offline { background-color: #dc3545; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>ESP32 barcodescanesp32 Scanner</h1>
        <p><em>v3.1 - Enhanced Connectivity & Heartbeat</em></p>
        
        <div class="status online">
          <strong>)rawliteral" + statusText + R"rawliteral(</strong><br>
          <span class="status-indicator )rawliteral" + (isOnline ? "status-online" : "status-offline") + R"rawliteral("></span>
          Connection: )rawliteral" + connectionStatus + R"rawliteral(<br>
          Device ID: )rawliteral" + String(deviceConfig.deviceId) + R"rawliteral(<br>
          <strong>Current Mode: )rawliteral" + getModeString(currentMode) + R"rawliteral(</strong><br>
          Free Heap: )rawliteral" + String(ESP.getFreeHeap()) + R"rawliteral( bytes<br>
          Uptime: )rawliteral" + String((millis() - bootTime) / 1000) + R"rawliteral( seconds<br>
          Total Scans: )rawliteral" + String(scanCount) + R"rawliteral(
        </div>
        
        <div class="status firebase">
          <strong>Firebase Status</strong><br>
          Project: barcodescanesp32<br>
          Database URL: )rawliteral" + String(deviceConfig.firebaseUrl) + R"rawliteral(<br>
          Real-time Sync: )rawliteral" + (isOnline ? "Active" : "Disconnected") + R"rawliteral(<br>
          Last Heartbeat: )rawliteral" + String((millis() - lastHeartbeat) / 1000) + R"rawliteral(s ago<br>
          Heartbeat Interval: 8 seconds
        </div>
        
        <div class="status wifi-info">
          <strong>WiFi Status</strong><br>
          SSID: )rawliteral" + String(wifiConfig.ssid) + R"rawliteral(<br>
          IP: )rawliteral" + WiFi.localIP().toString() + R"rawliteral(<br>
          Signal: )rawliteral" + String(WiFi.RSSI()) + R"rawliteral( dBm<br>
          WebSocket: ws://)rawliteral" + WiFi.localIP().toString() + R"rawliteral(:81<br>
          Auto-Reconnect: Enabled
        </div>

        <h3>Last Scanned Barcode:</h3>
        <div class="barcode-display" id="barcode">)rawliteral" + (lastBarcode.length() > 0 ? lastBarcode : "No barcode scanned yet") + R"rawliteral(</div>
        
        <div class="config-section">
          <h4>Mode Control</h4>
          <div class="input-group">
            <label>Scanner Mode:</label>
            <select id="scannerMode" style="width: 100%; padding: 8px; border: 1px solid rgba(255,255,255,0.3); border-radius: 6px; background: rgba(255,255,255,0.1); color: white;">
              <option value="inventory" )rawliteral" + (currentMode == MODE_INVENTORY ? "selected" : "") + R"rawliteral(>Inventory Management</option>
              <option value="attendance" )rawliteral" + (currentMode == MODE_ATTENDANCE ? "selected" : "") + R"rawliteral(>Attendance System</option>
            </select>
          </div>
          <button class="btn" onclick="updateMode()">Update Mode</button>
          <button class="btn" onclick="testMode()">Test Current Mode</button>
        </div>
        
        <div class="config-section">
          <h4>Firebase Configuration</h4>
          <div class="input-group">
            <label>Firebase Database URL:</label>
            <input type="text" id="firebaseUrl" value=")rawliteral" + String(deviceConfig.firebaseUrl) + R"rawliteral(" placeholder="https://barcodescanesp32-default-rtdb.asia-southeast1.firebasedatabase.app">
          </div>
          <div class="input-group">
            <label>Server URL (Backup):</label>
            <input type="text" id="serverUrl" value=")rawliteral" + String(deviceConfig.serverUrl) + R"rawliteral(" placeholder="https://v0-website-export-request.vercel.app/">
          </div>
          <div class="input-group">
            <label>API Key:</label>
            <input type="password" id="apiKey" value=")rawliteral" + String(deviceConfig.apiKey) + R"rawliteral(" placeholder="Your API Key (optional)">
          </div>
          <button class="btn" onclick="updateConfig()">Update Configuration</button>
        </div>
        
        <div style="margin-top: 30px;">
          <a href="/api/status" class="btn">API Status</a>
          <a href="/api/history" class="btn">Scan History</a>
          <button class="btn" onclick="testFirebase()">Test Firebase</button>
          <button class="btn" onclick="sendTestHeartbeat()">Test Heartbeat</button>
        </div>
        
        <p><em>Enhanced real-time monitoring with auto-reconnect!</em></p>
      </div>

      <script>
        var ws = null;

        var updateMode = function() {
          var mode = document.getElementById('scannerMode').value;
          
          fetch('/api/mode', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              mode: mode
            })
          })
          .then(function(response) { return response.json(); })
          .then(function(data) {
            alert('Mode updated: ' + data.mode);
            location.reload();
          })
          .catch(function(error) {
            alert('Error updating mode: ' + error);
          });
        };
        
        var testMode = function() {
          var mode = document.getElementById('scannerMode').value;
          var testCode = mode === 'attendance' ? '10222005' : '1234567890123';
          
          if (confirm('Test ' + mode + ' mode with code: ' + testCode + '?')) {
            fetch('/api/' + mode, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                code: testCode,
                test: true
              })
            })
            .then(function(response) { return response.json(); })
            .then(function(data) {
              alert('Test result: ' + data.message);
            })
            .catch(function(error) {
              alert('Test failed: ' + error);
            });
          }
        };
        
        var updateConfig = function() {
          var firebaseUrl = document.getElementById('firebaseUrl').value;
          var serverUrl = document.getElementById('serverUrl').value;
          var apiKey = document.getElementById('apiKey').value;
          
          fetch('/api/config', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              firebaseUrl: firebaseUrl,
              serverUrl: serverUrl,
              apiKey: apiKey
            })
          })
          .then(function(response) { return response.json(); })
          .then(function(data) {
            alert('Configuration updated successfully!');
          })
          .catch(function(error) {
            alert('Error updating configuration: ' + error);
          });
        };
        
        var testFirebase = function() {
          var firebaseUrl = document.getElementById('firebaseUrl').value;
          if (!firebaseUrl) {
            alert('Please enter Firebase URL first');
            return;
          }
          
          fetch(firebaseUrl + '/.json', {
            method: 'GET'
          })
          .then(function(response) {
            if (response.ok) {
              alert('Firebase barcodescanesp32 connection successful!');
            } else {
              alert('Firebase responded with error: ' + response.status);
            }
          })
          .catch(function(error) {
            alert('Cannot connect to Firebase: ' + error.message);
          });
        };
        
        var sendTestHeartbeat = function() {
          fetch('/api/heartbeat', {
            method: 'POST'
          })
          .then(function(response) { return response.json(); })
          .then(function(data) {
            alert('Test heartbeat sent: ' + data.message);
          })
          .catch(function(error) {
            alert('Test heartbeat failed: ' + error);
          });
        };
        
        setInterval(function() {
          fetch('/api/scan')
            .then(function(response) { return response.json(); })
            .then(function(data) {
              if (data.status === 'success' && data.barcode) {
                document.getElementById('barcode').textContent = data.barcode;
              }
            });
        }, 5000);
      </script>
    </body>
    </html>
  )rawliteral";

  server->send(200, "text/html", html);
}

void handleApiStatus() {
  if (!server) return;
  
  DynamicJsonDocument doc(1024);
  
  doc["deviceId"] = deviceConfig.deviceId;
  doc["wifiConnected"] = isWiFiConnected;
  doc["isOnline"] = isOnline;
  doc["ssid"] = wifiConfig.ssid;
  doc["ipAddress"] = WiFi.localIP().toString();
  doc["rssi"] = WiFi.RSSI();
  doc["lastBarcode"] = lastBarcode;
  doc["serverUrl"] = deviceConfig.serverUrl;
  doc["firebaseUrl"] = deviceConfig.firebaseUrl;
  doc["firebaseProject"] = "barcodescanesp32";
  doc["uptime"] = (millis() - bootTime) / 1000;
  doc["freeHeap"] = ESP.getFreeHeap();
  doc["scanCount"] = scanCount;
  doc["firebaseEnabled"] = strlen(deviceConfig.firebaseUrl) > 0;
  doc["lastHeartbeat"] = (millis() - lastHeartbeat) / 1000;
  doc["version"] = "3.2";
  doc["currentMode"] = getModeString(currentMode);
  
  String response;
  serializeJson(doc, response);
  
  server->sendHeader("Access-Control-Allow-Origin", "*");
  server->send(200, "application/json", response);
}

// Handle mode API requests
void handleApiMode() {
  if (!server) return;
  
  server->sendHeader("Access-Control-Allow-Origin", "*");
  
  if (server->method() == HTTP_GET) {
    // Return current mode
    DynamicJsonDocument doc(512);
    doc["currentMode"] = getModeString(currentMode);
    doc["deviceId"] = deviceConfig.deviceId;
    doc["timestamp"] = millis();
    
    String response;
    serializeJson(doc, response);
    server->send(200, "application/json", response);
    
  } else if (server->method() == HTTP_POST) {
    // Update mode
    if (server->hasArg("plain")) {
      DynamicJsonDocument doc(512);
      deserializeJson(doc, server->arg("plain"));
      
      if (doc.containsKey("mode")) {
        String newMode = doc["mode"];
        
        Serial.println("📱 Mode change requested: " + newMode);
        Serial.println("   - Current mode before change: " + getModeString(currentMode));
        
        if (newMode == "inventory") {
          currentMode = MODE_INVENTORY;
        } else if (newMode == "attendance") {
          currentMode = MODE_ATTENDANCE;
        }
        
        Serial.println("🔄 Mode changed to: " + getModeString(currentMode));
        saveDeviceConfig(); // Simpan mode ke EEPROM
        Serial.println("📊 Mode in device config after save: " + String(deviceConfig.currentMode));
      }
      
      DynamicJsonDocument response(512);
      response["status"] = "success";
      response["mode"] = getModeString(currentMode);
      response["deviceMode"] = deviceConfig.currentMode;
      
      String responseStr;
      serializeJson(response, responseStr);
      server->send(200, "application/json", responseStr);
    } else {
      server->send(400, "application/json", "{\"error\":\"No data provided\"}");
    }
  }
}

// Handle attendance API requests
void handleApiAttendance() {
  if (!server) return;
  
  server->sendHeader("Access-Control-Allow-Origin", "*");
  
  if (server->method() == HTTP_POST) {
    if (server->hasArg("plain")) {
      DynamicJsonDocument doc(512);
      deserializeJson(doc, server->arg("plain"));
      
      // First check if we're in attendance mode
      if (currentMode != MODE_ATTENDANCE) {
        Serial.println("❌ Cannot process attendance: Device is in " + getModeString(currentMode) + " mode");
        server->send(400, "application/json", "{\"error\":\"Device is not in attendance mode\",\"currentMode\":\"" + getModeString(currentMode) + "\"}");
        return;
      }
      
      if (doc.containsKey("code")) {
        String code = doc["code"];
        bool isTest = doc.containsKey("test") ? doc["test"] : false;
        
        if (isTest) {
          Serial.println("🧪 Test attendance mode with code: " + code);
        }
        
        // Process as attendance
        processAttendanceBarcode(code);
        
        DynamicJsonDocument response(512);
        response["status"] = "success";
        response["message"] = isTest ? "Test attendance processed" : "Attendance processed";
        response["code"] = code;
        response["mode"] = "attendance";
        
        String responseStr;
        serializeJson(response, responseStr);
        server->send(200, "application/json", responseStr);
      } else {
        server->send(400, "application/json", "{\"error\":\"No code provided\"}");
      }
    } else {
      server->send(400, "application/json", "{\"error\":\"No data provided\"}");
    }
  }
}

// Process attendance barcode (typically student IDs/NIMs)
void processAttendanceBarcode(String nim) {
  Serial.println("🎓 Processing attendance code: " + nim);
  
  // Double check if we're in attendance mode
  if (currentMode != MODE_ATTENDANCE) {
    Serial.println("❌ Cannot process attendance: Device is in " + getModeString(currentMode) + " mode");
    return;
  }
  
  // Validate NIM format
  if (!isValidNIM(nim)) {
    Serial.println("❌ Invalid NIM format: " + nim);
    broadcastAttendanceResult(nim, false);
    return;
  }
  
  // Add to scan history
  ScanData scanData;
  scanData.barcode = nim;
  scanData.timestamp = String(millis());
  scanData.deviceId = deviceConfig.deviceId;
  scanData.processed = false;
  scanData.sentToFirebase = false;
  
  // Send attendance record to Firebase if connected
  if (isWiFiConnected && strlen(deviceConfig.firebaseUrl) > 0) {
    bool sentToFirebase = sendAttendanceToFirebase(nim);
    scanData.sentToFirebase = sentToFirebase;
    
    if (sentToFirebase) {
      Serial.println("✅ Attendance record sent to Firebase successfully");
      broadcastAttendanceResult(nim, true);
    } else {
      Serial.println("❌ Failed to send attendance record to Firebase");
      broadcastAttendanceResult(nim, false);
    }
  } else {
    Serial.println("⚠️ Not connected to WiFi or Firebase URL not configured");
    broadcastAttendanceResult(nim, false);
  }
  
  // Add to history (limit to last 20 items)
  scanHistory.push_back(scanData);
  if (scanHistory.size() > 20) {
    scanHistory.erase(scanHistory.begin());
  }
}

// Process inventory barcode
void processInventoryBarcode(String barcode) {
  Serial.println("🏭 Processing inventory barcode: " + barcode);
  
  // Double check if we're in inventory mode
  if (currentMode != MODE_INVENTORY) {
    Serial.println("❌ Cannot process inventory: Device is in " + getModeString(currentMode) + " mode");
    return;
  }
  
  // Add to scan history
  ScanData scanData;
  scanData.barcode = barcode;
  scanData.timestamp = String(millis());
  scanData.deviceId = deviceConfig.deviceId;
  scanData.processed = false;
  scanData.sentToFirebase = false;
  
  // Send to Firebase if connected
  if (isWiFiConnected && strlen(deviceConfig.firebaseUrl) > 0) {
    bool sentToFirebase = sendBarcodeToFirebase(barcode);
    scanData.sentToFirebase = sentToFirebase;
    
    if (sentToFirebase) {
      Serial.println("✅ Inventory barcode sent to Firebase successfully");
    } else {
      Serial.println("❌ Failed to send inventory barcode to Firebase");
    }
    
    // Broadcast the scan result to any connected clients
    broadcastBarcodeScan(barcode);
  } else {
    Serial.println("⚠️ Not connected to WiFi or Firebase URL not configured");
  }
  
  // Add to history (limit to last 20 items)
  scanHistory.push_back(scanData);
  if (scanHistory.size() > 20) {
    scanHistory.erase(scanHistory.begin());
  }
}

void handleApiScan() {
  if (!server) return;
  
  server->sendHeader("Access-Control-Allow-Origin", "*");
  
  DynamicJsonDocument doc(1024);
  
  if (lastBarcode.length() == 0) {
    doc["status"] = "no_scan";
    doc["message"] = "Tidak ada barcode yang di-scan";
  } else {
    doc["status"] = "success";
    doc["barcode"] = lastBarcode;
    doc["timestamp"] = lastScanTime;
    doc["deviceId"] = deviceConfig.deviceId;
    doc["sentToFirebase"] = true;
    doc["firebaseProject"] = "barcodescanesp32";
    doc["isOnline"] = isOnline;
  }
  
  String response;
  serializeJson(doc, response);
  server->send(200, "application/json", response);
}

void handleApiHistory() {
  if (!server) return;
  
  server->sendHeader("Access-Control-Allow-Origin", "*");
  
  DynamicJsonDocument doc(2048);
  JsonArray scans = doc.createNestedArray("scans");
  
  for (const auto& scan : scanHistory) {
    JsonObject scanObj = scans.createNestedObject();
    scanObj["barcode"] = scan.barcode;
    scanObj["timestamp"] = scan.timestamp;
    scanObj["deviceId"] = scan.deviceId;
    scanObj["processed"] = scan.processed;
    scanObj["sentToFirebase"] = scan.sentToFirebase;
  }
  
  doc["total"] = scanHistory.size();
  doc["deviceId"] = deviceConfig.deviceId;
  doc["firebaseProject"] = "barcodescanesp32";
  doc["firebaseEnabled"] = strlen(deviceConfig.firebaseUrl) > 0;
  doc["isOnline"] = isOnline;
  
  String response;
  serializeJson(doc, response);
  server->send(200, "application/json", response);
}

void handleApiConfig() {
  if (!server) return;
  
  server->sendHeader("Access-Control-Allow-Origin", "*");
  
  if (server->hasArg("plain")) {
    DynamicJsonDocument doc(1024);
    deserializeJson(doc, server->arg("plain"));
    
    if (doc.containsKey("serverUrl")) {
      strncpy(deviceConfig.serverUrl, doc["serverUrl"], sizeof(deviceConfig.serverUrl) - 1);
    }
    
    if (doc.containsKey("firebaseUrl")) {
      strncpy(deviceConfig.firebaseUrl, doc["firebaseUrl"], sizeof(deviceConfig.firebaseUrl) - 1);
    }
    
    if (doc.containsKey("apiKey")) {
      strncpy(deviceConfig.apiKey, doc["apiKey"], sizeof(deviceConfig.apiKey) - 1);
    }
    
    saveDeviceConfig();
    
    DynamicJsonDocument response(512);
    response["status"] = "success";
    response["message"] = "Configuration updated";
    
    String responseStr;
    serializeJson(response, responseStr);
    server->send(200, "application/json", responseStr);
  } else {
    server->send(400, "application/json", "{\"error\":\"No data provided\"}");
  }
}

void handleReset() {
  if (!server) return;
  
  server->sendHeader("Access-Control-Allow-Origin", "*");
  server->send(200, "text/plain", "Configuration reset. Restarting...");
  
  // Reset all configuration
  memset(&wifiConfig, 0, sizeof(wifiConfig));
  memset(&deviceConfig, 0, sizeof(deviceConfig));
  wifiConfig.isValid = false;
  deviceConfig.isConfigured = false;
  
  EEPROM.put(WIFI_CONFIG_ADDR, wifiConfig);
  EEPROM.put(DEVICE_CONFIG_ADDR, deviceConfig);
  EEPROM.commit();
  
  delay(1000);
  ESP.restart();
}

void handleOptions() {
  if (!server) return;
  
  server->sendHeader("Access-Control-Allow-Origin", "*");
  server->sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  server->sendHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  server->send(200, "text/plain", "");
}

void processBarcodeInput(String input) {
  input.trim();
  
  if (input.length() == 0) return;
  
  Serial.println("📱 Processing input: " + input);
  Serial.println("🔄 Current mode: " + getModeString(currentMode));
  
  // Check if it's a WiFi QR code
  if (input.startsWith("WIFI:")) {
    String ssid, password, security;
    if (parseWiFiQR(input, ssid, password, security)) {
      // Save WiFi configuration
      strncpy(wifiConfig.ssid, ssid.c_str(), sizeof(wifiConfig.ssid) - 1);
      strncpy(wifiConfig.password, password.c_str(), sizeof(wifiConfig.password) - 1);
      wifiConfig.isValid = true;
      
      saveWiFiConfig();
      
      Serial.println("🔄 WiFi configured, attempting connection...");
      
      if (connectToWiFi()) {
        startWebServer();
        Serial.println("✅ WiFi connected and web server started!");
      }
    }
    return;
  }
  
  // Update common variables
  lastBarcode = input;
  lastScanTime = millis();
  scanCount++;
  
  Serial.println("✅ Processing scan: " + input);
  
  // Process based on current mode
  switch (currentMode) {
    case MODE_ATTENDANCE:
      processAttendanceBarcode(input);
      break;
      
    case MODE_INVENTORY:
    default:
      processInventoryBarcode(input);
      break;
  }
  
  Serial.println("✅ Barcode processed in " + getModeString(currentMode) + " mode: " + input);
}

// Broadcast barcode scan to connected clients
void broadcastBarcodeScan(String barcode) {
  // This function would normally use WebSockets to broadcast to clients
  // But since WebSockets are not implemented in this code yet, we'll just log
  Serial.println("📡 Would broadcast barcode: " + barcode);
  
  // Future implementation would be something like:
  // if (webSocket && webSocket.connectedClients() > 0) {
  //   DynamicJsonDocument doc(512);
  //   doc["type"] = "barcode_scan";
  //   doc["barcode"] = barcode;
  //   doc["timestamp"] = millis();
  //   doc["deviceId"] = deviceConfig.deviceId;
  //   
  //   String jsonString;
  //   serializeJson(doc, jsonString);
  //   webSocket.broadcastTXT(jsonString);
  // }
}

// Broadcast attendance result to connected clients
void broadcastAttendanceResult(String nim, bool success) {
  // This function would normally use WebSockets to broadcast to clients
  // But since WebSockets are not implemented in this code yet, we'll just log
  Serial.println("📡 Would broadcast attendance: " + nim + " (success: " + String(success) + ")");
  
  // Future implementation would be something like:
  // if (webSocket && webSocket.connectedClients() > 0) {
  //   DynamicJsonDocument doc(512);
  //   doc["type"] = "attendance_result";
  //   doc["nim"] = nim;
  //   doc["success"] = success;
  //   doc["timestamp"] = millis();
  //   doc["deviceId"] = deviceConfig.deviceId;
  //   
  //   String jsonString;
  //   serializeJson(doc, jsonString);
  //   webSocket.broadcastTXT(jsonString);
  // }
}

// Setup function
void setup() {
  Serial.begin(115200);
  Serial2.begin(9600, SERIAL_8N1, RXD2, TXD2);
  delay(1000);
  
  bootTime = millis(); // Record boot time
  
  Serial.println("\n🚀 ESP32 barcodescanesp32 Scanner v3.3");
  Serial.println("==========================================");
  Serial.println("🔥 Firebase Project: barcodescanesp32");
  Serial.println("📦 Enhanced Inventory Management System");
  Serial.println("🎓 Attendance System Support");
  Serial.println("🔄 Dynamic Mode Switching");
  Serial.println("🔌 WebSocket Support");
  Serial.println("📡 Real-time Communication");
  Serial.println("💓 Advanced Heartbeat Monitoring");
  Serial.println("🔧 Auto-Reconnect WiFi");
  Serial.println("🌏 Region: Asia Southeast 1 (Singapore)");
  Serial.println("==========================================");
  Serial.println("Default Mode (before EEPROM load): " + getModeString(currentMode));
  Serial.println("==========================================");
  
  // Initialize EEPROM
  EEPROM.begin(EEPROM_SIZE);
  Serial.println("💾 EEPROM initialized");
  
  // Load configurations
  loadWiFiConfig();
  loadDeviceConfig();
  
  Serial.println("==========================================");
  Serial.println("Current Mode (after EEPROM load): " + getModeString(currentMode));
  Serial.println("==========================================");
  
  // Set WiFi mode
  WiFi.mode(WIFI_STA);
  delay(500);
  
  // Try to connect to WiFi if credentials available
  if (wifiConfig.isValid) {
    Serial.println("📋 WiFi credentials found, attempting connection...");
    
    if (connectToWiFi()) {
      startWebServer();
      Serial.println("✅ ESP32 barcodescanesp32 Scanner ready and operational!");
      Serial.println("🌐 Web interface: http://" + WiFi.localIP().toString());
      Serial.println("🔌 WebSocket: ws://" + WiFi.localIP().toString() + ":81");
      Serial.println("🔥 Firebase URL: " + String(deviceConfig.firebaseUrl));
    } else {
      Serial.println("❌ WiFi connection failed");
      Serial.println("💡 Scan WiFi QR code to configure network");
    }
  } else {
    Serial.println("🔧 No WiFi configuration found");
    Serial.println("💡 Scan WiFi QR code to configure network");
    Serial.println("   Format: WIFI:S:SSID;T:WPA;P:PASSWORD;H:false;;");
  }
  
  Serial.println("🎯 Setup completed - Ready for operation!");
  Serial.printf("Free heap: %d bytes\n", ESP.getFreeHeap());
  Serial.println("📱 Ready to scan barcodes...");
  
  // Initialize heartbeat
  lastHeartbeat = millis();
}

void loop() {
  // Handle web server
  if (isServerStarted && server) {
    server->handleClient();
  }
  
  // Monitor WiFi connection setiap 10 detik
  checkWiFiConnection();
  
  // Read from Serial2 (barcode scanner)
  if (Serial2.available()) {
    String input = Serial2.readStringUntil('\n');
    processBarcodeInput(input);
  }
  
  // Read from Serial (for testing)
  if (Serial.available()) {
    String input = Serial.readStringUntil('\n');
    Serial.println("🧪 Test input received: " + input);
    processBarcodeInput(input);
  }
  
  // Send heartbeat setiap 8 detik (lebih responsif dengan 30 detik timeout)
  if (millis() - lastHeartbeat > 8000) {
    if (isWiFiConnected) {
      // Send to Firebase first
      if (strlen(deviceConfig.firebaseUrl) > 0) {
        bool sentToFirebase = sendHeartbeatToFirebase();
        if (sentToFirebase) {
          Serial.println("💓 Heartbeat sent to Firebase barcodescanesp32");
        } else {
          Serial.println("❌ Heartbeat failed - checking connection...");
          checkWiFiConnection();
        }
      }
    }
    lastHeartbeat = millis();
  }
  
  delay(100);
}