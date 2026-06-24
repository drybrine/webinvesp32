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
#include <Preferences.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <Update.h>
#include <ArduinoJson.h>
#include <time.h>
#include <esp_adc_cal.h>
#include <driver/adc.h>
#include <esp_ota_ops.h>
#include "mbedtls/pk.h"
#include "mbedtls/sha256.h"
#include "mbedtls/base64.h"

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
#define FIRMWARE_VERSION   "6.5.1"
#define AUTH_REFRESH_MARGIN_MS 300000UL
#define AUTH_MAX_BACKOFF_MS     60000UL
#define FIREBASE_DATABASE_URL "https://barcodescanesp32-default-rtdb.asia-southeast1.firebasedatabase.app"
#define FIREBASE_WEB_API_KEY  "AIzaSyBDMTHkz_BwbqKfkVQYvKEI3yfrOLa_jLY"
#define PROVISIONING_PREFIX   "ESP32PROV:"

// --- OTA (over-the-air firmware update) --------------------------------------
#define OTA_MIN_BATTERY_PCT     30      // do not flash below this charge
#define OTA_IDLE_REQUIRED_MS    10000UL // require this long since last scan
#define OTA_MAX_RETRIES         3       // attempts per commandId before giving up
#define OTA_BOOT_VALIDATE_MS    20000UL // confirm heartbeat OK within this window post-update

// ECDSA P-256 public key (PEM/SPKI) matching OTA_SIGNING_PRIVATE_KEY in CI.
// The private key never leaves the GitHub secret; only this public half ships.
// Replace this placeholder with the real public key before deploying OTA.
static const char OTA_PUBLIC_KEY_PEM[] = R"PEM(-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAESfNSHy9GKbRYMLwbN0PpUco70un0
ZJfN84aY52ZkOOxZG8Yq6GBQadq269UEtQXPvwZXT/ZjZFqORuqBifgmWg==
-----END PUBLIC KEY-----)PEM";

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
  // price removed in v6.2 (price-free schema)
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
Preferences authPreferences;

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
bool          authRejected    = false;
String        firebaseIdToken = "";
String        firebaseRefreshToken = "";
unsigned long firebaseTokenExpiresAt = 0;
unsigned long nextAuthRetryAt = 0;
uint8_t       authRetryCount = 0;
String        provisioningPin = "";
uint8_t       provisioningFailures = 0;
unsigned long provisioningLockedUntil = 0;
String        lastFirebaseScanId = "";
String        pendingLookupScanId = "";
String        pendingLookupBarcode = "";
unsigned long pendingLookupDeadline = 0;
unsigned long lastLookupPoll = 0;
String        activeScanMode = "Manual";       // dari web: "Manual", "Auto IN", "Auto OUT"
#define LOOKUP_POLL_INTERVAL_MS 1000UL
#define LOOKUP_TIMEOUT_MS       10000UL

// --- SSE Stream for scanMode -------------------------------------------------
WiFiClientSecure sseClient;
HTTPClient       sseHttp;
WiFiClient*      sseStream = nullptr;
bool             sseConnected = false;
unsigned long    lastSseConnectAttempt = 0;
String           sseTokenUsed = "";
// -----------------------------------------------------------------------------

// --- OTA state ---------------------------------------------------------------
unsigned long lastOtaCheck       = 0;
String        otaActiveCommandId = "";   // commandId currently being attempted
String        otaLastFailedId    = "";   // commandId that exhausted retries
uint8_t       otaRetryCount      = 0;
bool          otaInProgress      = false;
Preferences   otaPreferences;
#define OTA_CHECK_INTERVAL_MS 8000UL

std::vector<ScanData> scanHistory;

// --- Function Declarations ---------------------------------------------------
void          handleRoot();
void          handleApiStatus();
void          handleApiScan();
void          handleReset();
void          startWebServer();
void          processBarcodeInput(String input);
void          processProvisioningBarcode(String input);
void          processInventoryBarcode(String barcode);
void          checkDeviceLookupStatus();
void          startScanModeStream();
void          stopScanModeStream();
void          handleScanModeStream();
bool          connectToWiFi();
bool          sendScanToFirebase(String barcode);
bool          sendHeartbeatToFirebase();
bool          signInDevice(String email, String password);
bool          refreshFirebaseToken(bool force = false);
bool          ensureFirebaseAuth();
String        firebaseUrlWithAuth(String pathAndQuery);
String        urlEncode(String value);
void          loadFirebaseRefreshToken();
void          clearFirebaseAuth();
InventoryItem lookupInventoryByBarcode(String barcode);
bool          parseWiFiQR(String qrData, String &ssid, String &password, String &security);
void          saveWiFiConfig();
void          loadWiFiConfig();
void          saveDeviceConfig();
void          loadDeviceConfig();
void          checkWiFiConnection();
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
void          oledShowProductLookupSearching(String barcode);
void          oledShowProductLookupFound(String name, String category);
void          oledShowProductLookupNotFound(String barcode, String message);
void          oledShowWiFiConnecting(String ssid);
void          oledShowWiFiConnected(String ip);
void          oledShowNoWiFi();
void          oledShowAuthError();
void          oledShowProvisioningPin();
void          oledShowProvisioningSuccess();
bool          isDeviceProvisioned();
void          oledUpdateIdle();
// --- OTA ---------------------------------------------------------------------
void          checkForOtaCommand();
bool          performOtaUpdate(const String& commandId, const String& binaryUrl,
                               const String& sha256Hex, const String& signatureB64,
                               size_t expectedSize, const String& version);
bool          verifyOtaSignature(const uint8_t* hash, const uint8_t* signature, size_t sigLen);
void          reportOtaStatus(const char* phase, const String& version, int progress, const String& message);
bool          otaPreconditionsMet();
void          validateOtaBootSuccess(bool heartbeatOk);
void          oledShowOtaProgress(const String& version, const char* phase, int progress);
// -----------------------------------------------------------------------------


// =============================================================================
//  BATTERY LEVEL (esp_adc_cal calibrated)
// =============================================================================
float batteryEma = -1.0f;       // persistent EMA state (-1 = uninitialized)
int   lastReportedBattery = -1; // hysteresis: last sent value
int   cachedBatteryLevel  = -1; // pre-sampled before WiFi activity
esp_adc_cal_characteristics_t adcCal;  // ADC calibration characteristics
bool  adcCalibrated = false;

// Menginisialisasi ADC baterai dengan resolusi 12-bit dan attenuasi yang sesuai.
// Kalibrasi memakai eFuse Vref/Two Point bila tersedia agar pembacaan mV lebih akurat.
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

// Mengambil sampel tegangan baterai dari ADC, menghitung persentase, lalu menyimpannya
// ke cache. Fungsi ini dipanggil sebelum aktivitas WiFi/HTTP untuk mengurangi noise sag.
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

// Mengembalikan level baterai terakhir dari cache.
// Aman dipanggil saat WiFi aktif karena tidak langsung membaca ADC kecuali cache kosong.
int readBatteryLevel() {
  if (cachedBatteryLevel < 0) sampleBattery(); // fallback if never sampled
  return cachedBatteryLevel;
}


// =============================================================================
//  CHECKSUM
// =============================================================================
// Menghitung checksum CRC32 sederhana untuk validasi data konfigurasi di EEPROM.
// Checksum dibuat saat menyimpan dan diverifikasi saat konfigurasi dimuat kembali.
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
// Menginisialisasi komunikasi I2C dan modul OLED SSD1306.
// Jika OLED tidak terdeteksi, flag oledAvailable dibuat false agar fungsi display dilewati.
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

// Menampilkan layar pembuka saat ESP32 baru menyala.
// Informasi ini memberi tanda bahwa firmware dan OLED sudah mulai berjalan.
void oledShowBoot() {
  if (!oledAvailable) return;
  display.clearDisplay();
  display.setTextSize(1);

  // -- ZONA KUNING (y=0..15) --
  display.setCursor(16, 0); display.print("ESP32 SCANNER v"); display.println(FIRMWARE_VERSION);
  display.setCursor(22, 8); display.println("GM67 Barcode Scanner");

  // -- ZONA BIRU (y=16..63) --
  display.setCursor(0, 18); display.println("Firebase Realtime DB");
  display.setCursor(0, 28); display.println("Inventory Mode Only");
  display.setCursor(0, 38); display.println("OLED: Yellow-Blue");
  display.drawLine(0, 50, 127, 50, SSD1306_WHITE);
  display.setCursor(26, 54); display.println("Initializing...");

  display.display();
}

// Menggambar ikon baterai berukuran kecil pada koordinat (x, y).
// Jumlah bar di dalam ikon disesuaikan dengan persentase baterai.
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

// Menggambar ikon sinyal WiFi pada koordinat (x, y).
// Kekuatan sinyal dihitung dari RSSI dan ditampilkan sebagai 0 sampai 4 bar.
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

// Menampilkan status idle scanner di OLED: online/offline, baterai, WiFi, IP, dan jumlah scan.
// Layar ini menjadi tampilan utama saat tidak ada barcode baru yang sedang ditahan.
void oledShowStatus() {
  if (!oledAvailable) return;
  display.clearDisplay();
  display.setTextSize(1);

  int batLvl = readBatteryLevel();

  // -- Row 1 (y=0): Title + Battery icon
  display.setCursor(0, 0); display.print("SCANNER v"); display.print(FIRMWARE_VERSION);
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

  // -- Row 6 (y=57): Scan mode status
  display.setCursor(0, 57); display.print("Mode: ");
  if (activeScanMode.length() > 0) display.print(activeScanMode);
  else display.print("Manual");

  display.display();
}

// Menampilkan hasil scan barcode pada OLED.
// Parameter sent dipakai untuk menandai apakah data berhasil dikirim ke Firebase.
void oledShowBarcode(String barcode, String itemName, bool sent) {
  if (!oledAvailable) return;
  display.clearDisplay();
  display.setTextSize(1);

  // -- ZONA KUNING (y=0..15) --
  display.setCursor(19, 0); display.println("- BARCODE SCAN -");
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
  display.setCursor(0, 32);
  if (itemName.length() > 0) {
    String label = itemName;
    if (label.length() > 20) label = label.substring(0, 20);
    display.print("Item: "); display.println(label);
  } else {
    display.println("Item: Tidak ditemukan");
  }

  display.drawLine(0, 43, 127, 43, SSD1306_WHITE);

  display.setCursor(0, 47);
  display.println(isOnline ? "Firebase: TERKIRIM" : "Firebase: OFFLINE");

  display.setCursor(0, 57);
  display.println(sent ? "Sync: OK" : "Sync: GAGAL");

  display.display();
  lastBarcodeOnOled = millis();
}

// Menampilkan ringkasan item inventory yang ditemukan berdasarkan barcode.
// Jika stok kurang dari atau sama dengan minStock, OLED menampilkan peringatan stok menipis.
void oledShowInventoryFound(String name, int qty, int minStock) {
  if (!oledAvailable) return;
  display.clearDisplay();
  display.setTextSize(1);

  // -- ZONA KUNING (y=0..15) --
  display.setCursor(13, 0); display.println("- ITEM DITEMUKAN -");
  display.drawLine(0, 9, 127, 9, SSD1306_WHITE);
  if (name.length() > 21) name = name.substring(0, 21);
  display.setCursor(0, 12); display.println(name);

  // -- ZONA BIRU (y=16..63) --
  display.drawLine(0, 21, 127, 21, SSD1306_WHITE);

  display.setCursor(0, 24);
  display.print("Stok saat ini : "); display.println(qty);

  display.setCursor(0, 34);
  display.print("Stok minimum  : "); display.println(minStock);

  if (qty <= minStock) {
    display.drawLine(0, 46, 127, 46, SSD1306_WHITE);
    display.setCursor(13, 50); display.println("!! STOK MENIPIS !!");
    display.setCursor(0,  58); display.println("Segera lakukan restock");
  } else {
    display.setCursor(0, 48);
    display.println("Stok: Aman");
  }

  display.display();
  delay(2000);
}

void oledShowProductLookupSearching(String barcode) {
  if (!oledAvailable) return;
  display.clearDisplay();
  display.setTextSize(1);
  display.setCursor(20, 0); display.println("- DATA BARANG -");
  if (barcode.length() > 21) barcode = barcode.substring(0, 21);
  display.setCursor(0, 10); display.println(barcode);
  display.drawLine(0, 20, 127, 20, SSD1306_WHITE);
  display.setCursor(0, 26); display.println("Mencari data...");
  display.setCursor(0, 38); display.println("Honda Cengkareng");
  display.setCursor(0, 54); display.println("Mohon tunggu");
  display.display();
  lastBarcodeOnOled = millis();
}

void oledShowProductLookupFound(String name, String category) {
  if (!oledAvailable) return;
  display.clearDisplay();
  display.setTextSize(1);
  display.setCursor(12, 0); display.println("DATA DITEMUKAN");
  display.drawLine(0, 10, 127, 10, SSD1306_WHITE);
  if (name.length() > 21) name = name.substring(0, 21);
  display.setCursor(0, 18); display.println(name);
  if (category.length() > 21) category = category.substring(0, 21);
  display.setCursor(0, 32); display.println(category);
  display.setCursor(0, 48); display.println("Cek form di website");
  display.display();
  lastBarcodeOnOled = millis();
}

void oledShowProductLookupNotFound(String barcode, String message) {
  if (!oledAvailable) return;
  display.clearDisplay();
  display.setTextSize(1);
  display.setCursor(4, 0); display.println("DATA TIDAK DITEMUKAN");
  display.drawLine(0, 10, 127, 10, SSD1306_WHITE);
  if (barcode.length() > 21) barcode = barcode.substring(0, 21);
  display.setCursor(0, 18); display.println(barcode);
  if (message.length() == 0) message = "Isi manual di web";
  if (message.length() > 21) message = message.substring(0, 21);
  display.setCursor(0, 36); display.println(message);
  display.setCursor(0, 52); display.println("Tambah via popup");
  display.display();
  lastBarcodeOnOled = millis();
}

// Menampilkan layar proses koneksi WiFi.
// SSID dipotong agar tetap muat pada layar OLED 128x64.
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

// Menampilkan status WiFi berhasil terhubung, termasuk IP lokal dan mode scanner.
// Fungsi ini juga memberi jeda singkat agar pesan sukses sempat terbaca.
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

// Menampilkan instruksi konfigurasi saat belum ada WiFi tersimpan di EEPROM.
// Pengguna diminta scan QR WiFi dengan format standar WIFI:S:...;T:...;P:...;;.
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

// Menampilkan kegagalan autentikasi secara eksplisit. Scanner tetap menyimpan
// refresh token saja dan menunggu kredensial baru/rotasi dari administrator.
void oledShowAuthError() {
  if (!oledAvailable) return;
  display.clearDisplay();
  display.setTextSize(1);
  display.setCursor(10, 0); display.println("AUTHENTICATION ERROR");
  display.drawLine(0, 10, 127, 10, SSD1306_WHITE);
  display.setCursor(0, 18); display.println("Kredensial scanner");
  display.setCursor(0, 28); display.println("ditolak / dicabut.");
  display.setCursor(0, 42); display.println("Rotasi kredensial di");
  display.setCursor(0, 52); display.println("panel admin.");
  display.display();
  lastBarcodeOnOled = millis();
}

void oledShowProvisioningPin() {
  if (!oledAvailable) return;
  display.clearDisplay();
  display.setTextSize(1);
  display.setCursor(22, 0); display.println("PROVISIONING");
  display.drawLine(0, 10, 127, 10, SSD1306_WHITE);
  if (isWiFiConnected) {
    display.setCursor(0, 18); display.println(deviceConfig.deviceId);
    display.setCursor(0, 32); display.println("Daftar ID di admin,");
    display.setCursor(0, 42); display.println("lalu scan barcode.");
    display.setCursor(0, 56); display.print("PIN reset: "); display.println(provisioningPin);
  } else {
    display.setCursor(0, 22); display.println("Scan QR WiFi dahulu.");
    display.setCursor(0, 42); display.println(deviceConfig.deviceId);
  }
  display.display();
}

void oledShowProvisioningSuccess() {
  if (!oledAvailable) return;
  display.clearDisplay();
  display.setTextSize(1);
  display.setCursor(12, 0); display.println("PROVISIONING BERHASIL");
  display.drawLine(0, 10, 127, 10, SSD1306_WHITE);
  display.setCursor(0, 22); display.println(deviceConfig.deviceId);
  display.setCursor(0, 40); display.println("Firebase terhubung.");
  display.setCursor(0, 52); display.println("Scanner siap.");
  display.display();
  lastBarcodeOnOled = millis();
}

// Provisioning selesai setelah refresh token tersimpan. Kondisi authRejected adalah
// kesehatan sesi saat ini, bukan alasan untuk meminta provisioning ulang.
bool isDeviceProvisioned() {
  return firebaseRefreshToken.length() > 0;
}

// Memperbarui tampilan idle OLED secara berkala.
// Tampilan barcode terakhir ditahan beberapa detik agar hasil scan tidak langsung tertimpa.
void oledUpdateIdle() {
  if (!oledAvailable) return;
  if (millis() - lastBarcodeOnOled < OLED_BARCODE_HOLD_MS) return;
  if (millis() - lastOledRefresh   < 3000) return;
  lastOledRefresh = millis();
  // Selama belum diprovisikan, tahan PIN di layar agar admin tetap bisa membacanya
  // (jika tidak, koneksi WiFi & status idle akan menimpanya dan PIN tak terlihat lagi).
  if (!isDeviceProvisioned()) {
    oledShowProvisioningPin();
    return;
  }
  if (authRejected) {
    oledShowAuthError();
    return;
  }
  oledShowStatus();
}


// =============================================================================
//  EEPROM FUNCTIONS
// =============================================================================
// Menyimpan konfigurasi WiFi ke EEPROM setelah checksum diperbarui.
// Data ini dipakai saat boot berikutnya agar perangkat bisa reconnect otomatis.
void saveWiFiConfig() {
  wifiConfig.checksum = 0;
  wifiConfig.checksum = calculateChecksum(&wifiConfig, sizeof(wifiConfig));
  EEPROM.put(WIFI_CONFIG_ADDR, wifiConfig);
  EEPROM.commit();
  Serial.println("WiFi config saved");
}

// Memuat konfigurasi WiFi dari EEPROM dan memvalidasi checksum-nya.
// Jika data tidak valid, konfigurasi WiFi direset agar tidak memakai SSID/password rusak.
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

// Menyimpan identitas perangkat. Firebase memakai satu konfigurasi tetap firmware.
// Checksum memastikan data EEPROM yang dibaca nanti masih utuh.
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

// Memuat konfigurasi perangkat dari EEPROM.
// Jika belum valid, fungsi membuat konfigurasi default dan langsung menyimpannya.
void loadDeviceConfig() {
  memset(&deviceConfig, 0, sizeof(deviceConfig));
  EEPROM.get(DEVICE_CONFIG_ADDR, deviceConfig);
  uint32_t stored = deviceConfig.checksum;
  deviceConfig.checksum = 0;
  uint32_t calc = calculateChecksum(&deviceConfig, sizeof(deviceConfig));
  deviceConfig.checksum = stored;

  if (stored == calc && deviceConfig.isConfigured) {
    String normalizedId = String(deviceConfig.deviceId);
    normalizedId.toUpperCase();
    strncpy(deviceConfig.deviceId, normalizedId.c_str(), sizeof(deviceConfig.deviceId) - 1);
    Serial.printf("Device config loaded: %s\n", deviceConfig.deviceId);
  } else {
    Serial.println("Device config tidak valid, pakai default");
    memset(&deviceConfig, 0, sizeof(deviceConfig));
    char defId[24];
    snprintf(defId, sizeof(defId), "ESP32-%08lX", (unsigned long)((uint32_t)ESP.getEfuseMac()));
    strncpy(deviceConfig.deviceId, defId, sizeof(deviceConfig.deviceId) - 1);
    deviceConfig.version      = 1;
    deviceConfig.isConfigured = true;
    memset(deviceConfig.padding, 0, sizeof(deviceConfig.padding));
    saveDeviceConfig();
  }
}


// =============================================================================
//  WIFI FUNCTIONS
// =============================================================================
// Membaca QR WiFi dengan format standar WIFI:S:<ssid>;T:<security>;P:<password>;...
// Nilai SSID, password, dan security dikembalikan lewat parameter referensi.
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

// Menghubungkan ESP32 ke jaringan WiFi yang tersimpan.
// Jika berhasil, waktu NTP disetel dan status online/OLED diperbarui.
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

// Mengecek koneksi WiFi setiap 10 detik dan mencoba reconnect jika terputus.
// Saat koneksi putus, perangkat juga ditandai offline di Firebase bila memungkinkan.
void checkWiFiConnection() {
  if (millis() - lastWiFiCheck < 10000) return;
  lastWiFiCheck = millis();
  if (WiFi.status() != WL_CONNECTED) {
    if (isWiFiConnected) {
      Serial.println("WiFi putus, reconnecting...");
      isWiFiConnected = false; isOnline = false;
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

String urlEncode(String value) {
  String encoded = "";
  const char* hex = "0123456789ABCDEF";
  for (size_t i = 0; i < value.length(); i++) {
    char c = value.charAt(i);
    if (isalnum(c) || c == '-' || c == '_' || c == '.' || c == '~') {
      encoded += c;
    } else {
      encoded += '%';
      encoded += hex[(c >> 4) & 0x0F];
      encoded += hex[c & 0x0F];
    }
  }
  return encoded;
}

void loadFirebaseRefreshToken() {
  firebaseRefreshToken = authPreferences.getString("refreshToken", "");
  firebaseIdToken = "";
  firebaseTokenExpiresAt = 0;
  authRejected = false;
  Serial.println(firebaseRefreshToken.length() > 0 ?
    "Device auth refresh token loaded" :
    "Device auth belum diprovisikan");
}

void clearFirebaseAuth() {
  firebaseIdToken = "";
  firebaseRefreshToken = "";
  firebaseTokenExpiresAt = 0;
  authRejected = false;
  authRetryCount = 0;
  nextAuthRetryAt = 0;
  authPreferences.remove("refreshToken");
}

void scheduleAuthRetry() {
  authRetryCount = min<uint8_t>(authRetryCount + 1, 6);
  unsigned long delayMs = min<unsigned long>(1000UL << authRetryCount, AUTH_MAX_BACKOFF_MS);
  nextAuthRetryAt = millis() + delayMs;
  Serial.printf("Auth retry dijadwalkan dalam %lu ms\n", delayMs);
}

bool signInDevice(String email, String password) {
  if (!isWiFiConnected || email.length() == 0 || password.length() == 0) {
    password = "";
    return false;
  }

  HTTPClient http;
  String url = "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=" +
               String(FIREBASE_WEB_API_KEY);
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(10000);

  DynamicJsonDocument requestDoc(512);
  requestDoc["email"] = email;
  requestDoc["password"] = password;
  requestDoc["returnSecureToken"] = true;
  String body;
  serializeJson(requestDoc, body);
  password = "";

  int code = http.POST(body);
  body = "";
  if (code != 200) {
    Serial.printf("Device sign-in ditolak (HTTP %d)\n", code);
    http.end();
    authRejected = code == 400 || code == 401 || code == 403;
    scheduleAuthRetry();
    if (authRejected) oledShowAuthError();
    return false;
  }

  DynamicJsonDocument responseDoc(2048);
  DeserializationError error = deserializeJson(responseDoc, http.getString());
  http.end();
  if (error || !responseDoc["idToken"] || !responseDoc["refreshToken"]) {
    Serial.println("Respons sign-in tidak valid");
    scheduleAuthRetry();
    return false;
  }

  String previousIdToken = firebaseIdToken;
  String previousRefreshToken = firebaseRefreshToken;
  unsigned long previousExpiresAt = firebaseTokenExpiresAt;
  unsigned long previousRetryAt = nextAuthRetryAt;
  uint8_t previousRetryCount = authRetryCount;
  bool previousAuthRejected = authRejected;

  firebaseIdToken = responseDoc["idToken"].as<String>();
  firebaseRefreshToken = responseDoc["refreshToken"].as<String>();
  unsigned long expiresIn = responseDoc["expiresIn"].as<unsigned long>();
  firebaseTokenExpiresAt = millis() + expiresIn * 1000UL;
  authRejected = false;
  authRetryCount = 0;
  nextAuthRetryAt = 0;

  // Rules memastikan token ini benar-benar dipetakan ke deviceId lokal sebelum
  // refresh token lama diganti.
  if (!sendHeartbeatToFirebase()) {
    firebaseIdToken = previousIdToken;
    firebaseRefreshToken = previousRefreshToken;
    firebaseTokenExpiresAt = previousExpiresAt;
    nextAuthRetryAt = previousRetryAt;
    authRetryCount = previousRetryCount;
    authRejected = previousAuthRejected;
    Serial.println("Device authentication ditolak: deviceId tidak cocok");
    return false;
  }

  authPreferences.putString("refreshToken", firebaseRefreshToken);
  Serial.println("Device authentication berhasil");
  return true;
}

bool refreshFirebaseToken(bool force) {
  if (!isWiFiConnected || firebaseRefreshToken.length() == 0) return false;
  if (!force) {
    if ((long)(nextAuthRetryAt - millis()) > 0) return false;
    if (firebaseIdToken.length() > 0 &&
        (long)(firebaseTokenExpiresAt - millis()) > (long)AUTH_REFRESH_MARGIN_MS) {
      return true;
    }
  }

  HTTPClient http;
  String url = "https://securetoken.googleapis.com/v1/token?key=" + String(FIREBASE_WEB_API_KEY);
  http.begin(url);
  http.addHeader("Content-Type", "application/x-www-form-urlencoded");
  http.setTimeout(10000);
  String body = "grant_type=refresh_token&refresh_token=" + urlEncode(firebaseRefreshToken);
  int code = http.POST(body);
  body = "";

  if (code != 200) {
    Serial.printf("Refresh token gagal (HTTP %d)\n", code);
    http.end();
    firebaseIdToken = "";
    authRejected = code == 400 || code == 401 || code == 403;
    scheduleAuthRetry();
    if (authRejected) oledShowAuthError();
    return false;
  }

  DynamicJsonDocument responseDoc(2048);
  DeserializationError error = deserializeJson(responseDoc, http.getString());
  http.end();
  if (error || !responseDoc["access_token"]) {
    scheduleAuthRetry();
    return false;
  }

  firebaseIdToken = responseDoc["access_token"].as<String>();
  String rotatedRefreshToken = responseDoc["refresh_token"].as<String>();
  if (rotatedRefreshToken.length() > 0 && rotatedRefreshToken != firebaseRefreshToken) {
    firebaseRefreshToken = rotatedRefreshToken;
    authPreferences.putString("refreshToken", firebaseRefreshToken);
  }
  unsigned long expiresIn = responseDoc["expires_in"].as<unsigned long>();
  firebaseTokenExpiresAt = millis() + expiresIn * 1000UL;
  authRejected = false;
  authRetryCount = 0;
  nextAuthRetryAt = 0;
  Serial.println("ID token diperbarui");
  return true;
}

bool ensureFirebaseAuth() {
  return refreshFirebaseToken(false);
}

String firebaseUrlWithAuth(String pathAndQuery) {
  if (!ensureFirebaseAuth()) return "";
  String delimiter = pathAndQuery.indexOf('?') >= 0 ? "&" : "?";
  return String(FIREBASE_DATABASE_URL) + pathAndQuery + delimiter +
         "auth=" + firebaseIdToken;
}

// Mengirim hasil scan barcode ke node /scans di Firebase Realtime Database.
// Record dibuat sebagai inventory_scan agar web dapat menampilkan popup scan dengan cepat.
bool sendScanToFirebase(String barcode) {
  lastFirebaseScanId = "";
  if (!isWiFiConnected) {
    Serial.println("Tidak bisa kirim scan: no WiFi");
    return false;
  }
  HTTPClient http;
  String url = firebaseUrlWithAuth("/scans.json");
  if (url.length() == 0) return false;
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
  bool ok  = (code >= 200 && code < 300);
  if (ok) {
    DynamicJsonDocument res(256); deserializeJson(res, http.getString());
    lastFirebaseScanId = res["name"].as<String>();
    Serial.println("Scan ID: " + lastFirebaseScanId);
  } else {
    Serial.printf("/scans HTTP error: %d\n", code);
    if (code == 401 || code == 403) {
      firebaseIdToken = "";
      authRejected = true;
      oledShowAuthError();
      scheduleAuthRetry();
    }
  }
  http.end();
  return ok;
}

// Mencari item inventory di Firebase berdasarkan barcode.
// Fungsi mengembalikan InventoryItem dengan found=false jika barcode tidak ditemukan.
InventoryItem lookupInventoryByBarcode(String barcode) {
  InventoryItem item;
  item.found = false;
  if (!isWiFiConnected) return item;

  HTTPClient http;
  String url = firebaseUrlWithAuth(
    "/inventory.json?orderBy=\"barcode\"&equalTo=\"" + barcode + "\""
  );
  if (url.length() == 0) return item;
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
    if (code == 401 || code == 403) {
      firebaseIdToken = "";
      authRejected = true;
      oledShowAuthError();
      scheduleAuthRetry();
    }
  }
  http.end();
  return item;
}

void checkDeviceLookupStatus() {
  if (pendingLookupScanId.length() == 0) return;
  if (!isWiFiConnected) return;
  if ((long)(millis() - pendingLookupDeadline) > 0) {
    oledShowProductLookupNotFound(pendingLookupBarcode, "Lookup timeout");
    pendingLookupScanId = "";
    pendingLookupBarcode = "";
    return;
  }
  if (millis() - lastLookupPoll < LOOKUP_POLL_INTERVAL_MS) return;
  lastLookupPoll = millis();

  HTTPClient http;
  String url = firebaseUrlWithAuth("/deviceLookupStatus/" + String(deviceConfig.deviceId) + ".json");
  if (url.length() == 0) return;
  http.begin(url);
  http.setTimeout(3000);
  int code = http.GET();
  if (code != 200) {
    http.end();
    return;
  }

  String body = http.getString();
  http.end();
  if (body == "null" || body.length() < 5) return;

  DynamicJsonDocument doc(768);
  if (deserializeJson(doc, body)) return;
  String scanId = doc["scanId"] | "";
  if (scanId != pendingLookupScanId) return;

  String status = doc["status"] | "";
  if (status == "found") {
    String name = doc["name"] | "Produk ditemukan";
    String category = doc["category"] | "Honda Cengkareng";
    oledShowProductLookupFound(name, category);
    pendingLookupScanId = "";
    pendingLookupBarcode = "";
  } else if (status == "not_found" || status == "failed") {
    String message = doc["message"] | "Isi manual di web";
    oledShowProductLookupNotFound(pendingLookupBarcode, message);
    pendingLookupScanId = "";
    pendingLookupBarcode = "";
  }
}

void stopScanModeStream() {
  if (sseConnected) {
    sseHttp.end();
    sseConnected = false;
    sseStream = nullptr;
    Serial.println("SSE: stream stopped");
  }
}

void startScanModeStream() {
  if (!isWiFiConnected) return;
  if (firebaseIdToken.length() == 0) return;

  stopScanModeStream(); // ensure clean state

  Serial.println("SSE: connecting to scanMode stream...");
  sseClient.setInsecure();
  sseClient.setTimeout(5000);

  String url = String(FIREBASE_DATABASE_URL) + "/deviceCommands/"
    + String(deviceConfig.deviceId) + "/scanMode.json?auth=" + firebaseIdToken;

  sseHttp.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS);
  sseHttp.setTimeout(10000);

  if (!sseHttp.begin(sseClient, url)) {
    Serial.println("SSE: http.begin failed");
    return;
  }

  sseHttp.addHeader("Accept", "text/event-stream");
  int code = sseHttp.GET();
  if (code == 200) {
    sseStream = sseHttp.getStreamPtr();
    sseConnected = true;
    sseTokenUsed = firebaseIdToken;
    lastSseConnectAttempt = millis();
    Serial.println("SSE: connected successfully");
  } else {
    Serial.printf("SSE: connection failed (HTTP %d)\n", code);
    sseHttp.end();
  }
}

void handleScanModeStream() {
  if (!isWiFiConnected) {
    stopScanModeStream();
    return;
  }

  // Auto-reconnect if token changed
  if (sseConnected && sseTokenUsed != firebaseIdToken) {
    Serial.println("SSE: token changed, reconnecting...");
    stopScanModeStream();
  }

  // Connect or reconnect if disconnected
  if (!sseConnected) {
    // Gated on OTA validation to avoid extra HTTP that could destabilize boot
    String pendingOtaId = otaPreferences.getString("pendingId", "");
    if (pendingOtaId.length() > 0) return;

    if (millis() - lastSseConnectAttempt > 5000UL) {
      lastSseConnectAttempt = millis();
      startScanModeStream();
    }
    return;
  }

  // Read available data from stream in non-blocking way
  if (sseStream && sseStream->available()) {
    String line = sseStream->readStringUntil('\n');
    line.trim();
    if (line.startsWith("data:")) {
      String jsonStr = line.substring(5);
      jsonStr.trim();
      if (jsonStr == "null") return; // no data

      DynamicJsonDocument doc(512);
      DeserializationError err = deserializeJson(doc, jsonStr);
      if (!err) {
        String mode = "";
        if (doc.containsKey("data")) {
          if (doc["data"].is<JsonObject>()) {
            mode = doc["data"]["mode"] | "";
          } else {
            mode = doc["data"].as<String>();
          }
        }
        if (mode.length() > 0 && mode != activeScanMode) {
          activeScanMode = mode;
          Serial.println("Scan mode (stream): " + activeScanMode);
          oledShowStatus();
        }
      }
    }
  }

  // Verify connection is still alive
  if (!sseClient.connected()) {
    Serial.println("SSE: client disconnected");
    stopScanModeStream();
  }
}


// Mengirim heartbeat berkala ke /devices/{deviceId}.
// Payload berisi status koneksi, uptime, heap, baterai, RSSI, versi firmware, dan mode.
bool sendHeartbeatToFirebase() {
  if (!isWiFiConnected) {
    Serial.println("Heartbeat: no WiFi");
    return false;
  }
  HTTPClient http;
  String url = firebaseUrlWithAuth(
    "/devices/" + String(deviceConfig.deviceId) + ".json"
  );
  if (url.length() == 0) {
    isOnline = false;
    return false;
  }
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
  if (activeScanMode.length() > 0) doc["scanMode"] = activeScanMode;
  JsonObject ls        = doc.createNestedObject("lastSeen");
  ls[".sv"]            = "timestamp";

  String json; serializeJson(doc, json);
  Serial.println("PUT /devices/" + String(deviceConfig.deviceId));

  int code = http.PUT(json);
  bool ok  = (code >= 200 && code < 300);
  if (ok) { isOnline = true; Serial.printf("Heartbeat OK (HTTP %d)\n", code); }
  else {
    isOnline = false;
    Serial.printf("Heartbeat gagal (%d)\n", code);
    if (code == 401 || code == 403) {
      firebaseIdToken = "";
      authRejected = true;
      oledShowAuthError();
      scheduleAuthRetry();
    } else {
      checkWiFiConnection();
    }
  }
  http.end();
  return ok;
}


// =============================================================================
//  OTA FIRMWARE UPDATE
//  Native Update library + ECDSA P-256 signature verification.
//  Flow: poll /deviceCommands/{id}/ota -> gate on idle+battery -> stream binary
//  over HTTPS while hashing -> verify signature -> Update.write -> reboot ->
//  confirm via heartbeat, else rollback after repeated boot failure.
// =============================================================================

// Menampilkan progres OTA pada OLED agar operator tahu perangkat sedang update.
void oledShowOtaProgress(const String& version, const char* phase, int progress) {
  if (!oledAvailable) return;
  display.clearDisplay();
  display.setTextSize(1);
  display.setCursor(20, 0); display.println("FIRMWARE UPDATE");
  display.drawLine(0, 10, 127, 10, SSD1306_WHITE);
  display.setCursor(0, 16); display.print("Versi : v"); display.println(version);
  display.setCursor(0, 26); display.print("Tahap : "); display.println(phase);
  if (progress >= 0) {
    display.drawRect(0, 40, 128, 10, SSD1306_WHITE);
    int w = (progress > 100 ? 100 : progress) * 126 / 100;
    display.fillRect(1, 41, w, 8, SSD1306_WHITE);
    display.setCursor(52, 54); display.print(progress); display.println("%");
  }
  display.display();
}

// Menulis status OTA ke /deviceOtaStatus/{deviceId} agar panel admin dapat memantau.
void reportOtaStatus(const char* phase, const String& version, int progress, const String& message) {
  if (!isWiFiConnected) return;
  HTTPClient http;
  String url = firebaseUrlWithAuth("/deviceOtaStatus/" + String(deviceConfig.deviceId) + ".json");
  if (url.length() == 0) return;
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(8000);

  DynamicJsonDocument doc(512);
  doc["phase"]     = phase;
  if (version.length() > 0) doc["version"] = version;
  if (otaActiveCommandId.length() > 0) doc["commandId"] = otaActiveCommandId;
  if (progress >= 0) doc["progress"] = progress;
  if (message.length() > 0) doc["message"] = message;
  JsonObject ts = doc.createNestedObject("updatedAt");
  ts[".sv"]     = "timestamp";

  String body; serializeJson(doc, body);
  http.PUT(body);
  http.end();
}

// Memverifikasi tanda tangan ECDSA P-256 atas hash SHA-256 firmware.
// Public key ditanam di firmware; jika verifikasi gagal, update dibatalkan.
bool verifyOtaSignature(const uint8_t* hash, const uint8_t* signature, size_t sigLen) {
  mbedtls_pk_context pk;
  mbedtls_pk_init(&pk);
  int rc = mbedtls_pk_parse_public_key(
    &pk, (const unsigned char*)OTA_PUBLIC_KEY_PEM, sizeof(OTA_PUBLIC_KEY_PEM));
  if (rc != 0) {
    Serial.printf("OTA: gagal parse public key (-0x%04x)\n", -rc);
    mbedtls_pk_free(&pk);
    return false;
  }
  rc = mbedtls_pk_verify(&pk, MBEDTLS_MD_SHA256, hash, 32, signature, sigLen);
  mbedtls_pk_free(&pk);
  if (rc != 0) {
    Serial.printf("OTA: signature INVALID (-0x%04x)\n", -rc);
    return false;
  }
  Serial.println("OTA: signature OK");
  return true;
}

// Mengecek apakah perangkat aman untuk flashing: idle cukup lama dan baterai cukup.
bool otaPreconditionsMet() {
  if (millis() - lastScanTime < OTA_IDLE_REQUIRED_MS) return false;
  int battery = readBatteryLevel();
  if (battery >= 0 && battery < OTA_MIN_BATTERY_PCT) return false;
  return true;
}

// Mengunduh firmware via HTTPS, memverifikasi hash+signature, lalu menulis ke slot OTA.
// Mengembalikan true bila image tertulis & tervalidasi (perangkat akan reboot oleh caller).
bool performOtaUpdate(const String& commandId, const String& binaryUrl,
                      const String& sha256Hex, const String& signatureB64,
                      size_t expectedSize, const String& version) {
  Serial.println("OTA: mulai " + binaryUrl);
  otaInProgress = true;
  reportOtaStatus("downloading", version, 0, "");
  oledShowOtaProgress(version, "Unduh", 0);

  // Decode signature dari base64 (DER ECDSA, panjang ~70-72 byte).
  uint8_t sigBuf[128];
  size_t sigLen = 0;
  if (mbedtls_base64_decode(sigBuf, sizeof(sigBuf), &sigLen,
        (const unsigned char*)signatureB64.c_str(), signatureB64.length()) != 0) {
    Serial.println("OTA: signature base64 invalid");
    reportOtaStatus("failed", version, -1, "signature decode");
    otaInProgress = false;
    return false;
  }

  WiFiClientSecure client;
  client.setInsecure();  // GitHub release CDN; integritas dijamin signature+hash, bukan TLS pinning
  client.setTimeout(15000);
  HTTPClient http;
  if (!http.begin(client, binaryUrl)) {
    reportOtaStatus("failed", version, -1, "http begin");
    otaInProgress = false;
    return false;
  }
  http.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS);
  http.setTimeout(20000);

  int code = http.GET();
  if (code != HTTP_CODE_OK) {
    Serial.printf("OTA: download HTTP %d\n", code);
    reportOtaStatus("failed", version, -1, "http " + String(code));
    http.end();
    otaInProgress = false;
    return false;
  }

  int contentLen = http.getSize();
  size_t total = contentLen > 0 ? (size_t)contentLen : expectedSize;
  if (total == 0) { http.end(); otaInProgress = false; reportOtaStatus("failed", version, -1, "no size"); return false; }

  // Begin write to the inactive OTA partition. Failure here leaves the running
  // firmware untouched.
  if (!Update.begin(total)) {
    Serial.println("OTA: Update.begin gagal (slot terlalu kecil?)");
    reportOtaStatus("failed", version, -1, "begin");
    http.end();
    otaInProgress = false;
    return false;
  }

  mbedtls_sha256_context shaCtx;
  mbedtls_sha256_init(&shaCtx);
  mbedtls_sha256_starts(&shaCtx, 0);

  WiFiClient* stream = http.getStreamPtr();
  uint8_t buf[1024];
  size_t written = 0;
  int lastPct = -1;
  unsigned long lastData = millis();
  while (http.connected() && written < total) {
    size_t avail = stream->available();
    if (avail == 0) {
      if (millis() - lastData > 15000) { Serial.println("OTA: stream stall"); break; }
      delay(1);
      continue;
    }
    int n = stream->readBytes(buf, avail > sizeof(buf) ? sizeof(buf) : avail);
    if (n <= 0) continue;
    lastData = millis();
    mbedtls_sha256_update(&shaCtx, buf, n);
    if (Update.write(buf, n) != (size_t)n) {
      Serial.println("OTA: Update.write gagal");
      break;
    }
    written += n;
    int pct = (int)(written * 100 / total);
    if (pct != lastPct && pct % 5 == 0) {
      lastPct = pct;
      reportOtaStatus("downloading", version, pct, "");
      oledShowOtaProgress(version, "Unduh", pct);
    }
  }
  http.end();

  uint8_t digest[32];
  mbedtls_sha256_finish(&shaCtx, digest);
  mbedtls_sha256_free(&shaCtx);

  // A short download leaves the firmware unchanged: abort before verify.
  if (written != total) {
    Serial.printf("OTA: unduh tidak lengkap (%u/%u)\n", (unsigned)written, (unsigned)total);
    Update.abort();
    reportOtaStatus("failed", version, -1, "incomplete");
    otaInProgress = false;
    return false;
  }

  // Verify SHA-256 hex from manifest.
  char hexDigest[65];
  for (int i = 0; i < 32; i++) sprintf(hexDigest + i * 2, "%02x", digest[i]);
  hexDigest[64] = 0;
  String calc = String(hexDigest);
  String want = sha256Hex; want.toLowerCase();
  reportOtaStatus("verifying", version, 100, "");
  oledShowOtaProgress(version, "Verifikasi", 100);
  if (calc != want) {
    Serial.println("OTA: sha256 mismatch");
    Serial.println("  calc=" + calc);
    Serial.println("  want=" + want);
    Update.abort();
    reportOtaStatus("failed", version, -1, "sha mismatch");
    otaInProgress = false;
    return false;
  }

  // Verify ECDSA signature over the hash.
  if (!verifyOtaSignature(digest, sigBuf, sigLen)) {
    Update.abort();
    reportOtaStatus("failed", version, -1, "bad signature");
    otaInProgress = false;
    return false;
  }

  if (!Update.end(true)) {
    Serial.printf("OTA: Update.end gagal (err %d)\n", Update.getError());
    reportOtaStatus("failed", version, -1, "finalize");
    otaInProgress = false;
    return false;
  }

  // Mark the new image so the boot validator knows which command to confirm.
  otaPreferences.putString("pendingId", commandId);
  otaPreferences.putString("pendingVer", version);
  reportOtaStatus("flashing", version, 100, "rebooting");
  oledShowOtaProgress(version, "Reboot", 100);
  Serial.println("OTA: sukses, reboot...");
  delay(1500);
  ESP.restart();
  return true;  // not reached
}

// Polls /deviceCommands/{deviceId}/ota and runs an update when one is pending.
// Idempotent: a command already succeeded or failed (by id) is not re-run; gated
// commands are reported as deferred until idle+battery preconditions are met.
void checkForOtaCommand() {
  if (otaInProgress) return;
  if (!isWiFiConnected) return;
  if (millis() - lastOtaCheck < OTA_CHECK_INTERVAL_MS) return;
  lastOtaCheck = millis();

  HTTPClient http;
  String url = firebaseUrlWithAuth("/deviceCommands/" + String(deviceConfig.deviceId) + "/ota.json");
  if (url.length() == 0) return;
  http.begin(url);
  http.setTimeout(8000);
  int code = http.GET();
  if (code != 200) {
    http.end();
    // OTA bersifat opsional. Permission denied pada path OTA tidak boleh membuat
    // perangkat yang sudah diprovisikan kembali ke layar provisioning.
    if (code == 401) {
      firebaseIdToken = "";
      scheduleAuthRetry();
    } else if (code == 403) {
      Serial.println("OTA: akses command ditolak oleh Firebase Rules");
    }
    return;
  }
  String body = http.getString();
  http.end();
  if (body == "null" || body.length() < 5) return;

  DynamicJsonDocument doc(1024);
  if (deserializeJson(doc, body)) return;

  String commandId = doc["commandId"] | "";
  String version   = doc["version"]   | "";
  String binaryUrl = doc["binaryUrl"] | "";
  String sha256Hex = doc["sha256"]    | "";
  String signature = doc["signature"] | "";
  size_t size      = doc["size"]      | 0;
  if (commandId.length() == 0 || binaryUrl.length() == 0 || sha256Hex.length() != 64 || signature.length() == 0) return;

  // Already done with this exact command? (idempotent across reboots)
  String completedId = otaPreferences.getString("doneId", "");
  if (commandId == completedId) return;
  if (commandId == otaLastFailedId && otaRetryCount >= OTA_MAX_RETRIES) return;

  // Same target as current firmware -> mark success, nothing to do.
  if (version == String(FIRMWARE_VERSION)) {
    otaActiveCommandId = commandId;
    otaPreferences.putString("doneId", commandId);
    reportOtaStatus("success", version, 100, "already on version");
    return;
  }

  // New command id resets the retry counter.
  if (commandId != otaActiveCommandId) {
    otaActiveCommandId = commandId;
    otaRetryCount = 0;
  }

  // Gate: only flash when idle and adequately charged.
  if (!otaPreconditionsMet()) {
    reportOtaStatus("deferred", version, -1, "menunggu idle/baterai");
    return;
  }

  otaRetryCount++;
  Serial.printf("OTA: attempt %d/%d for %s\n", otaRetryCount, OTA_MAX_RETRIES, commandId.c_str());
  bool ok = performOtaUpdate(commandId, binaryUrl, sha256Hex, signature, size, version);
  // performOtaUpdate reboots on success. Reaching here means it failed.
  otaInProgress = false;
  if (!ok && otaRetryCount >= OTA_MAX_RETRIES) {
    otaLastFailedId = commandId;
    reportOtaStatus("failed", version, -1, "max retries");
  }
}

// Dipanggil setelah reboot pasca-OTA. Bila heartbeat pertama sukses, image baru
// ditandai valid; bila gagal berulang, rollback ke firmware sebelumnya.
void validateOtaBootSuccess(bool heartbeatOk) {
  String pendingId = otaPreferences.getString("pendingId", "");
  if (pendingId.length() == 0) return;  // bukan boot pasca-OTA

  const esp_partition_t* running = esp_ota_get_running_partition();
  esp_ota_img_states_t state;
  bool pendingVerify = (esp_ota_get_state_partition(running, &state) == ESP_OK &&
                        state == ESP_OTA_IMG_PENDING_VERIFY);

  if (heartbeatOk) {
    otaActiveCommandId = pendingId;
    otaPreferences.putString("doneId", pendingId);
    otaPreferences.remove("pendingId");
    otaPreferences.putUChar("bootFails", 0);
    if (pendingVerify) esp_ota_mark_app_valid_cancel_rollback();
    reportOtaStatus("success", String(FIRMWARE_VERSION), 100, "boot ok");
    Serial.println("OTA: image baru tervalidasi");
    return;
  }

  // Heartbeat gagal pada boot ini: hitung kegagalan; rollback setelah 3x.
  uint8_t fails = otaPreferences.getUChar("bootFails", 0) + 1;
  otaPreferences.putUChar("bootFails", fails);
  Serial.printf("OTA: boot gagal %d kali\n", fails);
  if (fails >= 3) {
    otaPreferences.remove("pendingId");
    otaPreferences.putUChar("bootFails", 0);
    reportOtaStatus("rollback", otaPreferences.getString("pendingVer", ""), -1, "boot failures");
    Serial.println("OTA: rollback ke firmware sebelumnya");
    delay(1000);
    if (Update.canRollBack() && Update.rollBack()) {
      ESP.restart();
    }
  }
}


// =============================================================================
//  BARCODE PROCESSING
// =============================================================================
// Memproses barcode inventory: kirim scan, simpan histori lokal, lookup item, dan tampilkan OLED.
// Stok tidak diubah di firmware; perubahan stok ditangani oleh aplikasi web/Firebase helper.
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
    pendingLookupScanId = "";
    pendingLookupBarcode = "";
    Serial.printf("Item: %s | Qty: %d | MinStock: %d\n",
                  item.name.c_str(), item.quantity, item.minStock);
    oledShowInventoryFound(item.name, item.quantity, item.minStock);
  } else if (sent && lastFirebaseScanId.length() > 0) {
    pendingLookupScanId = lastFirebaseScanId;
    pendingLookupBarcode = barcode;
    pendingLookupDeadline = millis() + LOOKUP_TIMEOUT_MS;
    lastLookupPoll = 0;
    oledShowProductLookupSearching(barcode);
  } else {
    oledShowBarcode(barcode, "", sent);
  }
}

// Memproses barcode kredensial satu kali dari panel admin.
// Format: ESP32PROV:1:<deviceId>:<email>:<password>
void processProvisioningBarcode(String input) {
  const String prefix = String(PROVISIONING_PREFIX) + "1:";
  if (!input.startsWith(prefix) || !isWiFiConnected) {
    Serial.println("Provisioning ditolak: format/WiFi tidak valid");
    if (!isWiFiConnected) oledShowNoWiFi();
    else oledShowAuthError();
    input = "";
    return;
  }

  String payload = input.substring(prefix.length());
  input = "";
  int first = payload.indexOf(':');
  int second = payload.indexOf(':', first + 1);
  if (first <= 0 || second <= first + 1 || payload.indexOf(':', second + 1) >= 0) {
    Serial.println("Provisioning ditolak: payload tidak valid");
    payload = "";
    oledShowAuthError();
    return;
  }

  String deviceId = payload.substring(0, first);
  String email = payload.substring(first + 1, second);
  String password = payload.substring(second + 1);
  payload = "";
  deviceId.toUpperCase();

  if (deviceId != String(deviceConfig.deviceId) ||
      email.length() == 0 || email.length() > 128 ||
      password.length() == 0 || password.length() > 128) {
    Serial.println("Provisioning ditolak: kredensial tidak cocok");
    password = "";
    oledShowAuthError();
    return;
  }

  bool ok = signInDevice(email, password);
  password = "";
  email = "";
  if (ok) {
    Serial.println("Provisioning scanner berhasil");
    oledShowProvisioningSuccess();
    lastHeartbeat = 0;
  } else {
    oledShowAuthError();
  }
}

// Menerima input dari scanner GM67 atau Serial Monitor.
// QR WiFi dan provisioning dikonsumsi lokal; input lain diproses sebagai barcode inventory.
void processBarcodeInput(String input) {
  input.trim();
  if (input.length() == 0) return;

  // Jangan log atau teruskan payload ini: isinya membawa password perangkat.
  if (input.startsWith(PROVISIONING_PREFIX)) {
    processProvisioningBarcode(input);
    input = "";
    return;
  }

  if (input.startsWith("WIFI:")) {
    Serial.println("QR WiFi diterima");
    String ssid, pass, sec;
    if (parseWiFiQR(input, ssid, pass, sec)) {
      strncpy(wifiConfig.ssid,     ssid.c_str(), sizeof(wifiConfig.ssid)    - 1);
      strncpy(wifiConfig.password, pass.c_str(), sizeof(wifiConfig.password)- 1);
      wifiConfig.ssid[sizeof(wifiConfig.ssid) - 1] = '\0';
      wifiConfig.password[sizeof(wifiConfig.password) - 1] = '\0';
      wifiConfig.isValid = true;
      saveWiFiConfig();
      if (connectToWiFi()) startWebServer();
    }
    return;
  }

  Serial.println("Input: " + input);
  lastBarcode  = input;
  lastScanTime = millis();
  scanCount++;
  processInventoryBarcode(input);
}


// =============================================================================
//  WEB SERVER
// =============================================================================
// Menjalankan web server lokal ESP32 pada port 80.
// Endpoint lokal hanya untuk status read-only dan reset ber-PIN.
void startWebServer() {
  if (isServerStarted || !isWiFiConnected) return;
  server = new WebServer(80);
  server->on("/",            HTTP_GET,     handleRoot);
  server->on("/api/status",  HTTP_GET,     handleApiStatus);
  server->on("/api/scan",    HTTP_GET,     handleApiScan);
  server->on("/reset",       HTTP_POST,    handleReset);
  const char* headerKeys[] = {"X-Provisioning-Pin"};
  server->collectHeaders(headerKeys, 1);
  server->begin();
  isServerStarted = true;
  Serial.println("Web server started: http://" + WiFi.localIP().toString());
}

bool requireProvisioningPin() {
  if (!server) return false;
  if ((long)(provisioningLockedUntil - millis()) > 0) {
    server->send(429, "application/json", "{\"error\":\"Terlalu banyak percobaan. Coba lagi nanti\"}");
    return false;
  }
  if (server->header("X-Provisioning-Pin") == provisioningPin) {
    provisioningFailures = 0;
    return true;
  }
  provisioningFailures++;
  if (provisioningFailures >= 5) {
    provisioningFailures = 0;
    provisioningLockedUntil = millis() + 60000UL;
  }
  server->send(403, "application/json", "{\"error\":\"PIN provisioning tidak valid\"}");
  return false;
}

// Mengirim halaman web sederhana untuk memantau scanner.
// HTML dibuat sebagai string raw literal agar bisa langsung disajikan oleh WebServer ESP32.
void handleRoot() {
  if (!server) return;
  String html = R"rawliteral(
<!DOCTYPE html><html><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ESP32 Scanner v6.4.2</title>
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
<p style="text-align:center;color:#94a3b8;font-size:.8em">v6.4.2 - Inventory Mode - )rawliteral";
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
  <label>Provisioning</label>
  <p>Daftarkan Device ID ini di panel admin, lalu pindai barcode kredensial dengan scanner.</p>
  <a class="btn" href="/api/status">Status JSON</a>
</div>

<script>
setInterval(function(){
  fetch('/api/scan').then(r=>r.json()).then(d=>{
    if(d.barcode) document.getElementById('bc').textContent=d.barcode;
    document.getElementById('sc').textContent=d.scanCount||'--';
  });
},5000);
</script></body></html>)rawliteral";
  server->send(200,"text/html",html);
}

// Mengirim status perangkat dalam format JSON untuk dashboard atau debugging lokal.
// Data mencakup identitas perangkat, koneksi, barcode terakhir, uptime, heap, dan heartbeat.
void handleApiStatus() {
  if (!server) return;
  DynamicJsonDocument doc(1024);
  doc["deviceId"]      = deviceConfig.deviceId;
  doc["version"]       = FIRMWARE_VERSION;
  doc["wifiConnected"] = isWiFiConnected;
  doc["isOnline"]      = isOnline;
  doc["authenticated"] = firebaseIdToken.length() > 0 && !authRejected;
  doc["ssid"]          = wifiConfig.ssid;
  doc["ipAddress"]     = WiFi.localIP().toString();
  doc["rssi"]          = WiFi.RSSI();
  doc["lastBarcode"]   = lastBarcode;
  doc["uptime"]        = (millis() - bootTime) / 1000;
  doc["freeHeap"]      = ESP.getFreeHeap();
  doc["scanCount"]     = scanCount;
  doc["currentMode"]   = "inventory";
  doc["lastHeartbeat"] = (millis() - lastHeartbeat) / 1000;
  String res; serializeJson(doc, res);
  server->send(200,"application/json",res);
}

// Mengirim informasi scan terakhir dalam format JSON read-only.
void handleApiScan() {
  if (!server) return;
  DynamicJsonDocument doc(512);
  doc["status"]      = lastBarcode.length() > 0 ? "success" : "no_scan";
  doc["barcode"]     = lastBarcode;
  doc["scanCount"]   = scanCount;
  doc["currentMode"] = "inventory";
  doc["isOnline"]    = isOnline;
  String res; serializeJson(doc, res);
  server->send(200,"application/json",res);
}

// Mereset konfigurasi WiFi dan perangkat dari EEPROM, lalu restart ESP32.
// Endpoint ini dipakai saat perangkat perlu dikonfigurasi ulang dari awal.
void handleReset() {
  if (!server) return;
  if (!requireProvisioningPin()) return;
  server->send(200,"text/plain","Resetting...");
  memset(&wifiConfig,   0, sizeof(wifiConfig));
  memset(&deviceConfig, 0, sizeof(deviceConfig));
  wifiConfig.isValid = false; deviceConfig.isConfigured = false;
  EEPROM.put(WIFI_CONFIG_ADDR,   wifiConfig);
  EEPROM.put(DEVICE_CONFIG_ADDR, deviceConfig);
  EEPROM.commit();
  clearFirebaseAuth();
  delay(1000);
  ESP.restart();
}

// =============================================================================
//  SETUP & LOOP
// =============================================================================
// Fungsi setup Arduino yang berjalan sekali saat perangkat boot.
// Menginisialisasi serial, OLED, EEPROM, WiFi, web server, ADC baterai, dan state awal.
void setup() {
  Serial.begin(115200);
  Serial2.begin(9600, SERIAL_8N1, RXD2, TXD2);
  delay(100);  // minimal stabilize
  bootTime = millis();

  initOLED();
  oledShowBoot();
  delay(500);  // singkat, cukup baca "Initializing..."
  provisioningPin = String(100000 + (esp_random() % 900000));
  Serial.println("Provisioning PIN: " + provisioningPin);

  Serial.println("\nESP32 GM67 Scanner v" FIRMWARE_VERSION " - Inventory Only");
  Serial.println("=========================================");
  Serial.println("Firebase: barcodescanesp32");
  Serial.println("Paths: /scans /devices /inventory /analytics");
  Serial.println("OLED: " + String(oledAvailable ? "OK" : "NOT FOUND"));

  EEPROM.begin(EEPROM_SIZE);
  authPreferences.begin("deviceAuth", false);
  otaPreferences.begin("deviceOta", false);
  loadWiFiConfig();
  loadDeviceConfig();
  loadFirebaseRefreshToken();
  if (!isDeviceProvisioned()) {
    oledShowProvisioningPin();
    delay(3000);
  }

  // Fast WiFi init — persistent=false cegah tulis flash, lebih cepat boot
  WiFi.persistent(false);
  WiFi.setAutoReconnect(true);
  WiFi.mode(WIFI_STA);

  if (wifiConfig.isValid) {
    if (connectToWiFi()) {
      startWebServer();
      Serial.println("Web: http://" + WiFi.localIP().toString());
      ensureFirebaseAuth();
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

// Fungsi loop utama Arduino yang berjalan terus-menerus.
// Menangani web server, reconnect WiFi, input barcode, heartbeat Firebase, dan refresh OLED.
void loop() {
  if (isServerStarted && server) server->handleClient();

  checkWiFiConnection();

  if (Serial2.available()) {
    String input = Serial2.readStringUntil('\n');
    processBarcodeInput(input);
  }

  if (Serial.available()) {
    String input = Serial.readStringUntil('\n');
    processBarcodeInput(input);
  }

  if (millis() - lastHeartbeat > 5000) {
    sampleBattery();  // read ADC BEFORE WiFi HTTP to avoid voltage sag noise
    if (isWiFiConnected) {
      ensureFirebaseAuth();
      bool hbOk = sendHeartbeatToFirebase();
      // First successful heartbeat after an OTA reboot confirms the new image.
      validateOtaBootSuccess(hbOk);
    }
    lastHeartbeat = millis();
  }

  checkDeviceLookupStatus();
  handleScanModeStream();

  // Poll for a pending OTA command; gated internally on idle + battery.
  checkForOtaCommand();

  oledUpdateIdle();
  delay(100);
}
