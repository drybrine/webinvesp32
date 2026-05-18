// =============================================================================
//  ESP32 GM67 Barcode Scanner - Inventory Only
//  Firebase Structure:
//    /scans/{id}        -> scan records
//    /devices/{id}      -> heartbeat & device info
//    /inventory/{id}    -> product lookup & stock update
//    /analytics         -> totalScans, totalItems, lowStockAlerts, lastReset
//  OLED SSD1306 I2C    -> display status & scan result
// =============================================================================

#include <WiFi.h>
#include <WebServer.h>
#include <EEPROM.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <time.h>
#include <esp_adc_cal.h>
#include <driver/adc.h>

// --- OLED SSD1306 I2C --------------------------------------------------------
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

#define SCREEN_WIDTH         128
#define SCREEN_HEIGHT         64
#define OLED_RESET            -1
#define OLED_ADDRESS        0x3C
#define OLED_SDA              21
#define OLED_SCL              22

Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);
bool          oledAvailable       = false;
unsigned long lastOledRefresh     = 0;
unsigned long lastBarcodeOnOled   = 0;
#define OLED_BARCODE_HOLD_MS  8000
// -----------------------------------------------------------------------------

#define RXD2                16
#define TXD2                17
#define EEPROM_SIZE       1024
#define WIFI_CONFIG_ADDR     0
#define DEVICE_CONFIG_ADDR 512
#define FIRMWARE_VERSION   "6.1"

// --- Battery Monitoring (voltage divider R1=R2=100kΩ) ------------------------
#define BATTERY_PIN          34
#define BATTERY_MAX_MV     3800  // calibrated: full charge reads ~3785mV via divider
#define BATTERY_MIN_MV     3200  // PCM cut-off ~3.2V (LP902040 mati di ~30% dengan MIN=3000)
#define BATTERY_DIVIDER    2.0f  // (R1+R2)/R2 = 200k/100k
#define BATTERY_SAMPLES      10  // averaging samples per read
#define BATTERY_EMA_ALPHA  0.05f // EMA smoothing (lower = smoother, less WiFi sag noise)
#define BATTERY_HYSTERESIS   2   // only update reported level if change >= 2%
#define BATTERY_ADC_CHANNEL  ADC1_CHANNEL_6  // GPIO34 = ADC1_CH6
#define BATTERY_ADC_ATTEN    ADC_ATTEN_DB_11 // 0-3.3V range
// -----------------------------------------------------------------------------

// --- Structs -----------------------------------------------------------------
struct WiFiConfig {
  char     ssid[64];
  char     password[64];
  bool     isValid;
  uint32_t checksum;
};

struct DeviceConfig {
  char     deviceId[32];
  char     serverUrl[128];
  char     firebaseUrl[128];
  char     apiKey[64];
  bool     isConfigured;
  uint32_t checksum;
  uint8_t  version;
  uint8_t  padding[3];
};

struct InventoryItem {
  String id;
  String name;
  String barcode;
  String category;
  String location;
  String supplier;
  int    quantity;
  int    minStock;
  float  price;
  bool   found;
};

struct ScanData {
  String barcode;
  String timestamp;
  String deviceId;
  bool   processed;
  bool   sentToFirebase;
};
// -----------------------------------------------------------------------------

WebServer* server = nullptr;

WiFiConfig   wifiConfig;
DeviceConfig deviceConfig;

String        lastBarcode     = "";
bool          isWiFiConnected = false;
bool          isServerStarted = false;
unsigned long lastScanTime    = 0;
unsigned long lastHeartbeat   = 0;
unsigned long scanCount       = 0;
unsigned long bootTime        = 0;
unsigned long lastWiFiCheck   = 0;
bool          isOnline        = false;

std::vector<ScanData> scanHistory;

// --- Function Declarations ---------------------------------------------------
void          handleRoot();
void          handleApiStatus();
void          handleApiScan();
void          handleApiHistory();
void          handleApiConfig();
void          handleReset();
void          handleOptions();
void          startWebServer();
void          processBarcodeInput(String input);
void          processInventoryBarcode(String barcode);
bool          connectToWiFi();
bool          sendScanToFirebase(String barcode);
bool          sendHeartbeatToFirebase();
InventoryItem lookupInventoryByBarcode(String barcode);
bool          parseWiFiQR(String qrData, String &ssid, String &password, String &security);
void          saveWiFiConfig();
void          loadWiFiConfig();
void          saveDeviceConfig();
void          loadDeviceConfig();
void          checkWiFiConnection();
void          setDeviceOffline();
uint32_t      calculateChecksum(const void* data, size_t length);
void          initOLED();
void          drawBatteryIcon(int x, int y, int percent);
void          drawWifiIcon(int x, int y, int rssi);
void          initBatteryADC();
void          sampleBattery();
int           readBatteryLevel();
void          oledShowBoot();
void          oledShowStatus();
void          oledShowBarcode(String barcode, String itemName, bool sent);
void          oledShowInventoryFound(String name, int qty, int minStock);
void          oledShowWiFiConnecting(String ssid);
void          oledShowWiFiConnected(String ip);
void          oledShowNoWiFi();
void          oledUpdateIdle();
// -----------------------------------------------------------------------------


// =============================================================================
//  BATTERY LEVEL (esp_adc_cal calibrated)
// =============================================================================
float batteryEma = -1.0f;       // persistent EMA state (-1 = uninitialized)
int   lastReportedBattery = -1; // hysteresis: last sent value
int   cachedBatteryLevel  = -1; // pre-sampled before WiFi activity
esp_adc_cal_characteristics_t adcCal;  // ADC calibration characteristics
bool  adcCalibrated = false;

void initBatteryADC() {
  adc1_config_width(ADC_WIDTH_BIT_12);
  adc1_config_channel_atten(BATTERY_ADC_CHANNEL, BATTERY_ADC_ATTEN);

  esp_adc_cal_value_t calType = esp_adc_cal_characterize(
    ADC_UNIT_1, BATTERY_ADC_ATTEN, ADC_WIDTH_BIT_12, 1100, &adcCal
  );

  adcCalibrated = true;
  Serial.printf("ADC Cal: type=%s, Vref=%dmV\n",
    (calType == ESP_ADC_CAL_VAL_EFUSE_VREF) ? "eFuse Vref" :
    (calType == ESP_ADC_CAL_VAL_EFUSE_TP)   ? "eFuse Two Point" :
    "Default Vref", adcCal.vref);
}

// Sample battery ADC (call BEFORE any WiFi/HTTP to avoid voltage sag)
void sampleBattery() {
  // Use esp_adc_cal multisampling for accurate mV reading
  uint32_t adcSum = 0;
  for (int i = 0; i < BATTERY_SAMPLES; i++) {
    adcSum += esp_adc_cal_raw_to_voltage(adc1_get_raw(BATTERY_ADC_CHANNEL), &adcCal);
    delay(2);
  }
  float voltageMv = (adcSum / (float)BATTERY_SAMPLES) * BATTERY_DIVIDER;

  // EMA smoothing across calls
  if (batteryEma < 0) {
    batteryEma = voltageMv;  // first reading: initialize
  } else {
    batteryEma = BATTERY_EMA_ALPHA * voltageMv + (1.0f - BATTERY_EMA_ALPHA) * batteryEma;
  }

  int percent = (int)((batteryEma - BATTERY_MIN_MV) * 100.0f / (BATTERY_MAX_MV - BATTERY_MIN_MV));
  if (percent > 100) percent = 100;
  if (percent < 0) percent = 0;

  // Hysteresis: only change reported value if delta >= threshold
  if (lastReportedBattery < 0 || abs(percent - lastReportedBattery) >= BATTERY_HYSTERESIS) {
    lastReportedBattery = percent;
  }
  cachedBatteryLevel = lastReportedBattery;

  Serial.printf("Battery: mV=%.0f, ema=%.0f, pct=%d%%, reported=%d%%\n",
                voltageMv, batteryEma, percent, cachedBatteryLevel);
}

// Return cached battery level (safe to call during WiFi activity)
int readBatteryLevel() {
  if (cachedBatteryLevel < 0) sampleBattery(); // fallback if never sampled
  return cachedBatteryLevel;
}


// =============================================================================
//  CHECKSUM
// =============================================================================
uint32_t calculateChecksum(const void* data, size_t length) {
  uint32_t cs = 0xFFFFFFFF;
  const uint8_t* bytes = (const uint8_t*)data;
  for (size_t i = 0; i < length; i++) {
    cs ^= bytes[i];
    for (int j = 0; j < 8; j++) cs = (cs >> 1) ^ (0xEDB88320 & (-(cs & 1)));
  }
  return ~cs;
}


// =============================================================================
//  OLED FUNCTIONS
//  Layout OLED Yellow-Blue SSD1306 128x64:
//    KUNING -> baris piksel y=0..15  (2 baris teks size 1: y=0 dan y=8)
//    BIRU   -> baris piksel y=16..63 (6 baris teks size 1: y=16,24,32,40,48,56)
// =============================================================================
void initOLED() {
  Wire.begin(OLED_SDA, OLED_SCL);
  if (!display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDRESS)) {
    Serial.println("OLED tidak ditemukan (SDA=21, SCL=22)");
    oledAvailable = false;
    return;
  }
  oledAvailable = true;
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  Serial.println("OLED SSD1306 Yellow-Blue OK");
}

// Boot screen
void oledShowBoot() {
  if (!oledAvailable) return;
  display.clearDisplay();
  display.setTextSize(1);

  // -- ZONA KUNING (y=0..15) --
  display.setCursor(16, 0); display.println("ESP32 SCANNER v6.0");
  display.setCursor(22, 8); display.println("GM67 Barcode Scanner");

  // -- ZONA BIRU (y=16..63) --
  display.setCursor(0, 18); display.println("Firebase Realtime DB");
  display.setCursor(0, 28); display.println("Inventory Mode Only");
  display.setCursor(0, 38); display.println("OLED: Yellow-Blue");
  display.drawLine(0, 50, 127, 50, SSD1306_WHITE);
  display.setCursor(26, 54); display.println("Initializing...");

  display.display();
}

// Draw battery icon at (x, y), size 16x8 pixels
void drawBatteryIcon(int x, int y, int percent) {
  // Battery body outline (12x7)
  display.drawRect(x, y, 13, 7, SSD1306_WHITE);
  // Battery tip (positive terminal)
  display.fillRect(x + 13, y + 2, 2, 3, SSD1306_WHITE);
  // Fill level (0-4 bars inside)
  int bars = (percent > 80) ? 4 : (percent > 55) ? 3 : (percent > 30) ? 2 : (percent > 10) ? 1 : 0;
  for (int i = 0; i < bars; i++) {
    display.fillRect(x + 2 + (i * 3), y + 2, 2, 3, SSD1306_WHITE);
  }
}

// Draw WiFi signal icon at (x, y) — 4 bars vertical
void drawWifiIcon(int x, int y, int rssi) {
  // bars: bottom-to-top fill based on RSSI
  // -30 to -50 dBm = 4 bars, -50 to -60 = 3, -60 to -70 = 2, -70 to -80 = 1, < -80 = 0
  int bars = (rssi >= -50) ? 4 : (rssi >= -60) ? 3 : (rssi >= -70) ? 2 : (rssi >= -80) ? 1 : 0;
  int h = 2;  // bar height
  for (int i = 0; i < 4; i++) {
    int bw = (i + 1) * 2;   // bottom bar widest, top bar narrowest
    int by = y + 6 - (i + 1) * h;
    if (i < bars) {
      display.fillRect(x + (4 - bw) / 2, by, bw, h - 1, SSD1306_WHITE);
    } else {
      display.drawRect(x + (4 - bw) / 2, by, bw, h - 1, SSD1306_WHITE);
    }
  }
}

// Status idle
void oledShowStatus() {
  if (!oledAvailable) return;
  display.clearDisplay();
  display.setTextSize(1);

  int batLvl = readBatteryLevel();

  // -- Row 1 (y=0): Title + Battery icon
  display.setCursor(0, 0); display.print("SCANNER v6.1");
  drawBatteryIcon(105, 0, batLvl);

  // -- Row 2 (y=9): Status + Battery %
  display.setCursor(0, 9);
  display.print(isOnline ? "[ONLINE]" : "[OFFLINE]");
  display.setCursor(106, 9);
  display.print(batLvl); display.print("%");

  // -- Separator 1 (y=17)
  display.drawLine(0, 17, 127, 17, SSD1306_WHITE);

  // -- Row 3 (y=20): WiFi name + signal icon (2 lines to avoid overlap)
  if (isWiFiConnected) {
    int rssi = WiFi.RSSI();
    String ssid = String(wifiConfig.ssid);
    if (ssid.length() > 14) ssid = ssid.substring(0, 14) + "..";
    display.setCursor(0, 20);
    display.print("WiFi: "); display.print(ssid);
    display.setCursor(0, 29);
    display.print("RSSI: "); display.print(rssi); display.print(" dBm");
    drawWifiIcon(105, 23, rssi);
  } else {
    display.setCursor(0, 20); display.println("WiFi: Disconnected");
  }

  // -- Row 4 (y=38): IP address
  display.setCursor(0, 38);
  display.print("IP: ");
  display.println(isWiFiConnected ? WiFi.localIP().toString() : "--.--.--.--");

  // -- Row 5 (y=47): Scan count
  display.setCursor(0, 47);
  display.print("Scan: "); display.println(scanCount);

  // -- Separator 2 (y=55)
  display.drawLine(0, 55, 127, 55, SSD1306_WHITE);

  // -- Row 6 (y=57): Ready status
  display.setCursor(0, 57); display.println("Ready");

  display.display();
}

// Tampil barcode hasil scan
void oledShowBarcode(String barcode, String itemName, bool sent) {
  if (!oledAvailable) return;
  display.clearDisplay();
  display.setTextSize(1);

  // -- ZONA KUNING (y=0..15) --
  display.setCursor(22, 0); display.println("** BARCODE SCAN **");
  // Tampilkan barcode di baris kuning ke-2 jika muat
  if (barcode.length() <= 21) {
    int cx = (128 - (int)barcode.length() * 6) / 2;
    if (cx < 0) cx = 0;
    display.setCursor(cx, 8); display.println(barcode);
  } else {
    display.setCursor(0, 8); display.println(barcode.substring(0, 21));
  }

  // -- ZONA BIRU (y=16..63) --
  // Jika barcode panjang, lanjutkan di biru atas
  if (barcode.length() > 21) {
    display.setCursor(0, 18); display.println(barcode.substring(21, 42));
  }

  // Nama item
  display.setCursor(0, 30);
  if (itemName.length() > 0) {
    String label = itemName;
    if (label.length() > 20) label = label.substring(0, 20);
    display.print("Item: "); display.println(label);
  } else {
    display.println("Item: Tidak ditemukan");
  }

  display.drawLine(0, 41, 127, 41, SSD1306_WHITE);

  display.setCursor(0, 45);
  display.println(isOnline ? "Firebase: TERKIRIM" : "Firebase: OFFLINE");

  display.setCursor(0, 55);
  display.println(sent ? "Sync: OK" : "Sync: GAGAL");

  display.display();
  lastBarcodeOnOled = millis();
}

// Tampil detail item ditemukan di inventory
void oledShowInventoryFound(String name, int qty, int minStock) {
  if (!oledAvailable) return;
  display.clearDisplay();
  display.setTextSize(1);

  // -- ZONA KUNING (y=0..15) --
  display.setCursor(14, 0); display.println("** ITEM DITEMUKAN **");
  if (name.length() > 21) name = name.substring(0, 21);
  display.setCursor(0, 8); display.println(name);

  // -- ZONA BIRU (y=16..63) --
  display.drawLine(0, 17, 127, 17, SSD1306_WHITE);

  display.setCursor(0, 20);
  display.print("Stok saat ini : "); display.println(qty);

  display.setCursor(0, 30);
  display.print("Stok minimum  : "); display.println(minStock);

  if (qty <= minStock) {
    display.drawLine(0, 42, 127, 42, SSD1306_WHITE);
    display.setCursor(14, 46); display.println("!! STOK MENIPIS !!");
    display.setCursor(0,  56); display.println("Segera lakukan restock");
  } else {
    display.setCursor(0, 44);
    display.println("Stok: Aman");
  }

  display.display();
  delay(2000);
}

// Proses koneksi WiFi
void oledShowWiFiConnecting(String ssid) {
  if (!oledAvailable) return;
  display.clearDisplay();
  display.setTextSize(1);

  // -- ZONA KUNING (y=0..15) --
  display.setCursor(16, 0); display.println("Connecting WiFi...");
  display.setCursor(40, 8); display.println(". . . . .");

  // -- ZONA BIRU (y=16..63) --
  display.drawLine(0, 17, 127, 17, SSD1306_WHITE);

  display.setCursor(0, 20); display.println("SSID:");
  String s = ssid;
  if (s.length() > 21) s = s.substring(0, 21);
  display.setCursor(0, 30); display.println(s);

  display.setCursor(20, 48); display.println("Mohon tunggu...");

  display.display();
}

// WiFi berhasil terhubung
void oledShowWiFiConnected(String ip) {
  if (!oledAvailable) return;
  display.clearDisplay();
  display.setTextSize(1);

  // -- ZONA KUNING (y=0..15) --
  display.setCursor(20, 0); display.println("WiFi CONNECTED!");
  display.setCursor(0,  8); display.print("IP: "); display.println(ip);

  // -- ZONA BIRU (y=16..63) --
  display.drawLine(0, 17, 127, 17, SSD1306_WHITE);

  String ssid = String(wifiConfig.ssid);
  if (ssid.length() > 17) ssid = ssid.substring(0, 17) + "..";
  display.setCursor(0, 20); display.print("SSID: "); display.println(ssid);
  display.setCursor(0, 30); display.println("Mode: INVENTORY");
  display.setCursor(0, 40); display.println("Firebase: SIAP");

  display.drawLine(0, 52, 127, 52, SSD1306_WHITE);
  display.setCursor(16, 56); display.println("Scanner aktif!");

  display.display();
  delay(2000);
}

// Tidak ada konfigurasi WiFi
void oledShowNoWiFi() {
  if (!oledAvailable) return;
  display.clearDisplay();
  display.setTextSize(1);

  // -- ZONA KUNING (y=0..15) --
  display.setCursor(22, 0); display.println("ESP32 SCANNER");
  display.setCursor(14, 8); display.println("No WiFi Config!");

  // -- ZONA BIRU (y=16..63) --
  display.drawLine(0, 17, 127, 17, SSD1306_WHITE);

  display.setCursor(0, 20); display.println("Scan QR WiFi untuk");
  display.setCursor(0, 30); display.println("konfigurasi jaringan.");
  display.setCursor(0, 42); display.println("Format QR:");
  display.setCursor(0, 52); display.println("WIFI:S:X;T:WPA;P:X;;");

  display.display();
}

void oledUpdateIdle() {
  if (!oledAvailable) return;
  if (millis() - lastBarcodeOnOled < OLED_BARCODE_HOLD_MS) return;
  if (millis() - lastOledRefresh   < 3000) return;
  lastOledRefresh = millis();
  oledShowStatus();
}


// =============================================================================
//  EEPROM FUNCTIONS
// =============================================================================
void saveWiFiConfig() {
  wifiConfig.checksum = 0;
  wifiConfig.checksum = calculateChecksum(&wifiConfig, sizeof(wifiConfig));
  EEPROM.put(WIFI_CONFIG_ADDR, wifiConfig);
  EEPROM.commit();
  Serial.println("WiFi config saved");
}

void loadWiFiConfig() {
  EEPROM.get(WIFI_CONFIG_ADDR, wifiConfig);
  uint32_t stored = wifiConfig.checksum;
  wifiConfig.checksum = 0;
  uint32_t calc = calculateChecksum(&wifiConfig, sizeof(wifiConfig));
  wifiConfig.checksum = stored;
  if (stored == calc && wifiConfig.isValid && strlen(wifiConfig.ssid) > 0) {
    Serial.printf("WiFi config loaded: %s\n", wifiConfig.ssid);
  } else {
    Serial.println("WiFi config tidak valid, reset");
    memset(&wifiConfig, 0, sizeof(wifiConfig));
    wifiConfig.isValid = false;
  }
}

void saveDeviceConfig() {
  deviceConfig.version      = 1;
  memset(deviceConfig.padding, 0, sizeof(deviceConfig.padding));
  deviceConfig.isConfigured = true;
  deviceConfig.checksum     = 0;
  deviceConfig.checksum     = calculateChecksum(&deviceConfig, sizeof(deviceConfig));
  EEPROM.put(DEVICE_CONFIG_ADDR, deviceConfig);
  bool ok = EEPROM.commit();
  Serial.println(ok ? "Device config saved" : "EEPROM commit failed");
}

void loadDeviceConfig() {
  memset(&deviceConfig, 0, sizeof(deviceConfig));
  EEPROM.get(DEVICE_CONFIG_ADDR, deviceConfig);
  uint32_t stored = deviceConfig.checksum;
  deviceConfig.checksum = 0;
  uint32_t calc = calculateChecksum(&deviceConfig, sizeof(deviceConfig));
  deviceConfig.checksum = stored;

  if (stored == calc && deviceConfig.isConfigured) {
    Serial.printf("Device config loaded: %s\n", deviceConfig.deviceId);
  } else {
    Serial.println("Device config tidak valid, pakai default");
    memset(&deviceConfig, 0, sizeof(deviceConfig));
    String defId = "ESP32-" + String((uint32_t)ESP.getEfuseMac(), HEX);
    strncpy(deviceConfig.deviceId,    defId.c_str(), sizeof(deviceConfig.deviceId)    - 1);
    strncpy(deviceConfig.serverUrl,   "https://stokmanager.vercel.app/",
                                                      sizeof(deviceConfig.serverUrl)   - 1);
    strncpy(deviceConfig.firebaseUrl,
      "https://barcodescanesp32-default-rtdb.asia-southeast1.firebasedatabase.app",
                                                      sizeof(deviceConfig.firebaseUrl) - 1);
    strncpy(deviceConfig.apiKey,      "",             sizeof(deviceConfig.apiKey)      - 1);
    deviceConfig.version      = 1;
    deviceConfig.isConfigured = true;
    memset(deviceConfig.padding, 0, sizeof(deviceConfig.padding));
    saveDeviceConfig();
  }
}


// =============================================================================
//  WIFI FUNCTIONS
// =============================================================================
bool parseWiFiQR(String qrData, String &ssid, String &password, String &security) {
  if (!qrData.startsWith("WIFI:")) return false;
  qrData = qrData.substring(5);
  int sI = qrData.indexOf("S:"), tI = qrData.indexOf("T:"), pI = qrData.indexOf("P:");
  if (sI == -1) return false;
  int sE = qrData.indexOf(";", sI); if (sE == -1) sE = qrData.length();
  ssid = qrData.substring(sI + 2, sE);
  if (tI != -1) { int tE = qrData.indexOf(";", tI); if (tE == -1) tE = qrData.length(); security = qrData.substring(tI+2, tE); } else security = "WPA";
  if (pI != -1) { int pE = qrData.indexOf(";", pI); if (pE == -1) pE = qrData.length(); password = qrData.substring(pI+2, pE); } else password = "";
  return true;
}

bool connectToWiFi() {
  if (!wifiConfig.isValid || strlen(wifiConfig.ssid) == 0) return false;
  Serial.printf("Connecting WiFi: %s\n", wifiConfig.ssid);
  oledShowWiFiConnecting(String(wifiConfig.ssid));
  WiFi.disconnect(true); delay(100);  // quick flush, tidak perlu 1000ms
  WiFi.begin(wifiConfig.ssid, wifiConfig.password);
  int att = 0;
  while (WiFi.status() != WL_CONNECTED && att < 20) { delay(500); Serial.print("."); att++; }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("\nWiFi OK: %s\n", WiFi.localIP().toString().c_str());
    isWiFiConnected = true; isOnline = true;
    configTime(7 * 3600, 0, "pool.ntp.org");
    oledShowWiFiConnected(WiFi.localIP().toString());
    return true;
  }
  Serial.println("\nWiFi gagal");
  isWiFiConnected = false; isOnline = false;
  oledShowNoWiFi();
  return false;
}

void checkWiFiConnection() {
  if (millis() - lastWiFiCheck < 10000) return;
  lastWiFiCheck = millis();
  if (WiFi.status() != WL_CONNECTED) {
    if (isWiFiConnected) {
      Serial.println("WiFi putus, reconnecting...");
      isWiFiConnected = false; isOnline = false;
      setDeviceOffline();
      if (wifiConfig.isValid) {
        oledShowWiFiConnecting(String(wifiConfig.ssid));
        WiFi.reconnect(); delay(5000);
        if (WiFi.status() == WL_CONNECTED) {
          Serial.println("WiFi reconnected");
          isWiFiConnected = true; isOnline = true;
          oledShowWiFiConnected(WiFi.localIP().toString());
          if (!isServerStarted) startWebServer();
          lastHeartbeat = 0;
        }
      }
    }
  } else {
    if (!isWiFiConnected) { isWiFiConnected = true; isOnline = true; lastHeartbeat = 0; }
  }
}


// =============================================================================
//  FIREBASE FUNCTIONS
// =============================================================================

// 1. Kirim scan ke /scans
bool sendScanToFirebase(String barcode) {
  if (!isWiFiConnected || strlen(deviceConfig.firebaseUrl) == 0) {
    Serial.println("Tidak bisa kirim scan: no WiFi/URL");
    return false;
  }
  HTTPClient http;
  String url = String(deviceConfig.firebaseUrl) + "/scans.json";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(10000);

  DynamicJsonDocument doc(512);
  doc["barcode"]   = barcode;
  doc["deviceId"]  = deviceConfig.deviceId;
  doc["location"]  = "Warehouse-Scanner";
  doc["mode"]      = "inventory";
  doc["processed"] = false;
  doc["type"]      = "inventory_scan";
  JsonObject ts    = doc.createNestedObject("timestamp");
  ts[".sv"]        = "timestamp";

  String json; serializeJson(doc, json);
  Serial.println("POST /scans: " + json);

  int code = http.POST(json);
  bool ok  = (code > 0);
  if (ok) {
    DynamicJsonDocument res(256); deserializeJson(res, http.getString());
    Serial.println("Scan ID: " + res["name"].as<String>());
  } else {
    Serial.printf("/scans HTTP error: %d\n", code);
  }
  http.end();
  return ok;
}

// 2. Lookup item di /inventory berdasarkan barcode
InventoryItem lookupInventoryByBarcode(String barcode) {
  InventoryItem item;
  item.found = false;
  if (!isWiFiConnected || strlen(deviceConfig.firebaseUrl) == 0) return item;

  HTTPClient http;
  String url = String(deviceConfig.firebaseUrl) +
               "/inventory.json?orderBy=\"barcode\"&equalTo=\"" + barcode + "\"";
  http.begin(url);
  http.setTimeout(8000);
  int code = http.GET();

  if (code == 200) {
    String body = http.getString();
    Serial.println("Inventory lookup: " + body);
    DynamicJsonDocument doc(2048);
    DeserializationError err = deserializeJson(doc, body);
    if (!err && !doc.isNull() && doc.as<JsonObject>().size() > 0) {
      for (JsonPair kv : doc.as<JsonObject>()) {
        JsonObject obj = kv.value().as<JsonObject>();
        if (obj.containsKey("deleted") && obj["deleted"].as<bool>()) continue;
        item.id       = kv.key().c_str();
        item.name     = obj["name"].as<String>();
        item.barcode  = obj["barcode"].as<String>();
        item.category = obj["category"].as<String>();
        item.location = obj["location"].as<String>();
        item.supplier = obj["supplier"].as<String>();
        item.quantity = obj["quantity"].as<int>();
        item.minStock = obj["minStock"].as<int>();
        item.price    = obj["price"].as<float>();
        item.found    = true;
        Serial.printf("Item: %s | Qty: %d | MinStock: %d\n",
                      item.name.c_str(), item.quantity, item.minStock);
        break;
      }
    } else {
      Serial.println("Barcode tidak ada di inventory");
    }
  } else {
    Serial.printf("Inventory lookup error: %d\n", code);
  }
  http.end();
  return item;
}

// 4. Update /analytics

// 5. Set device offline
void setDeviceOffline() {
  if (!isWiFiConnected || strlen(deviceConfig.firebaseUrl) == 0) return;
  HTTPClient http;
  String url = String(deviceConfig.firebaseUrl) + "/devices/" +
               String(deviceConfig.deviceId) + "/status.json";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.PUT("\"offline\"");
  http.end();
}

// 6. Heartbeat ke /devices/{deviceId}
bool sendHeartbeatToFirebase() {
  if (!isWiFiConnected || strlen(deviceConfig.firebaseUrl) == 0) {
    Serial.println("Heartbeat: no WiFi/URL");
    return false;
  }
  HTTPClient http;
  String url = String(deviceConfig.firebaseUrl) + "/devices/" +
               String(deviceConfig.deviceId) + ".json";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(5000);

  DynamicJsonDocument doc(512);
  doc["status"]        = "online";
  doc["ipAddress"]     = WiFi.localIP().toString();
  doc["uptime"]        = (millis() - bootTime) / 1000;
  doc["freeHeap"]      = ESP.getFreeHeap();
  doc["batteryLevel"]  = readBatteryLevel();
  doc["scanCount"]     = scanCount;
  doc["rssi"]          = WiFi.RSSI();
  doc["version"]       = FIRMWARE_VERSION;
  doc["lastHeartbeat"] = millis();
  doc["currentMode"]   = "inventory";
  JsonObject ls        = doc.createNestedObject("lastSeen");
  ls[".sv"]            = "timestamp";

  String json; serializeJson(doc, json);
  Serial.println("PUT /devices/" + String(deviceConfig.deviceId));

  int code = http.PUT(json);
  bool ok  = (code > 0);
  if (ok) { isOnline = true; Serial.printf("Heartbeat OK (HTTP %d)\n", code); }
  else    { isOnline = false; Serial.printf("Heartbeat gagal (%d)\n", code); checkWiFiConnection(); }
  http.end();
  return ok;
}


// =============================================================================
//  BARCODE PROCESSING
// =============================================================================
void processInventoryBarcode(String barcode) {
  Serial.println("Inventory barcode: " + barcode);

  // POST ke /scans dulu agar website popup muncul cepat
  bool sent = sendScanToFirebase(barcode);

  ScanData sd;
  sd.barcode        = barcode;
  sd.timestamp      = String(millis());
  sd.deviceId       = deviceConfig.deviceId;
  sd.processed      = false;
  sd.sentToFirebase = sent;
  scanHistory.push_back(sd);
  if (scanHistory.size() > 20) scanHistory.erase(scanHistory.begin());

  // Lookup inventory setelah scan terkirim (untuk OLED display)
  InventoryItem item = lookupInventoryByBarcode(barcode);
  if (item.found) {
    Serial.printf("Item: %s | Qty: %d | MinStock: %d\n",
                  item.name.c_str(), item.quantity, item.minStock);
    oledShowInventoryFound(item.name, item.quantity, item.minStock);
  } else {
    oledShowBarcode(barcode, "", sent);
  }
}

void processBarcodeInput(String input) {
  input.trim();
  if (input.length() == 0) return;
  Serial.println("Input: " + input);

  if (input.startsWith("WIFI:")) {
    String ssid, pass, sec;
    if (parseWiFiQR(input, ssid, pass, sec)) {
      strncpy(wifiConfig.ssid,     ssid.c_str(), sizeof(wifiConfig.ssid)    - 1);
      strncpy(wifiConfig.password, pass.c_str(), sizeof(wifiConfig.password)- 1);
      wifiConfig.isValid = true;
      saveWiFiConfig();
      if (connectToWiFi()) startWebServer();
    }
    return;
  }

  lastBarcode  = input;
  lastScanTime = millis();
  scanCount++;
  processInventoryBarcode(input);
}


// =============================================================================
//  WEB SERVER
// =============================================================================
void startWebServer() {
  if (isServerStarted || !isWiFiConnected) return;
  server = new WebServer(80);
  server->on("/",            HTTP_GET,     handleRoot);
  server->on("/api/status",  HTTP_GET,     handleApiStatus);
  server->on("/api/scan",    HTTP_GET,     handleApiScan);
  server->on("/api/history", HTTP_GET,     handleApiHistory);
  server->on("/api/config",  HTTP_POST,    handleApiConfig);
  server->on("/reset",       HTTP_POST,    handleReset);
  server->on("/api/status",  HTTP_OPTIONS, handleOptions);
  server->on("/api/scan",    HTTP_OPTIONS, handleOptions);
  server->on("/api/history", HTTP_OPTIONS, handleOptions);
  server->on("/api/config",  HTTP_OPTIONS, handleOptions);
  server->begin();
  isServerStarted = true;
  Serial.println("Web server started: http://" + WiFi.localIP().toString());
}

void handleRoot() {
  if (!server) return;
  String html = R"rawliteral(
<!DOCTYPE html><html><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ESP32 Scanner v6.0</title>
<style>
  body{font-family:Segoe UI,sans-serif;background:linear-gradient(135deg,#1a1a2e,#16213e,#0f3460);color:#eee;margin:0;padding:20px;min-height:100vh}
  .card{background:rgba(255,255,255,.08);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,.15);border-radius:16px;padding:20px;margin:12px 0}
  h1{text-align:center;margin-bottom:4px;font-size:1.4em}
  .badge{display:inline-block;padding:3px 10px;border-radius:20px;font-size:.75em;font-weight:bold;margin-left:8px}
  .online{background:#22c55e33;color:#4ade80;border:1px solid #4ade8055}
  .offline{background:#ef444433;color:#f87171;border:1px solid #f8717155}
  label{display:block;margin-bottom:4px;font-size:.85em;color:#94a3b8}
  input{width:100%;padding:8px;border:1px solid rgba(255,255,255,.2);border-radius:8px;background:rgba(255,255,255,.05);color:#eee;font-size:.9em;margin-bottom:10px;box-sizing:border-box}
  button,a.btn{background:rgba(99,102,241,.4);border:1px solid rgba(99,102,241,.6);color:#eee;padding:9px 16px;border-radius:8px;cursor:pointer;margin:4px;font-size:.85em;text-decoration:none;display:inline-block}
  button:hover,a.btn:hover{background:rgba(99,102,241,.6)}
  .barcode{font-family:monospace;font-size:1.3em;font-weight:bold;background:rgba(0,0,0,.4);padding:14px;border-radius:10px;text-align:center;word-break:break-all;min-height:48px}
  table{width:100%;border-collapse:collapse;font-size:.8em}
  th,td{padding:6px 8px;text-align:left;border-bottom:1px solid rgba(255,255,255,.1)}
  th{color:#94a3b8}
  .stat{display:inline-block;background:rgba(255,255,255,.06);border-radius:10px;padding:10px 16px;margin:4px;text-align:center}
  .stat-n{font-size:1.6em;font-weight:bold;color:#60a5fa}
  .stat-l{font-size:.75em;color:#94a3b8}
</style></head><body>
<h1>ESP32 Scanner <span class="badge )rawliteral";
  html += isOnline ? "online\">ONLINE" : "offline\">OFFLINE";
  html += R"rawliteral(</span></h1>
<p style="text-align:center;color:#94a3b8;font-size:.8em">v6.0 - Inventory Mode - )rawliteral";
  html += String(deviceConfig.deviceId);
  html += R"rawliteral(</p>

<div class="card">
  <div>
    <div class="stat"><div class="stat-n" id="sc">)rawliteral" + String(scanCount) + R"rawliteral(</div><div class="stat-l">Total Scans</div></div>
    <div class="stat"><div class="stat-n">)rawliteral" + String(WiFi.RSSI()) + R"rawliteral( dBm</div><div class="stat-l">WiFi RSSI</div></div>
    <div class="stat"><div class="stat-n">)rawliteral" + String(ESP.getFreeHeap()/1024) + R"rawliteral( KB</div><div class="stat-l">Free Heap</div></div>
    <div class="stat"><div class="stat-n">)rawliteral" + String((millis()-bootTime)/1000) + R"rawliteral(s</div><div class="stat-l">Uptime</div></div>
  </div>
</div>

<div class="card">
  <label>Barcode Terakhir</label>
  <div class="barcode" id="bc">)rawliteral";
  html += lastBarcode.length() > 0 ? lastBarcode : "Belum ada scan";
  html += R"rawliteral(</div>
  <div style="margin-top:8px;font-size:.8em;color:#94a3b8">
    WiFi: )rawliteral" + String(wifiConfig.ssid) + " | IP: " + WiFi.localIP().toString() + R"rawliteral(
  </div>
</div>

<div class="card">
  <label>Konfigurasi Firebase</label>
  <label>Database URL</label>
  <input id="fbUrl" value=")rawliteral" + String(deviceConfig.firebaseUrl) + R"rawliteral(">
  <label>Server URL (Backup)</label>
  <input id="srvUrl" value=")rawliteral" + String(deviceConfig.serverUrl) + R"rawliteral(">
  <label>API Key (opsional)</label>
  <input type="password" id="apiKey" value=")rawliteral" + String(deviceConfig.apiKey) + R"rawliteral(">
  <button onclick="saveConfig()">Simpan Konfigurasi</button>
</div>

<div class="card">
  <a class="btn" href="/api/status">Status JSON</a>
  <a class="btn" href="/api/history">History</a>
  <button onclick="testScan()">Test Scan</button>
</div>

<script>
function saveConfig(){
  fetch('/api/config',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
      firebaseUrl:document.getElementById('fbUrl').value,
      serverUrl:document.getElementById('srvUrl').value,
      apiKey:document.getElementById('apiKey').value
    })}).then(r=>r.json()).then(d=>alert(d.message));
}
function testScan(){
  var bc=prompt('Masukkan barcode test:','8991906106250');
  if(!bc)return;
  fetch('/api/scan?test='+encodeURIComponent(bc))
    .then(r=>r.json()).then(d=>alert(JSON.stringify(d,null,2)));
}
setInterval(function(){
  fetch('/api/scan').then(r=>r.json()).then(d=>{
    if(d.barcode) document.getElementById('bc').textContent=d.barcode;
    document.getElementById('sc').textContent=d.scanCount||'--';
  });
},5000);
</script></body></html>)rawliteral";
  server->sendHeader("Access-Control-Allow-Origin","*");
  server->send(200,"text/html",html);
}

void handleApiStatus() {
  if (!server) return;
  DynamicJsonDocument doc(1024);
  doc["deviceId"]      = deviceConfig.deviceId;
  doc["version"]       = FIRMWARE_VERSION;
  doc["wifiConnected"] = isWiFiConnected;
  doc["isOnline"]      = isOnline;
  doc["ssid"]          = wifiConfig.ssid;
  doc["ipAddress"]     = WiFi.localIP().toString();
  doc["rssi"]          = WiFi.RSSI();
  doc["lastBarcode"]   = lastBarcode;
  doc["firebaseUrl"]   = deviceConfig.firebaseUrl;
  doc["uptime"]        = (millis() - bootTime) / 1000;
  doc["freeHeap"]      = ESP.getFreeHeap();
  doc["scanCount"]     = scanCount;
  doc["currentMode"]   = "inventory";
  doc["lastHeartbeat"] = (millis() - lastHeartbeat) / 1000;
  String res; serializeJson(doc, res);
  server->sendHeader("Access-Control-Allow-Origin","*");
  server->send(200,"application/json",res);
}

void handleApiScan() {
  if (!server) return;
  if (server->hasArg("test")) processBarcodeInput(server->arg("test"));
  DynamicJsonDocument doc(512);
  doc["status"]      = lastBarcode.length() > 0 ? "success" : "no_scan";
  doc["barcode"]     = lastBarcode;
  doc["scanCount"]   = scanCount;
  doc["currentMode"] = "inventory";
  doc["isOnline"]    = isOnline;
  String res; serializeJson(doc, res);
  server->sendHeader("Access-Control-Allow-Origin","*");
  server->send(200,"application/json",res);
}

void handleApiHistory() {
  if (!server) return;
  DynamicJsonDocument doc(2048);
  JsonArray arr = doc.createNestedArray("scans");
  for (const auto& s : scanHistory) {
    JsonObject o        = arr.createNestedObject();
    o["barcode"]        = s.barcode;
    o["timestamp"]      = s.timestamp;
    o["deviceId"]       = s.deviceId;
    o["processed"]      = s.processed;
    o["sentToFirebase"] = s.sentToFirebase;
    o["mode"]           = "inventory";
    o["type"]           = "inventory_scan";
  }
  doc["total"]    = scanHistory.size();
  doc["deviceId"] = deviceConfig.deviceId;
  String res; serializeJson(doc, res);
  server->sendHeader("Access-Control-Allow-Origin","*");
  server->send(200,"application/json",res);
}

void handleApiConfig() {
  if (!server) return;
  server->sendHeader("Access-Control-Allow-Origin","*");
  if (server->hasArg("plain")) {
    DynamicJsonDocument doc(1024);
    deserializeJson(doc, server->arg("plain"));
    if (doc.containsKey("firebaseUrl")) strncpy(deviceConfig.firebaseUrl, doc["firebaseUrl"], sizeof(deviceConfig.firebaseUrl)-1);
    if (doc.containsKey("serverUrl"))   strncpy(deviceConfig.serverUrl,   doc["serverUrl"],   sizeof(deviceConfig.serverUrl)  -1);
    if (doc.containsKey("apiKey"))      strncpy(deviceConfig.apiKey,      doc["apiKey"],      sizeof(deviceConfig.apiKey)     -1);
    saveDeviceConfig();
    server->send(200,"application/json","{\"status\":\"success\",\"message\":\"Konfigurasi disimpan\"}");
  } else {
    server->send(400,"application/json","{\"error\":\"No data\"}");
  }
}

void handleReset() {
  if (!server) return;
  server->send(200,"text/plain","Resetting...");
  memset(&wifiConfig,   0, sizeof(wifiConfig));
  memset(&deviceConfig, 0, sizeof(deviceConfig));
  wifiConfig.isValid = false; deviceConfig.isConfigured = false;
  EEPROM.put(WIFI_CONFIG_ADDR,   wifiConfig);
  EEPROM.put(DEVICE_CONFIG_ADDR, deviceConfig);
  EEPROM.commit();
  delay(1000);
  ESP.restart();
}

void handleOptions() {
  if (!server) return;
  server->sendHeader("Access-Control-Allow-Origin", "*");
  server->sendHeader("Access-Control-Allow-Methods","GET,POST,OPTIONS");
  server->sendHeader("Access-Control-Allow-Headers","Content-Type,Authorization");
  server->send(200,"text/plain","");
}


// =============================================================================
//  SETUP & LOOP
// =============================================================================
void setup() {
  Serial.begin(115200);
  Serial2.begin(9600, SERIAL_8N1, RXD2, TXD2);
  delay(100);  // minimal stabilize
  bootTime = millis();

  initOLED();
  oledShowBoot();
  delay(500);  // singkat, cukup baca "Initializing..."

  Serial.println("\nESP32 GM67 Scanner v6.0 - Inventory Only");
  Serial.println("=========================================");
  Serial.println("Firebase: barcodescanesp32");
  Serial.println("Paths: /scans /devices /inventory /analytics");
  Serial.println("OLED: " + String(oledAvailable ? "OK" : "NOT FOUND"));

  EEPROM.begin(EEPROM_SIZE);
  loadWiFiConfig();
  loadDeviceConfig();

  // Fast WiFi init — persistent=false cegah tulis flash, lebih cepat boot
  WiFi.persistent(false);
  WiFi.setAutoReconnect(true);
  WiFi.mode(WIFI_STA);

  if (wifiConfig.isValid) {
    if (connectToWiFi()) {
      startWebServer();
      Serial.println("Web: http://" + WiFi.localIP().toString());
    } else {
      oledShowNoWiFi();
    }
  } else {
    Serial.println("Scan QR WiFi: WIFI:S:SSID;T:WPA;P:PASS;H:false;;");
    oledShowNoWiFi();
  }

  lastHeartbeat   = millis();
  lastOledRefresh = millis();
  initBatteryADC();   // calibrate ADC using eFuse Vref
  sampleBattery();    // initial battery reading before first heartbeat
  Serial.println("Ready - Mode: INVENTORY");
}

void loop() {
  if (isServerStarted && server) server->handleClient();

  checkWiFiConnection();

  if (Serial2.available()) {
    String input = Serial2.readStringUntil('\n');
    processBarcodeInput(input);
  }

  if (Serial.available()) {
    String input = Serial.readStringUntil('\n');
    Serial.println("Test: " + input);
    processBarcodeInput(input);
  }

  if (millis() - lastHeartbeat > 8000) {
    sampleBattery();  // read ADC BEFORE WiFi HTTP to avoid voltage sag noise
    if (isWiFiConnected) sendHeartbeatToFirebase();
    lastHeartbeat = millis();
  }

  oledUpdateIdle();
  delay(100);
}
