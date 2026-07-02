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
#define OLED_TEXT_CHARS       21
#define OLED_HEADER_SEP_Y     16
#define OLED_BODY_Y           18
#define OLED_ROW_H            10
#define OLED_FOOTER_Y         55

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
#define FIRMWARE_VERSION   "6.5.17"
#define AUTH_REFRESH_MARGIN_MS 300000UL
#define AUTH_MAX_BACKOFF_MS     60000UL
#define FIREBASE_DATABASE_URL "https://barcodescanesp32-default-rtdb.asia-southeast1.firebasedatabase.app"
#define FIREBASE_WEB_API_KEY  "AIzaSyBDMTHkz_BwbqKfkVQYvKEI3yfrOLa_jLY"
#define PROVISIONING_PREFIX   "ESP32PROV:"

// --- Physical UI buttons ------------------------------------------------------
#define BTN_UP_PIN          32
#define BTN_OK_PIN          33
#define BTN_DOWN_PIN        25
#define BUTTON_DEBOUNCE_MS  50UL
#define BUTTON_LONG_MS      800UL
#define SCREEN_SAVER_TIMEOUT_MS 30000UL
#define MAIN_MENU_COUNT      6
#define MODE_MENU_COUNT      4
#define CONFIRM_MENU_COUNT   2
#define SERIAL_INPUT_MAX   512
#define SERIAL_IDLE_FLUSH_MS 50UL

// --- WiFi connection state ----------------------------------------------------
#define WIFI_CONNECT_TIMEOUT_MS 10000UL
#define WIFI_RECONNECT_INTERVAL_MS 10000UL
#define WIFI_PROGRESS_INTERVAL_MS 500UL

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
#define BATTERY_DEFAULT_MAX_MV 3800  // fallback: full charge reads ~3785mV via divider
#define BATTERY_MIN_MV         3200  // PCM cut-off ~3.2V (LP902040 mati di ~30% dengan MIN=3000)
#define BATTERY_DIVIDER        2.0f  // (R1+R2)/R2 = 200k/100k
#define BATTERY_SAMPLES         10  // averaging samples per read
#define BATTERY_CALIB_SAMPLES   50  // samples used during calibration
#define BATTERY_CALIB_MIN_MV  3500  // reject clearly invalid full-battery readings
#define BATTERY_EMA_ALPHA     0.05f // EMA smoothing (lower = smoother, less WiFi sag noise)
#define BATTERY_HYSTERESIS      2   // only update reported level if change >= 2%
#define BATTERY_ADC_CHANNEL    ADC1_CHANNEL_6  // GPIO34 = ADC1_CH6
#define BATTERY_ADC_ATTEN      ADC_ATTEN_DB_11 // 0-3.3V range
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
  bool   lookupOk;
};

struct ScanData {
  String barcode;
  String timestamp;
  String deviceId;
  bool   processed;
  bool   sentToFirebase;
};
// -----------------------------------------------------------------------------

Preferences authPreferences;

WiFiConfig   wifiConfig;
DeviceConfig deviceConfig;

bool          isWiFiConnected = false;
unsigned long lastScanTime    = 0;
unsigned long lastHeartbeat   = 0;
unsigned long scanCount       = 0;
unsigned long bootTime        = 0;
unsigned long lastWiFiCheck   = 0;
bool          isOnline        = false;
bool          authRejected    = false;
bool          firebaseAuthPending = false;
String        firebaseIdToken = "";
String        firebaseRefreshToken = "";
String        firebaseUserUid = "";
unsigned long firebaseTokenExpiresAt = 0;
unsigned long nextAuthRetryAt = 0;
uint8_t       authRetryCount = 0;
String        provisioningPin = "";
String        lastFirebaseScanId = "";
String        pendingLookupScanId = "";
String        pendingLookupBarcode = "";
unsigned long pendingLookupDeadline = 0;
unsigned long lastLookupPoll = 0;
String        activeScanMode = "Manual";       // dikontrol dari tombol alat: "Manual", "Auto IN", "Auto OUT"
#define LOOKUP_POLL_INTERVAL_MS 1000UL
#define LOOKUP_TIMEOUT_MS       10000UL

enum WiFiConnectState {
  WIFI_CONN_IDLE,
  WIFI_CONN_CONNECTING
};

WiFiConnectState wifiConnectState = WIFI_CONN_IDLE;
unsigned long wifiConnectStartedAt = 0;
unsigned long lastWiFiProgressAt = 0;
unsigned long nextWiFiReconnectAt = 0;

enum UiScreen {
  SCREEN_HOME,
  SCREEN_SAVER,
  SCREEN_MAIN_MENU,
  SCREEN_MODE_MENU,
  SCREEN_BATTERY,
  SCREEN_WIFI,
  SCREEN_STATUS,
  SCREEN_BATTERY_CAL_CONFIRM,
  SCREEN_RESTART_CONFIRM
};

enum ButtonEvent {
  BTN_NONE,
  BTN_UP_SHORT,
  BTN_OK_SHORT,
  BTN_DOWN_SHORT,
  BTN_UP_LONG,
  BTN_OK_LONG,
  BTN_DOWN_LONG
};

struct ButtonState {
  uint8_t pin;
  bool stablePressed;
  bool lastReading;
  bool longFired;
  unsigned long lastChange;
  unsigned long pressedAt;
};

UiScreen currentScreen = SCREEN_HOME;
uint8_t mainMenuIndex = 0;
uint8_t modeMenuIndex = 0;
uint8_t batteryCalMenuIndex = 0;
uint8_t restartMenuIndex = 0;
unsigned long lastUiInteraction = 0;
ButtonState btnUp = {BTN_UP_PIN, false, false, false, 0, 0};
ButtonState btnOk = {BTN_OK_PIN, false, false, false, 0, 0};
ButtonState btnDown = {BTN_DOWN_PIN, false, false, false, 0, 0};

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
bool          otaCheckRequested  = false;
Preferences   otaPreferences;
#define OTA_CHECK_INTERVAL_MS 300000UL

// --- Function Declarations ---------------------------------------------------
void          processBarcodeInput(String input);
void          processProvisioningBarcode(String input);
void          processInventoryBarcode(const String& barcode);
void          checkDeviceLookupStatus();
void          startScanModeStream();
void          stopScanModeStream();
void          handleScanModeStream();
bool          connectToWiFi();
void          serviceWiFiConnection();
void          onWiFiConnected();
void          onWiFiDisconnected(bool showNoWiFiScreen);
bool          sendScanToFirebase(const String& barcode, bool processed = false, bool itemFound = false, const String& itemId = "");
bool          sendHeartbeatToFirebase();
void          serviceHeartbeat(bool force);
bool          signInDevice(String email, String password);
bool          refreshFirebaseToken(bool force = false);
bool          ensureFirebaseAuth();
String        firebaseUrlWithAuth(const String& pathAndQuery);
String        urlEncode(const String& value);
String        makeFirebaseKey(const char* prefix);
String        makeOperationId();
void          loadFirebaseRefreshToken();
void          scheduleAuthRetry();
InventoryItem lookupInventoryByBarcode(const String& barcode);
bool          adjustStockFromDevice(const InventoryItem& item, int delta);
bool          parseWiFiQR(String qrData, String &ssid, String &password, String &security);
void          saveWiFiConfig();
void          loadWiFiConfig();
void          saveDeviceConfig();
void          loadDeviceConfig();
void          checkWiFiConnection();
void          initOLED();
void          oledBeginFrame();
const char*   fitText(const char* text, char* out, size_t outSize, uint8_t maxChars = OLED_TEXT_CHARS);
const char*   fitText(const String& text, char* out, size_t outSize, uint8_t maxChars = OLED_TEXT_CHARS);
void          drawSeparator(int y = OLED_HEADER_SEP_Y);
void          drawCenteredText(int y, const char* text, uint8_t textSize = 1);
void          drawHeader(const char* title, const char* subtitle = nullptr);
void          drawLabelValue(int y, const char* label, const char* value);
void          drawLabelValueInt(int y, const char* label, long value, const char* suffix = "");
void          drawFooter(const char* left, const char* right = nullptr);
void          formatIpAddress(IPAddress ip, char* out, size_t outSize);
void          drawBatteryIcon(int x, int y, int percent);
void          drawWifiIcon(int x, int y, int rssi);
void          initBatteryADC();
void          sampleBattery();
int           readBatteryLevel();
void          oledShowBoot();
void          oledShowStatus();
void          oledShowBarcode(const String& barcode, const String& itemName, bool sent);
void          oledShowInventoryFound(const String& name, int qty, int minStock);
void          oledShowAutoStockResult(const String& mode, const String& name, int beforeQty, int afterQty, bool ok, const String& message);
void          oledShowProductLookupSearching(const String& barcode);
void          oledShowProductLookupFound(const String& name, const String& category);
void          oledShowProductLookupNotFound(const String& barcode, const String& message);
void          oledShowWiFiConnecting(const char* ssid);
void          oledShowWiFiConnected(const char* ip);
void          oledShowNoWiFi();
void          oledShowAuthError();
void          oledShowProvisioningPin();
void          oledShowProvisioningSuccess();
bool          isDeviceProvisioned();
void          oledUpdateIdle();
void          initButtons();
ButtonEvent   readButton(ButtonState &button, ButtonEvent shortEvent, ButtonEvent longEvent);
void          handleButtons();
void          handleUiEvent(ButtonEvent event);
void          handleInputStream(Stream& stream, char* buffer, size_t& length, unsigned long& lastCharTime);
void          setScanModeFromDevice(const String& mode);
void          oledShowMainMenu();
void          oledShowModeMenu();
void          oledShowScreenSaver();
void          oledShowBatteryMenu();
void          oledShowWiFiMenu();
void          oledShowDeviceStatusMenu();
void          oledShowBatteryCalConfirm();
void          oledShowRestartConfirm();
void          renderCurrentScreen();
// --- OTA ---------------------------------------------------------------------
void          checkForOtaCommand(bool force = false);
bool          performOtaUpdate(const String& commandId, const String& binaryUrl,
                               const String& sha256Hex, const String& signatureB64,
                               size_t expectedSize, const String& version);
bool          verifyOtaSignature(const uint8_t* hash, const uint8_t* signature, size_t sigLen);
void          reportOtaStatus(const char* phase, const String& version, int progress, const String& message);
bool          otaPreconditionsMet();
void          validateOtaBootSuccess(bool heartbeatOk);
void          oledShowOtaProgress(const String& version, const char* phase, int progress);
void          performBatteryCalibration(bool returnHomeAfter = false);
// -----------------------------------------------------------------------------


// =============================================================================
//  BATTERY LEVEL (esp_adc_cal calibrated)
// =============================================================================
float batteryEma = -1.0f;       // persistent EMA state (-1 = uninitialized)
int   lastReportedBattery = -1; // hysteresis: last sent value
int   cachedBatteryLevel  = -1; // pre-sampled before WiFi activity
esp_adc_cal_characteristics_t adcCal;  // ADC calibration characteristics
Preferences batCalibPrefs;
int batteryCalMaxMv = 0;        // cached calibrated max voltage (0 = use default)

int getBatteryMaxMv() {
  if (batteryCalMaxMv <= 0) batteryCalMaxMv = batCalibPrefs.getInt("maxMv", BATTERY_DEFAULT_MAX_MV);
  return batteryCalMaxMv;
}

// Menginisialisasi ADC baterai dengan resolusi 12-bit dan attenuasi yang sesuai.
// Kalibrasi memakai eFuse Vref/Two Point bila tersedia agar pembacaan mV lebih akurat.
void initBatteryADC() {
  adc1_config_width(ADC_WIDTH_BIT_12);
  adc1_config_channel_atten(BATTERY_ADC_CHANNEL, BATTERY_ADC_ATTEN);

  esp_adc_cal_value_t calType = esp_adc_cal_characterize(
    ADC_UNIT_1, BATTERY_ADC_ATTEN, ADC_WIDTH_BIT_12, 1100, &adcCal
  );

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
    delayMicroseconds(250);
  }
  float voltageMv = (adcSum / (float)BATTERY_SAMPLES) * BATTERY_DIVIDER;

  // EMA smoothing across calls
  if (batteryEma < 0) {
    batteryEma = voltageMv;  // first reading: initialize
  } else {
    batteryEma = BATTERY_EMA_ALPHA * voltageMv + (1.0f - BATTERY_EMA_ALPHA) * batteryEma;
  }

  int maxMv = getBatteryMaxMv();
  int percent = (int)((batteryEma - BATTERY_MIN_MV) * 100.0f / (maxMv - BATTERY_MIN_MV));
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

void clearBatteryCalibrationCommand() {
  if (!isWiFiConnected || firebaseIdToken.length() == 0) return;

  String cmdUrl = firebaseUrlWithAuth("/deviceCommands/" + String(deviceConfig.deviceId) + "/batteryCalibrate.json");
  if (cmdUrl.length() == 0) return;

  WiFiClientSecure cmdClient;
  cmdClient.setInsecure();
  HTTPClient cmdHttp;
  cmdHttp.begin(cmdClient, cmdUrl);
  int code = cmdHttp.sendRequest("DELETE", "");
  Serial.printf("Battery calibration command delete: HTTP %d\n", code);
  cmdHttp.end();
}

void reportBatteryCalibrationResult(int maxMv) {
  if (!isWiFiConnected || firebaseIdToken.length() == 0) return;

  HTTPClient http;
  String url = firebaseUrlWithAuth("/deviceCalibrationResult/" + String(deviceConfig.deviceId) + ".json");
  if (url.length() == 0) return;

  WiFiClientSecure client;
  client.setInsecure();
  http.begin(client, url);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(5000);

  DynamicJsonDocument doc(256);
  doc["maxMv"] = maxMv;
  doc["status"] = "done";
  JsonObject ts = doc.createNestedObject("updatedAt");
  ts[".sv"] = "timestamp";
  String body;
  serializeJson(doc, body);
  int code = http.PUT(body);
  Serial.printf("Battery calibration result: HTTP %d\n", code);
  http.end();
}

void finishBatteryCalibrationScreen(bool returnHomeAfter) {
  if (!returnHomeAfter) return;

  currentScreen = SCREEN_HOME;
  lastUiInteraction = millis();
  lastBarcodeOnOled = 0;
  lastOledRefresh = 0;
  if (oledAvailable) renderCurrentScreen();
}

// Kalibrasi ulang BATTERY_MAX_MV berdasarkan tegangan ADC saat ini.
// Panggil saat baterai diketahui penuh (indikator biru TP4056 menyala).
// Hasil disimpan di NVS Preferences agar persisten antar reboot.
void performBatteryCalibration(bool returnHomeAfter) {
  Serial.println("Battery calibration started");
  if (oledAvailable) {
    oledBeginFrame();
    drawHeader("KALIBRASI", "BATERAI");
    drawLabelValue(OLED_BODY_Y, "Status", "Sampling ADC");
    drawLabelValue(OLED_BODY_Y + OLED_ROW_H, "Catatan", "Baterai penuh");
    drawFooter("Mohon tunggu", "ADC");
    display.display();
  }

  // Oversampling dengan jumlah sampel lebih banyak untuk akurasi
  uint32_t adcSum = 0;
  for (int i = 0; i < BATTERY_CALIB_SAMPLES; i++) {
    adcSum += esp_adc_cal_raw_to_voltage(adc1_get_raw(BATTERY_ADC_CHANNEL), &adcCal);
    delayMicroseconds(500);
    if ((i % 10) == 0) yield();
  }
  float avgRawMv = adcSum / (float)BATTERY_CALIB_SAMPLES;
  float realMv = avgRawMv * BATTERY_DIVIDER;

  int newMaxMv = (int)(realMv + 0.5f);
  if (newMaxMv < BATTERY_CALIB_MIN_MV) {
    Serial.printf("Calibration rejected: %dmV di bawah batas kalibrasi (%d)\n",
                  newMaxMv, BATTERY_CALIB_MIN_MV);
    if (oledAvailable) {
      oledBeginFrame();
      drawHeader("KALIBRASI GAGAL", "BATERAI");
      drawLabelValueInt(OLED_BODY_Y, "Hasil", newMaxMv, "mV");
      drawLabelValue(OLED_BODY_Y + OLED_ROW_H, "Status", "Terlalu rendah");
      drawFooter("Cek baterai", "Gagal");
      display.display();
      lastBarcodeOnOled = millis();
    }
    clearBatteryCalibrationCommand();
    finishBatteryCalibrationScreen(returnHomeAfter);
    return;
  }

  batCalibPrefs.putInt("maxMv", newMaxMv);
  batteryCalMaxMv = newMaxMv;

  // Reset EMA & hysteresis agar persentase langsung terhitung ulang
  batteryEma = -1.0f;
  lastReportedBattery = -1;
  cachedBatteryLevel = -1;

  Serial.printf("Battery calibration: maxMv=%d\n", newMaxMv);
  if (oledAvailable) {
    oledBeginFrame();
    drawHeader("KALIBRASI OK", "BATERAI");
    drawLabelValueInt(OLED_BODY_Y, "Max", newMaxMv, "mV");
    drawLabelValueInt(OLED_BODY_Y + OLED_ROW_H, "Level", readBatteryLevel(), "%");
    drawFooter("Tersimpan", "OK");
    display.display();
    lastBarcodeOnOled = millis();
  }

  reportBatteryCalibrationResult(newMaxMv);
  clearBatteryCalibrationCommand();
  finishBatteryCalibrationScreen(returnHomeAfter);

  Serial.println("Battery calibration done");
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

void oledBeginFrame() {
  if (!oledAvailable) return;
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.cp437(true);
}

const char* fitText(const char* text, char* out, size_t outSize, uint8_t maxChars) {
  if (outSize == 0) return "";
  if (!text) text = "";
  if (maxChars == 0 || maxChars >= outSize) maxChars = outSize - 1;

  size_t len = strlen(text);
  size_t copyLen = len > maxChars ? maxChars : len;
  if (len > maxChars && maxChars >= 2) {
    copyLen = maxChars - 2;
    memcpy(out, text, copyLen);
    out[copyLen++] = '.';
    out[copyLen++] = '.';
  } else {
    memcpy(out, text, copyLen);
  }
  out[copyLen] = '\0';
  return out;
}

const char* fitText(const String& text, char* out, size_t outSize, uint8_t maxChars) {
  return fitText(text.c_str(), out, outSize, maxChars);
}

void drawSeparator(int y) {
  display.drawLine(0, y, SCREEN_WIDTH - 1, y, SSD1306_WHITE);
}

void drawCenteredText(int y, const char* text, uint8_t textSize) {
  char buf[32];
  fitText(text, buf, sizeof(buf), OLED_TEXT_CHARS / textSize);
  int16_t width = strlen(buf) * 6 * textSize;
  int16_t x = (SCREEN_WIDTH - width) / 2;
  if (x < 0) x = 0;
  display.setTextSize(textSize);
  display.setCursor(x, y);
  display.print(buf);
  display.setTextSize(1);
}

void drawHeader(const char* title, const char* subtitle) {
  drawCenteredText(0, title, 1);
  if (subtitle && strlen(subtitle) > 0) {
    drawCenteredText(8, subtitle, 1);
  }
  drawSeparator(OLED_HEADER_SEP_Y);
}

void drawLabelValue(int y, const char* label, const char* value) {
  char valueBuf[32];
  uint8_t labelChars = strlen(label) + 2;
  uint8_t maxValueChars = labelChars < OLED_TEXT_CHARS ? OLED_TEXT_CHARS - labelChars : 0;
  if (maxValueChars == 0) valueBuf[0] = '\0';
  else fitText(value, valueBuf, sizeof(valueBuf), maxValueChars);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, y);
  display.print(label);
  display.print(": ");
  display.print(valueBuf);
}

void drawLabelValueInt(int y, const char* label, long value, const char* suffix) {
  char buf[24];
  snprintf(buf, sizeof(buf), "%ld%s", value, suffix ? suffix : "");
  drawLabelValue(y, label, buf);
}

void drawFooter(const char* left, const char* right) {
  char leftBuf[24];
  char rightBuf[16];
  drawSeparator(OLED_FOOTER_Y - 2);
  display.setCursor(0, OLED_FOOTER_Y);
  display.print(fitText(left, leftBuf, sizeof(leftBuf), 14));
  if (right && strlen(right) > 0) {
    fitText(right, rightBuf, sizeof(rightBuf), 7);
    int16_t x = SCREEN_WIDTH - (strlen(rightBuf) * 6);
    if (x < 0) x = 0;
    display.setCursor(x, OLED_FOOTER_Y);
    display.print(rightBuf);
  }
}

void formatIpAddress(IPAddress ip, char* out, size_t outSize) {
  snprintf(out, outSize, "%u.%u.%u.%u", ip[0], ip[1], ip[2], ip[3]);
}

void drawBatteryIcon(int x, int y, int percent) {
  display.drawRect(x, y, 13, 7, SSD1306_WHITE);
  display.fillRect(x + 13, y + 2, 2, 3, SSD1306_WHITE);
  int bars = (percent > 80) ? 4 : (percent > 55) ? 3 : (percent > 30) ? 2 : (percent > 10) ? 1 : 0;
  for (int i = 0; i < bars; i++) {
    display.fillRect(x + 2 + (i * 3), y + 2, 2, 3, SSD1306_WHITE);
  }
}

void drawWifiIcon(int x, int y, int rssi) {
  int bars = (rssi >= -50) ? 4 : (rssi >= -60) ? 3 : (rssi >= -70) ? 2 : (rssi >= -80) ? 1 : 0;
  int h = 2;
  for (int i = 0; i < 4; i++) {
    int bw = (i + 1) * 2;
    int by = y + 6 - (i + 1) * h;
    if (i < bars) {
      display.fillRect(x + (4 - bw) / 2, by, bw, h - 1, SSD1306_WHITE);
    } else {
      display.drawRect(x + (4 - bw) / 2, by, bw, h - 1, SSD1306_WHITE);
    }
  }
}

void oledShowBoot() {
  if (!oledAvailable) return;
  oledBeginFrame();
  char version[18];
  snprintf(version, sizeof(version), "FW v%s", FIRMWARE_VERSION);
  drawHeader("ESP32 SCANNER", version);
  drawLabelValue(OLED_BODY_Y, "Modul", "GM67 Barcode");
  drawLabelValue(OLED_BODY_Y + OLED_ROW_H, "Backend", "Firebase RTDB");
  drawLabelValue(OLED_BODY_Y + OLED_ROW_H * 2, "Mode", "Inventory");
  drawFooter("Initializing", "SSD1306");
  display.display();
}

void oledShowStatus() {
  if (!oledAvailable) return;
  oledBeginFrame();

  int batLvl = readBatteryLevel();
  drawHeader("SCANNER", isOnline ? "ONLINE" : "OFFLINE");
  drawBatteryIcon(112, 0, batLvl);
  char batText[8];
  snprintf(batText, sizeof(batText), "%d%%", batLvl);
  display.setCursor(107, 8);
  display.print(batText);

  if (isWiFiConnected) {
    char ssid[24];
    fitText(wifiConfig.ssid, ssid, sizeof(ssid), 15);
    int rssi = WiFi.RSSI();
    drawLabelValue(OLED_BODY_Y, "WiFi", ssid);
    drawWifiIcon(116, OLED_BODY_Y + 2, rssi);
    char ip[16];
    formatIpAddress(WiFi.localIP(), ip, sizeof(ip));
    drawLabelValue(OLED_BODY_Y + OLED_ROW_H, "IP", ip);
  } else {
    drawLabelValue(OLED_BODY_Y, "WiFi", "Terputus");
    drawLabelValue(OLED_BODY_Y + OLED_ROW_H, "IP", "--");
  }
  drawLabelValueInt(OLED_BODY_Y + OLED_ROW_H * 2, "Scan", scanCount);
  drawLabelValue(OLED_BODY_Y + OLED_ROW_H * 3, "Mode", activeScanMode.length() > 0 ? activeScanMode.c_str() : "Manual");
  drawFooter("OK: Menu", isDeviceProvisioned() ? "Ready" : "Prov");
  display.display();
}

void drawMenuList(const char* title, const char* const* items, uint8_t count, uint8_t selected) {
  if (!oledAvailable) return;
  oledBeginFrame();
  drawHeader(title);
  uint8_t visibleCount = count < 5 ? count : 5;
  uint8_t startIndex = 0;
  if (count > visibleCount && selected >= visibleCount) {
    startIndex = selected - visibleCount + 1;
  }
  for (uint8_t row = 0; row < visibleCount; row++) {
    uint8_t i = startIndex + row;
    int y = OLED_BODY_Y + row * 9;
    char item[24];
    fitText(items[i], item, sizeof(item), 18);
    if (i == selected) {
      display.fillRect(0, y - 1, SCREEN_WIDTH, 9, SSD1306_WHITE);
      display.setTextColor(SSD1306_BLACK, SSD1306_WHITE);
    } else {
      display.setTextColor(SSD1306_WHITE);
    }
    display.setCursor(2, y);
    display.print(i == selected ? "> " : "  ");
    display.print(item);
  }
  display.setTextColor(SSD1306_WHITE);
  display.display();
}

void oledShowMainMenu() {
  static const char* const items[] = {"Mode Scanner", "Status Device", "Battery", "WiFi Info", "Restart", "Tampilan Awal"};
  drawMenuList("MENU", items, MAIN_MENU_COUNT, mainMenuIndex);
}

void oledShowModeMenu() {
  static const char* const items[] = {"Manual", "Auto IN", "Auto OUT", "Kembali"};
  drawMenuList("PILIH MODE", items, MODE_MENU_COUNT, modeMenuIndex);
}

void oledShowBatteryMenu() {
  if (!oledAvailable) return;
  oledBeginFrame();
  drawHeader("BATTERY", "ADC CALIBRATED");
  int level = readBatteryLevel();
  drawBatteryIcon(112, 1, level);
  drawLabelValueInt(OLED_BODY_Y, "Level", level, "%");
  drawLabelValueInt(OLED_BODY_Y + OLED_ROW_H, "Max", getBatteryMaxMv(), "mV");
  drawLabelValue(OLED_BODY_Y + OLED_ROW_H * 2, "Min", "3200mV");
  drawFooter("OK: Kalibrasi", "UP Back");
  display.display();
}

void oledShowWiFiMenu() {
  if (!oledAvailable) return;
  oledBeginFrame();
  drawHeader("WIFI INFO", isWiFiConnected ? "TERHUBUNG" : "TERPUTUS");
  if (isWiFiConnected) {
    char ssid[24];
    char ip[16];
    char rssi[12];
    int signal = WiFi.RSSI();
    fitText(wifiConfig.ssid, ssid, sizeof(ssid), 15);
    formatIpAddress(WiFi.localIP(), ip, sizeof(ip));
    snprintf(rssi, sizeof(rssi), "%d dBm", signal);
    drawLabelValue(OLED_BODY_Y, "SSID", ssid);
    drawLabelValue(OLED_BODY_Y + OLED_ROW_H, "RSSI", rssi);
    drawLabelValue(OLED_BODY_Y + OLED_ROW_H * 2, "IP", ip);
    drawWifiIcon(116, OLED_BODY_Y + OLED_ROW_H + 2, signal);
  } else {
    drawLabelValue(OLED_BODY_Y, "SSID", wifiConfig.isValid ? wifiConfig.ssid : "Belum ada");
    drawLabelValue(OLED_BODY_Y + OLED_ROW_H, "Status", "Offline");
    drawLabelValue(OLED_BODY_Y + OLED_ROW_H * 2, "IP", "--");
  }
  drawFooter("UP/DOWN", "OK");
  display.display();
}

void oledShowDeviceStatusMenu() {
  if (!oledAvailable) return;
  oledBeginFrame();
  drawHeader("DEVICE STATUS", deviceConfig.deviceId);
  drawLabelValue(OLED_BODY_Y, "FW", FIRMWARE_VERSION);
  drawLabelValueInt(OLED_BODY_Y + OLED_ROW_H, "Heap", ESP.getFreeHeap() / 1024, "KB");
  drawLabelValueInt(OLED_BODY_Y + OLED_ROW_H * 2, "Uptime", (millis() - bootTime) / 1000, "s");
  drawLabelValue(OLED_BODY_Y + OLED_ROW_H * 3, "Mode", activeScanMode.c_str());
  display.display();
}

void oledShowRestartConfirm() {
  static const char* const items[] = {"Tidak", "Ya"};
  drawMenuList("RESTART?", items, 2, restartMenuIndex);
}

void oledShowBatteryCalConfirm() {
  static const char* const items[] = {"Tidak", "Ya, kalibrasi"};
  drawMenuList("KALIBRASI BATERAI?", items, CONFIRM_MENU_COUNT, batteryCalMenuIndex);
}

void oledShowScreenSaver() {
  if (!oledAvailable) return;
  oledBeginFrame();
  struct tm timeinfo;
  int drift = (millis() / 10000UL) % 3;
  if (getLocalTime(&timeinfo, 10)) {
    char timeBuf[9];
    char dateBuf[16];
    strftime(timeBuf, sizeof(timeBuf), "%H:%M", &timeinfo);
    strftime(dateBuf, sizeof(dateBuf), "%d/%m/%Y", &timeinfo);
    display.setTextSize(2);
    display.setCursor(24 + drift * 2, 10);
    display.print(timeBuf);
    display.setTextSize(1);
    drawCenteredText(34, dateBuf, 1);
  } else {
    display.setTextSize(2);
    display.setCursor(26 + drift * 2, 12);
    display.print("--:--");
    display.setTextSize(1);
    drawCenteredText(34, "Sinkron waktu", 1);
  }
  char bat[8];
  snprintf(bat, sizeof(bat), "%d%%", readBatteryLevel());
  drawFooter(activeScanMode.c_str(), bat);
  display.display();
}

void renderCurrentScreen() {
  if (!oledAvailable) return;
  switch (currentScreen) {
    case SCREEN_SAVER: oledShowScreenSaver(); break;
    case SCREEN_MAIN_MENU: oledShowMainMenu(); break;
    case SCREEN_MODE_MENU: oledShowModeMenu(); break;
    case SCREEN_BATTERY: oledShowBatteryMenu(); break;
    case SCREEN_WIFI: oledShowWiFiMenu(); break;
    case SCREEN_STATUS: oledShowDeviceStatusMenu(); break;
    case SCREEN_BATTERY_CAL_CONFIRM: oledShowBatteryCalConfirm(); break;
    case SCREEN_RESTART_CONFIRM: oledShowRestartConfirm(); break;
    case SCREEN_HOME:
    default: oledShowStatus(); break;
  }
}

void oledShowBarcode(const String& barcode, const String& itemName, bool sent) {
  if (!oledAvailable) return;
  oledBeginFrame();
  char codeLine[24];
  fitText(barcode, codeLine, sizeof(codeLine), OLED_TEXT_CHARS);
  drawHeader("BARCODE SCAN", codeLine);
  if (itemName.length() > 0) {
    char item[24];
    fitText(itemName, item, sizeof(item), 15);
    drawLabelValue(OLED_BODY_Y, "Item", item);
  } else {
    drawLabelValue(OLED_BODY_Y, "Item", "Tidak ditemukan");
  }
  drawLabelValue(OLED_BODY_Y + OLED_ROW_H, "Firebase", isOnline ? "Online" : "Offline");
  drawLabelValue(OLED_BODY_Y + OLED_ROW_H * 2, "Sync", sent ? "OK" : "Gagal");
  drawFooter(activeScanMode.c_str(), sent ? "Terkirim" : "Lokal");
  display.display();
  lastBarcodeOnOled = millis();
}

void oledShowInventoryFound(const String& name, int qty, int minStock) {
  if (!oledAvailable) return;
  oledBeginFrame();
  char item[24];
  fitText(name, item, sizeof(item), OLED_TEXT_CHARS);
  drawHeader("ITEM DITEMUKAN", item);
  drawLabelValueInt(OLED_BODY_Y, "Stok", qty);
  drawLabelValueInt(OLED_BODY_Y + OLED_ROW_H, "Minimum", minStock);
  if (qty <= minStock) {
    drawLabelValue(OLED_BODY_Y + OLED_ROW_H * 2, "Status", "Stok menipis");
    drawFooter("Segera restock", "LOW");
  } else {
    drawLabelValue(OLED_BODY_Y + OLED_ROW_H * 2, "Status", "Aman");
    drawFooter("Inventory", "AMAN");
  }
  display.display();
  lastBarcodeOnOled = millis();
}

void oledShowAutoStockResult(const String& mode, const String& name, int beforeQty, int afterQty, bool ok, const String& message) {
  if (!oledAvailable) return;
  oledBeginFrame();
  char title[22];
  snprintf(title, sizeof(title), "%s %s", mode.c_str(), ok ? "OK" : "GAGAL");
  char item[24];
  fitText(name, item, sizeof(item), OLED_TEXT_CHARS);
  drawHeader(title, item);
  drawLabelValueInt(OLED_BODY_Y, "Sebelum", beforeQty);
  drawLabelValueInt(OLED_BODY_Y + OLED_ROW_H, "Sesudah", afterQty);
  char msg[24];
  fitText(message, msg, sizeof(msg), OLED_TEXT_CHARS);
  drawLabelValue(OLED_BODY_Y + OLED_ROW_H * 2, "Info", msg);
  drawFooter("Auto Stock", ok ? "Simpan" : "Cek");
  display.display();
  lastBarcodeOnOled = millis();
}

void oledShowProductLookupSearching(const String& barcode) {
  if (!oledAvailable) return;
  oledBeginFrame();
  char codeLine[24];
  fitText(barcode, codeLine, sizeof(codeLine), OLED_TEXT_CHARS);
  drawHeader("DATA BARANG", codeLine);
  drawLabelValue(OLED_BODY_Y, "Status", "Mencari");
  drawLabelValue(OLED_BODY_Y + OLED_ROW_H, "Sumber", "Web catalog");
  drawFooter("Mohon tunggu", "Lookup");
  display.display();
  lastBarcodeOnOled = millis();
}

void oledShowProductLookupFound(const String& name, const String& category) {
  if (!oledAvailable) return;
  oledBeginFrame();
  char item[24];
  char cat[24];
  fitText(name, item, sizeof(item), OLED_TEXT_CHARS);
  fitText(category, cat, sizeof(cat), OLED_TEXT_CHARS);
  drawHeader("DATA DITEMUKAN", "CATALOG");
  drawLabelValue(OLED_BODY_Y, "Item", item);
  drawLabelValue(OLED_BODY_Y + OLED_ROW_H, "Kategori", cat);
  drawFooter("Cek form web", "OK");
  display.display();
  lastBarcodeOnOled = millis();
}

void oledShowProductLookupNotFound(const String& barcode, const String& message) {
  if (!oledAvailable) return;
  oledBeginFrame();
  char codeLine[24];
  char msg[24];
  fitText(barcode, codeLine, sizeof(codeLine), OLED_TEXT_CHARS);
  fitText(message.length() > 0 ? message.c_str() : "Isi manual di web", msg, sizeof(msg), OLED_TEXT_CHARS);
  drawHeader("DATA TIDAK ADA", codeLine);
  drawLabelValue(OLED_BODY_Y, "Status", msg);
  drawLabelValue(OLED_BODY_Y + OLED_ROW_H, "Aksi", "Tambah via web");
  drawFooter("Popup dashboard", "Manual");
  display.display();
  lastBarcodeOnOled = millis();
}

void oledShowWiFiConnecting(const char* ssid) {
  if (!oledAvailable) return;
  oledBeginFrame();
  char name[24];
  fitText(ssid, name, sizeof(name), OLED_TEXT_CHARS);
  drawHeader("CONNECTING WIFI", name);
  drawLabelValue(OLED_BODY_Y, "Status", "Menghubungkan");
  drawLabelValue(OLED_BODY_Y + OLED_ROW_H, "Timeout", "10 detik");
  drawFooter("Non-blocking", "WiFi");
  display.display();
}

void oledShowWiFiConnected(const char* ip) {
  if (!oledAvailable) return;
  oledBeginFrame();
  drawHeader("WIFI CONNECTED", ip);
  drawLabelValue(OLED_BODY_Y, "SSID", wifiConfig.ssid);
  drawLabelValue(OLED_BODY_Y + OLED_ROW_H, "Mode", "Inventory");
  drawLabelValue(OLED_BODY_Y + OLED_ROW_H * 2, "Firebase", isDeviceProvisioned() ? "Auth pending" : "Provision");
  drawFooter("Scanner aktif", "OK");
  display.display();
  lastBarcodeOnOled = millis();
}

void oledShowNoWiFi() {
  if (!oledAvailable) return;
  oledBeginFrame();
  drawHeader("ESP32 SCANNER", "WIFI BELUM SIAP");
  drawLabelValue(OLED_BODY_Y, "Aksi", "Scan QR WiFi");
  drawLabelValue(OLED_BODY_Y + OLED_ROW_H, "Format", "WIFI:S:...");
  drawFooter("Tunggu barcode", "Setup");
  display.display();
}

void oledShowAuthError() {
  if (!oledAvailable) return;
  oledBeginFrame();
  drawHeader("AUTH ERROR", "KREDENSIAL DITOLAK");
  drawLabelValue(OLED_BODY_Y, "Status", "Token invalid");
  drawLabelValue(OLED_BODY_Y + OLED_ROW_H, "Aksi", "Rotasi admin");
  drawFooter("Scan credential", "Auth");
  display.display();
  lastBarcodeOnOled = millis();
}

void oledShowProvisioningPin() {
  if (!oledAvailable) return;
  oledBeginFrame();
  drawHeader("PROVISIONING", deviceConfig.deviceId);
  if (isWiFiConnected) {
    drawLabelValue(OLED_BODY_Y, "Admin", "Daftar device");
    drawLabelValue(OLED_BODY_Y + OLED_ROW_H, "Scan", "Credential PDF417");
    drawLabelValue(OLED_BODY_Y + OLED_ROW_H * 2, "PIN", provisioningPin.c_str());
    drawFooter("Menunggu auth", "Ready");
  } else {
    drawLabelValue(OLED_BODY_Y, "Aksi", "Scan QR WiFi");
    drawLabelValue(OLED_BODY_Y + OLED_ROW_H, "Device", deviceConfig.deviceId);
    drawFooter("WiFi required", "Setup");
  }
  display.display();
}

void oledShowProvisioningSuccess() {
  if (!oledAvailable) return;
  oledBeginFrame();
  drawHeader("PROVISIONING OK", deviceConfig.deviceId);
  drawLabelValue(OLED_BODY_Y, "Firebase", "Terhubung");
  drawLabelValue(OLED_BODY_Y + OLED_ROW_H, "Scanner", "Siap dipakai");
  drawFooter("Inventory", "Ready");
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
  if (millis() - lastOledRefresh   < 1000) return;
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
  if (currentScreen == SCREEN_HOME && millis() - lastUiInteraction > SCREEN_SAVER_TIMEOUT_MS) {
    currentScreen = SCREEN_SAVER;
  }
  renderCurrentScreen();
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
  if (WiFi.status() == WL_CONNECTED) {
    onWiFiConnected();
    return true;
  }

  unsigned long now = millis();
  if (wifiConnectState == WIFI_CONN_CONNECTING &&
      now - wifiConnectStartedAt < WIFI_CONNECT_TIMEOUT_MS) {
    return false;
  }

  Serial.printf("Connecting WiFi: %s\n", wifiConfig.ssid);
  oledShowWiFiConnecting(wifiConfig.ssid);
  WiFi.disconnect(false);
  WiFi.begin(wifiConfig.ssid, wifiConfig.password);
  wifiConnectState = WIFI_CONN_CONNECTING;
  wifiConnectStartedAt = now;
  lastWiFiProgressAt = now;
  nextWiFiReconnectAt = now + WIFI_CONNECT_TIMEOUT_MS + WIFI_RECONNECT_INTERVAL_MS;
  return false;
}

void onWiFiConnected() {
  char ip[16];
  formatIpAddress(WiFi.localIP(), ip, sizeof(ip));
  bool wasDisconnected = !isWiFiConnected || wifiConnectState == WIFI_CONN_CONNECTING;
  wifiConnectState = WIFI_CONN_IDLE;
  nextWiFiReconnectAt = 0;
  isWiFiConnected = true;
  isOnline = true;
  if (wasDisconnected) {
    firebaseAuthPending = true;
    lastHeartbeat = 0;
    configTime(7 * 3600, 0, "pool.ntp.org");
    Serial.printf("\nWiFi OK: %s\n", ip);
    oledShowWiFiConnected(ip);
  }
}

void onWiFiDisconnected(bool showNoWiFiScreen) {
  if (isWiFiConnected) {
    Serial.println("WiFi putus, jadwalkan reconnect");
  }
  isWiFiConnected = false;
  isOnline = false;
  firebaseAuthPending = false;
  stopScanModeStream();
  if (showNoWiFiScreen) oledShowNoWiFi();
}

void serviceWiFiConnection() {
  if (WiFi.status() == WL_CONNECTED) {
    onWiFiConnected();
    if (firebaseAuthPending && isDeviceProvisioned()) {
      firebaseAuthPending = false;
      ensureFirebaseAuth();
    }
    return;
  }

  unsigned long now = millis();
  if (wifiConnectState == WIFI_CONN_CONNECTING) {
    if (now - lastWiFiProgressAt >= WIFI_PROGRESS_INTERVAL_MS) {
      Serial.print(".");
      lastWiFiProgressAt = now;
    }
    if (now - wifiConnectStartedAt >= WIFI_CONNECT_TIMEOUT_MS) {
      Serial.println("\nWiFi gagal");
      wifiConnectState = WIFI_CONN_IDLE;
      nextWiFiReconnectAt = now + WIFI_RECONNECT_INTERVAL_MS;
      onWiFiDisconnected(true);
    }
    return;
  }

  if (isWiFiConnected) {
    onWiFiDisconnected(false);
  }

  if (wifiConfig.isValid && strlen(wifiConfig.ssid) > 0 &&
      (nextWiFiReconnectAt == 0 || (long)(now - nextWiFiReconnectAt) >= 0)) {
    connectToWiFi();
  }
}

// Mengecek koneksi WiFi setiap 10 detik dan mencoba reconnect jika terputus.
// Saat koneksi putus, perangkat juga ditandai offline di Firebase bila memungkinkan.
void checkWiFiConnection() {
  serviceWiFiConnection();
}


// =============================================================================
//  FIREBASE FUNCTIONS
// =============================================================================

String urlEncode(const String& value) {
  String encoded = "";
  encoded.reserve(value.length() * 3);
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

String makeFirebaseKey(const char* prefix) {
  char buffer[48];
  snprintf(buffer, sizeof(buffer), "%s-%lu-%08lx",
           prefix, (unsigned long)millis(), (unsigned long)esp_random());
  return String(buffer);
}

String makeOperationId() {
  char buffer[72];
  snprintf(buffer, sizeof(buffer), "esp32-%s-%lu-%08lx",
           deviceConfig.deviceId, (unsigned long)millis(), (unsigned long)esp_random());
  return String(buffer);
}

void loadFirebaseRefreshToken() {
  firebaseRefreshToken = authPreferences.getString("refreshToken", "");
  firebaseIdToken = "";
  firebaseUserUid = "";
  firebaseTokenExpiresAt = 0;
  authRejected = false;
  Serial.println(firebaseRefreshToken.length() > 0 ?
    "Device auth refresh token loaded" :
    "Device auth belum diprovisikan");
}

void clearFirebaseAuth() {
  firebaseIdToken = "";
  firebaseRefreshToken = "";
  firebaseUserUid = "";
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
  WiFiClientSecure client;
  client.setInsecure();
  String url = "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=" +
               String(FIREBASE_WEB_API_KEY);
  http.begin(client, url);
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
  String previousUserUid = firebaseUserUid;
  unsigned long previousExpiresAt = firebaseTokenExpiresAt;
  unsigned long previousRetryAt = nextAuthRetryAt;
  uint8_t previousRetryCount = authRetryCount;
  bool previousAuthRejected = authRejected;

  firebaseIdToken = responseDoc["idToken"].as<String>();
  firebaseRefreshToken = responseDoc["refreshToken"].as<String>();
  firebaseUserUid = responseDoc["localId"].as<String>();
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
    firebaseUserUid = previousUserUid;
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
  WiFiClientSecure client;
  client.setInsecure();
  String url = "https://securetoken.googleapis.com/v1/token?key=" + String(FIREBASE_WEB_API_KEY);
  http.begin(client, url);
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
  firebaseUserUid = responseDoc["user_id"].as<String>();
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

String firebaseUrlWithAuth(const String& pathAndQuery) {
  if (!ensureFirebaseAuth()) return "";
  String delimiter = pathAndQuery.indexOf('?') >= 0 ? "&" : "?";
  String url;
  url.reserve(strlen(FIREBASE_DATABASE_URL) + pathAndQuery.length() + firebaseIdToken.length() + 8);
  url += FIREBASE_DATABASE_URL;
  url += pathAndQuery;
  url += delimiter;
  url += "auth=";
  url += firebaseIdToken;
  return url;
}

// Mengirim hasil scan barcode ke node /scans di Firebase Realtime Database.
// Auto mode yang sudah diproses di alat dikirim sebagai processed=true agar
// website tidak membuka popup stok kedua untuk scan yang sama.
bool sendScanToFirebase(const String& barcode, bool processed, bool itemFound, const String& itemId) {
  lastFirebaseScanId = "";
  if (!isWiFiConnected) {
    Serial.println("Tidak bisa kirim scan: no WiFi");
    return false;
  }
  HTTPClient http;
  String url = firebaseUrlWithAuth("/scans.json");
  if (url.length() == 0) return false;
  WiFiClientSecure client;
  client.setInsecure();
  http.begin(client, url);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(5000);

  DynamicJsonDocument doc(1024);
  doc["barcode"]   = barcode;
  doc["deviceId"]  = deviceConfig.deviceId;
  doc["location"]  = "Warehouse-Scanner";
  doc["mode"]      = "inventory";
  doc["scanMode"]  = activeScanMode;
  doc["processed"] = processed;
  doc["itemFound"] = itemFound;
  if (itemId.length() > 0) doc["itemId"] = itemId;
  doc["type"]      = "inventory_scan";
  JsonObject ts    = doc.createNestedObject("timestamp");
  ts[".sv"]        = "timestamp";

  String json;
  json.reserve(512);
  serializeJson(doc, json);
  Serial.print("POST /scans bytes=");
  Serial.println(json.length());

  int code = http.POST(json);
  bool ok  = (code >= 200 && code < 300);
  if (ok) {
    DynamicJsonDocument res(256); deserializeJson(res, http.getString());
    lastFirebaseScanId = res["name"].as<String>();
    Serial.print("Scan ID: ");
    Serial.println(lastFirebaseScanId);
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
InventoryItem lookupInventoryByBarcode(const String& barcode) {
  InventoryItem item;
  item.found = false;
  item.lookupOk = false;
  if (!isWiFiConnected) return item;

  HTTPClient http;
  String url = firebaseUrlWithAuth(
    "/inventory.json?orderBy=\"barcode\"&equalTo=\"" + urlEncode(barcode) + "\""
  );
  if (url.length() == 0) return item;
  WiFiClientSecure client;
  client.setInsecure();
  http.begin(client, url);
  http.setTimeout(5000);
  int code = http.GET();

  if (code == 200) {
    item.lookupOk = true;
    String body = http.getString();
    Serial.print("Inventory lookup bytes=");
    Serial.println(body.length());
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

bool adjustStockFromDevice(const InventoryItem& item, int delta) {
  if (!item.found || item.id.length() == 0 || (delta != 1 && delta != -1)) return false;
  if (!isWiFiConnected) return false;
  if (delta < 0 && item.quantity + delta < 0) {
    Serial.println("Auto stock ditolak: stok tidak cukup");
    return false;
  }
  if (firebaseUserUid.length() == 0 && !refreshFirebaseToken(true)) return false;
  if (firebaseUserUid.length() == 0) {
    Serial.println("Auto stock gagal: UID Firebase kosong");
    return false;
  }

  HTTPClient http;
  String url = firebaseUrlWithAuth("/.json");
  if (url.length() == 0) return false;
  WiFiClientSecure client;
  client.setInsecure();
  http.begin(client, url);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(7000);

  const bool stockIn = delta > 0;
  String txId = makeFirebaseKey("tx");
  String operationId = makeOperationId();
  DynamicJsonDocument doc(6144);

  String quantityPath = "inventory/" + item.id + "/quantity";
  JsonObject quantityOp = doc.createNestedObject(quantityPath);
  JsonObject quantitySv = quantityOp.createNestedObject(".sv");
  quantitySv["increment"] = delta;

  doc["inventory/" + item.id + "/operationId"] = operationId;
  doc["inventory/" + item.id + "/updatedByUid"] = firebaseUserUid;

  JsonObject lastUpdated = doc.createNestedObject("inventory/" + item.id + "/lastUpdated");
  lastUpdated[".sv"] = "timestamp";
  JsonObject updatedAt = doc.createNestedObject("inventory/" + item.id + "/updatedAt");
  updatedAt[".sv"] = "timestamp";

  String txPath = "transactions/" + txId;
  doc[txPath + "/id"] = txId;
  doc[txPath + "/type"] = stockIn ? "in" : "out";
  doc[txPath + "/productName"] = item.name;
  doc[txPath + "/productBarcode"] = item.barcode;
  doc[txPath + "/quantity"] = 1;
  doc[txPath + "/reason"] = stockIn ? "Auto IN dari scanner" : "Auto OUT dari scanner";
  doc[txPath + "/operator"] = "Scanner";
  doc[txPath + "/operatorUid"] = firebaseUserUid;
  doc[txPath + "/operationId"] = operationId;
  doc[txPath + "/notes"] = "Device " + String(deviceConfig.deviceId);
  JsonObject txTimestamp = doc.createNestedObject(txPath + "/timestamp");
  txTimestamp[".sv"] = "timestamp";

  String scanId = makeFirebaseKey("scan");
  String scanPath = "scans/" + scanId;
  doc[scanPath + "/barcode"] = item.barcode;
  doc[scanPath + "/deviceId"] = deviceConfig.deviceId;
  doc[scanPath + "/location"] = "Warehouse-Scanner";
  doc[scanPath + "/mode"] = "inventory";
  doc[scanPath + "/scanMode"] = activeScanMode;
  doc[scanPath + "/processed"] = true;
  doc[scanPath + "/itemFound"] = true;
  doc[scanPath + "/itemId"] = item.id;
  doc[scanPath + "/type"] = "inventory_scan";
  JsonObject scanTimestamp = doc.createNestedObject(scanPath + "/timestamp");
  scanTimestamp[".sv"] = "timestamp";

  String json;
  json.reserve(2048);
  serializeJson(doc, json);
  Serial.printf("PATCH auto stock: %s delta %d\n", item.id.c_str(), delta);

  int code = http.sendRequest("PATCH", json);
  bool ok = (code >= 200 && code < 300);
  if (ok) {
    lastFirebaseScanId = scanId;
    Serial.printf("Auto stock OK (HTTP %d)\n", code);
  } else {
    Serial.printf("Auto stock gagal (HTTP %d): %s\n", code, http.getString().c_str());
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
  WiFiClientSecure client;
  client.setInsecure();
  http.begin(client, url);
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
    sseClient.stop();
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
    + String(deviceConfig.deviceId) + ".json?auth=" + firebaseIdToken;

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
    if (code == 401 || code == 403) {
      firebaseIdToken = "";
      authRejected = true;
      scheduleAuthRetry();
    }
  }
}

void handleScanModeStream() {
  static String sseLineBuffer = "";
  static bool sseBufferReserved = false;
  if (!sseBufferReserved) {
    sseLineBuffer.reserve(2048);
    sseBufferReserved = true;
  }

  if (!isWiFiConnected) {
    stopScanModeStream();
    sseLineBuffer = "";
    return;
  }

  // Auto-reconnect if token changed
  if (sseConnected && sseTokenUsed != firebaseIdToken) {
    Serial.println("SSE: token changed, reconnecting...");
    stopScanModeStream();
    sseLineBuffer = "";
  }

  // Connect or reconnect if disconnected
  if (!sseConnected) {
    sseLineBuffer = "";
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
  if (sseStream) {
    while (sseStream->available() > 0) {
      char c = sseStream->read();
      if (c == '\n') {
        String line = sseLineBuffer;
        sseLineBuffer = "";
        line.trim();
        if (line.startsWith("data:")) {
          String jsonStr = line.substring(5);
          jsonStr.trim();
          if (jsonStr != "null") {
            DynamicJsonDocument doc(2048);
            DeserializationError err = deserializeJson(doc, jsonStr);
            if (!err) {
              String path = doc["path"] | "";
              if (path == "/") {
                if (doc["data"].is<JsonObject>()) {
                  JsonObject dataObj = doc["data"].as<JsonObject>();
                  // scanMode command is intentionally ignored: mode is controlled by physical buttons.
                  if (dataObj.containsKey("ota")) {
                    if (!dataObj["ota"].isNull()) {
                      Serial.println("OTA: ota field updated in stream root, queued...");
                      otaCheckRequested = true;
                    }
                  }
                  if (dataObj.containsKey("batteryCalibrate")) {
                    JsonObject cal = dataObj["batteryCalibrate"];
                    if (!cal.isNull() && cal["status"] == "pending") {
                      Serial.println("Battery calibration requested via stream root");
                      performBatteryCalibration(true);
                    }
                  }
                }
              } else if (path == "/scanMode") {
                // ignored: mode is controlled by physical buttons.
              } else if (path == "/ota") {
                if (!doc["data"].isNull()) {
                  Serial.println("OTA: ota field updated in stream child, queued...");
                  otaCheckRequested = true;
                }
              } else if (path == "/batteryCalibrate") {
                JsonObject cal = doc["data"];
                if (!cal.isNull() && cal["status"] == "pending") {
                  Serial.println("Battery calibration requested via stream child");
                  performBatteryCalibration(true);
                }
              }
            }
          }
        }
      } else if (c != '\r') {
        sseLineBuffer += c;
        if (sseLineBuffer.length() > 2048) {
          sseLineBuffer = "";
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
  WiFiClientSecure client;
  client.setInsecure();
  http.begin(client, url);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(5000);

  DynamicJsonDocument doc(512);
  char ip[16];
  formatIpAddress(WiFi.localIP(), ip, sizeof(ip));
  doc["status"]        = "online";
  doc["ipAddress"]     = ip;
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

  String json;
  json.reserve(384);
  serializeJson(doc, json);
  Serial.print("PUT /devices/");
  Serial.println(deviceConfig.deviceId);

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

void serviceHeartbeat(bool force) {
  if (!force && millis() - lastHeartbeat <= 5000) return;

  sampleBattery();  // read ADC BEFORE WiFi HTTP to avoid voltage sag noise
  if (isWiFiConnected) {
    bool hbOk = sendHeartbeatToFirebase();
    // First successful heartbeat after an OTA reboot confirms the new image.
    validateOtaBootSuccess(hbOk);
    if (hbOk) {
      lastHeartbeat = millis();
    } else {
      lastHeartbeat = millis() - 4000; // retry in ~1 detik
    }
  } else {
    lastHeartbeat = millis();
  }
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
  oledBeginFrame();
  drawHeader("FIRMWARE UPDATE", phase);
  char ver[24];
  snprintf(ver, sizeof(ver), "v%s", version.c_str());
  drawLabelValue(OLED_BODY_Y, "Versi", ver);
  drawLabelValue(OLED_BODY_Y + OLED_ROW_H, "Tahap", phase);
  if (progress >= 0) {
    display.drawRect(0, 41, 128, 10, SSD1306_WHITE);
    int w = (progress > 100 ? 100 : progress) * 126 / 100;
    display.fillRect(1, 42, w, 8, SSD1306_WHITE);
    char pct[8];
    snprintf(pct, sizeof(pct), "%d%%", progress);
    drawFooter("OTA", pct);
  } else {
    drawFooter("OTA", "Wait");
  }
  display.display();
}

// Menulis status OTA ke /deviceOtaStatus/{deviceId} agar panel admin dapat memantau.
void reportOtaStatus(const char* phase, const String& version, int progress, const String& message) {
  if (!isWiFiConnected) return;
  HTTPClient http;
  String url = firebaseUrlWithAuth("/deviceOtaStatus/" + String(deviceConfig.deviceId) + ".json");
  if (url.length() == 0) return;
  WiFiClientSecure client;
  client.setInsecure();
  http.begin(client, url);
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
  // Bebaskan TLS/socket SSE sebelum download OTA; ESP32 heap ketat saat 2 HTTPS aktif.
  stopScanModeStream();
  yield();
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
      yield();
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
    yield();
    int pct = (int)(written * 100 / total);
    if (pct != lastPct && pct % 5 == 0) {
      lastPct = pct;
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
  delay(250);
  ESP.restart();
}

// Polls /deviceCommands/{deviceId}/ota and runs an update when one is pending.
// Idempotent: a command already succeeded or failed (by id) is not re-run; gated
// commands are reported as deferred until idle+battery preconditions are met.
void checkForOtaCommand(bool force) {
  if (otaInProgress) return;
  if (!isWiFiConnected) return;
  if (!force && (millis() - lastOtaCheck < OTA_CHECK_INTERVAL_MS)) return;
  lastOtaCheck = millis();

  HTTPClient http;
  String url = firebaseUrlWithAuth("/deviceCommands/" + String(deviceConfig.deviceId) + "/ota.json");
  if (url.length() == 0) return;
  WiFiClientSecure client;
  client.setInsecure();
  http.begin(client, url);
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
    delay(250);
    if (Update.canRollBack() && Update.rollBack()) {
      ESP.restart();
    }
  }
}


// =============================================================================
//  BARCODE PROCESSING
// =============================================================================
// Memproses barcode inventory. Mode Manual tetap mengirim scan untuk popup web.
// Mode Auto IN/OUT bekerja standalone: alat menambah/mengurangi stok dan membuat
// transaksi langsung ke RTDB tanpa perlu dashboard terbuka.
void processInventoryBarcode(const String& barcode) {
  Serial.print("Inventory barcode: ");
  Serial.println(barcode);

  bool autoMode = activeScanMode == "Auto IN" || activeScanMode == "Auto OUT";

  if (autoMode) {
    InventoryItem item = lookupInventoryByBarcode(barcode);
    if (item.found) {
      pendingLookupScanId = "";
      pendingLookupBarcode = "";
      int delta = activeScanMode == "Auto IN" ? 1 : -1;
      int afterQty = item.quantity + delta;
      bool stockEnough = afterQty >= 0;
      bool adjusted = false;
      if (stockEnough) {
        adjusted = adjustStockFromDevice(item, delta);
        if (!adjusted) afterQty = item.quantity;
      } else {
        afterQty = item.quantity;
      }

      if (!adjusted) {
        sendScanToFirebase(barcode, !stockEnough, true, item.id);
      }
      oledShowAutoStockResult(
        activeScanMode,
        item.name,
        item.quantity,
        afterQty,
        adjusted,
        !stockEnough ? "Stok tidak cukup" : (adjusted ? "Transaksi tersimpan" : "Sync gagal")
      );
      return;
    }

    if (!item.lookupOk) {
      oledShowBarcode(barcode, "", false);
      return;
    }

    bool sent = sendScanToFirebase(barcode);
    if (sent && lastFirebaseScanId.length() > 0) {
      pendingLookupScanId = lastFirebaseScanId;
      pendingLookupBarcode = barcode;
      pendingLookupDeadline = millis() + LOOKUP_TIMEOUT_MS;
      lastLookupPoll = 0;
      oledShowProductLookupSearching(barcode);
    } else {
      oledShowBarcode(barcode, "", sent);
    }
    return;
  }

  // POST ke /scans dulu agar website popup muncul cepat pada mode Manual.
  bool sent = sendScanToFirebase(barcode);
  if (!sent) {
    oledShowBarcode(barcode, "", false);
    return;
  }

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
  lastUiInteraction = millis();
  if (currentScreen == SCREEN_SAVER) currentScreen = SCREEN_HOME;

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
      wifiConnectState = WIFI_CONN_IDLE;
      nextWiFiReconnectAt = 0;
      WiFi.disconnect(false);
      connectToWiFi();
    }
    return;
  }

  Serial.print("Input: ");
  Serial.println(input);
  lastScanTime = millis();
  scanCount++;
  processInventoryBarcode(input);
  serviceHeartbeat(false);
}


// =============================================================================
//  BUTTON UI
// =============================================================================

void initButtons() {
  pinMode(BTN_UP_PIN, INPUT_PULLUP);
  pinMode(BTN_OK_PIN, INPUT_PULLUP);
  pinMode(BTN_DOWN_PIN, INPUT_PULLUP);
  btnUp.lastReading = digitalRead(BTN_UP_PIN) == LOW;
  btnOk.lastReading = digitalRead(BTN_OK_PIN) == LOW;
  btnDown.lastReading = digitalRead(BTN_DOWN_PIN) == LOW;
  lastUiInteraction = millis();
}

ButtonEvent readButton(ButtonState &button, ButtonEvent shortEvent, ButtonEvent longEvent) {
  bool reading = digitalRead(button.pin) == LOW;
  unsigned long now = millis();
  if (reading != button.lastReading) {
    button.lastReading = reading;
    button.lastChange = now;
  }
  if (now - button.lastChange < BUTTON_DEBOUNCE_MS) return BTN_NONE;
  if (reading != button.stablePressed) {
    button.stablePressed = reading;
    if (reading) {
      button.pressedAt = now;
      button.longFired = false;
    } else if (!button.longFired) {
      return shortEvent;
    }
  }
  if (button.stablePressed && !button.longFired && now - button.pressedAt >= BUTTON_LONG_MS) {
    button.longFired = true;
    return longEvent;
  }
  return BTN_NONE;
}

void setScanModeFromDevice(const String& mode) {
  if (mode != "Manual" && mode != "Auto IN" && mode != "Auto OUT") return;
  bool changed = mode != activeScanMode;
  if (changed) activeScanMode = mode;
  currentScreen = SCREEN_HOME;
  lastUiInteraction = millis();
  if (changed) lastHeartbeat = 0;
  lastOledRefresh = 0;
  Serial.print("Scan mode (button): ");
  Serial.println(activeScanMode);
}

void handleUiEvent(ButtonEvent event) {
  if (event == BTN_NONE) return;
  if (event == BTN_OK_LONG) event = BTN_OK_SHORT;
  else if (event == BTN_UP_LONG) event = BTN_UP_SHORT;
  else if (event == BTN_DOWN_LONG) event = BTN_DOWN_SHORT;

  lastUiInteraction = millis();
  if (currentScreen == SCREEN_SAVER) currentScreen = SCREEN_HOME;

  switch (currentScreen) {
    case SCREEN_HOME:
      if (event == BTN_OK_SHORT) currentScreen = SCREEN_MAIN_MENU;
      break;
    case SCREEN_MAIN_MENU:
      if (event == BTN_UP_SHORT) mainMenuIndex = (mainMenuIndex + MAIN_MENU_COUNT - 1) % MAIN_MENU_COUNT;
      else if (event == BTN_DOWN_SHORT) mainMenuIndex = (mainMenuIndex + 1) % MAIN_MENU_COUNT;
      else if (event == BTN_OK_SHORT) {
        if (mainMenuIndex == 0) {
          modeMenuIndex = activeScanMode == "Auto IN" ? 1 : activeScanMode == "Auto OUT" ? 2 : 0;
          currentScreen = SCREEN_MODE_MENU;
        } else if (mainMenuIndex == 1) currentScreen = SCREEN_STATUS;
        else if (mainMenuIndex == 2) currentScreen = SCREEN_BATTERY;
        else if (mainMenuIndex == 3) currentScreen = SCREEN_WIFI;
        else if (mainMenuIndex == 4) currentScreen = SCREEN_RESTART_CONFIRM;
        else currentScreen = SCREEN_HOME;
      }
      break;
    case SCREEN_MODE_MENU:
      if (event == BTN_UP_SHORT) modeMenuIndex = (modeMenuIndex + MODE_MENU_COUNT - 1) % MODE_MENU_COUNT;
      else if (event == BTN_DOWN_SHORT) modeMenuIndex = (modeMenuIndex + 1) % MODE_MENU_COUNT;
      else if (event == BTN_OK_SHORT) {
        if (modeMenuIndex == 3) currentScreen = SCREEN_MAIN_MENU;
        else setScanModeFromDevice(modeMenuIndex == 0 ? "Manual" : modeMenuIndex == 1 ? "Auto IN" : "Auto OUT");
      }
      break;
    case SCREEN_BATTERY:
      if (event == BTN_UP_SHORT || event == BTN_DOWN_SHORT) {
        currentScreen = SCREEN_MAIN_MENU;
      } else if (event == BTN_OK_SHORT) {
        batteryCalMenuIndex = 0;
        currentScreen = SCREEN_BATTERY_CAL_CONFIRM;
      }
      break;
    case SCREEN_BATTERY_CAL_CONFIRM:
      if (event == BTN_UP_SHORT || event == BTN_DOWN_SHORT) {
        batteryCalMenuIndex = batteryCalMenuIndex == 0 ? 1 : 0;
      } else if (event == BTN_OK_SHORT) {
        if (batteryCalMenuIndex == 1) {
          performBatteryCalibration();
          currentScreen = SCREEN_BATTERY;
          lastOledRefresh = millis();
          return;
        } else {
          currentScreen = SCREEN_BATTERY;
        }
      }
      break;
    case SCREEN_RESTART_CONFIRM:
      if (event == BTN_UP_SHORT || event == BTN_DOWN_SHORT) restartMenuIndex = restartMenuIndex == 0 ? 1 : 0;
      else if (event == BTN_OK_SHORT) {
        if (restartMenuIndex == 1) ESP.restart();
        currentScreen = SCREEN_MAIN_MENU;
      }
      break;
    default:
      if (event == BTN_OK_SHORT) currentScreen = SCREEN_MAIN_MENU;
      break;
  }
  lastOledRefresh = 0;
  renderCurrentScreen();
}

void handleButtons() {
  if (digitalRead(BTN_UP_PIN) == LOW || digitalRead(BTN_OK_PIN) == LOW || digitalRead(BTN_DOWN_PIN) == LOW) {
    lastUiInteraction = millis();
    if (currentScreen == SCREEN_SAVER) currentScreen = SCREEN_HOME;
  }

  ButtonEvent upEvent = readButton(btnUp, BTN_UP_SHORT, BTN_UP_LONG);
  ButtonEvent okEvent = readButton(btnOk, BTN_OK_SHORT, BTN_OK_LONG);
  ButtonEvent downEvent = readButton(btnDown, BTN_DOWN_SHORT, BTN_DOWN_LONG);
  ButtonEvent event = okEvent != BTN_NONE ? okEvent : (upEvent != BTN_NONE ? upEvent : downEvent);
  handleUiEvent(event);
}

void flushInputBuffer(char* buffer, size_t& length) {
  if (length == 0) return;
  buffer[length] = '\0';
  String input;
  input.reserve(length + 1);
  input = buffer;
  length = 0;
  buffer[0] = '\0';
  processBarcodeInput(input);
}

void handleInputStream(Stream& stream, char* buffer, size_t& length, unsigned long& lastCharTime) {
  while (stream.available() > 0) {
    char c = stream.read();
    unsigned long now = millis();
    lastCharTime = now;
    if (c == '\n' || c == '\r') {
      flushInputBuffer(buffer, length);
      continue;
    }
    if (length < SERIAL_INPUT_MAX) {
      buffer[length++] = c;
      buffer[length] = '\0';
    } else {
      Serial.println("Input barcode terlalu panjang, buffer direset");
      length = 0;
      buffer[0] = '\0';
    }
  }

  if (length > 0 && millis() - lastCharTime > SERIAL_IDLE_FLUSH_MS) {
    flushInputBuffer(buffer, length);
  }
}

void reserveRuntimeStrings() {
  firebaseIdToken.reserve(1400);
  firebaseRefreshToken.reserve(512);
  firebaseUserUid.reserve(80);
  provisioningPin.reserve(8);
  lastFirebaseScanId.reserve(32);
  pendingLookupScanId.reserve(32);
  pendingLookupBarcode.reserve(64);
  activeScanMode.reserve(10);
  sseTokenUsed.reserve(1400);
  otaActiveCommandId.reserve(80);
  otaLastFailedId.reserve(80);
}


// =============================================================================
//  SETUP & LOOP
// =============================================================================
// Fungsi setup Arduino yang berjalan sekali saat perangkat boot.
// Menginisialisasi serial, OLED, EEPROM, WiFi, web server, ADC baterai, dan state awal.
void setup() {
  Serial.begin(115200);
  Serial2.begin(9600, SERIAL_8N1, RXD2, TXD2);
  reserveRuntimeStrings();
  yield();
  bootTime = millis();
  activeScanMode = "Manual";
  initButtons();

  initOLED();
  oledShowBoot();
  provisioningPin = String(100000 + (esp_random() % 900000));
  Serial.print("Provisioning PIN: ");
  Serial.println(provisioningPin);

  Serial.println("\nESP32 GM67 Scanner v" FIRMWARE_VERSION " - Inventory Only");
  Serial.println("=========================================");
  Serial.println("Firebase: barcodescanesp32");
  Serial.println("Paths: /scans /devices /inventory /analytics");
  Serial.print("OLED: ");
  Serial.println(oledAvailable ? "OK" : "NOT FOUND");

  EEPROM.begin(EEPROM_SIZE);
  authPreferences.begin("deviceAuth", false);
  batCalibPrefs.begin("batCalib", false);
  otaPreferences.begin("deviceOta", false);
  loadWiFiConfig();
  loadDeviceConfig();
  loadFirebaseRefreshToken();
  if (!isDeviceProvisioned()) {
    oledShowProvisioningPin();
  }

  // Fast WiFi init — persistent=false cegah tulis flash, lebih cepat boot
  WiFi.persistent(false);
  WiFi.setAutoReconnect(true);
  WiFi.mode(WIFI_STA);

  if (wifiConfig.isValid) {
    connectToWiFi();
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
// Menangani reconnect WiFi, input barcode, heartbeat Firebase, dan refresh OLED.
void loop() {
  handleButtons();
  checkWiFiConnection();

  static char serial2Buffer[SERIAL_INPUT_MAX + 1] = {0};
  static size_t serial2Length = 0;
  static unsigned long lastSerial2CharTime = 0;
  handleInputStream(Serial2, serial2Buffer, serial2Length, lastSerial2CharTime);

  static char serialBuffer[SERIAL_INPUT_MAX + 1] = {0};
  static size_t serialLength = 0;
  static unsigned long lastSerialCharTime = 0;
  handleInputStream(Serial, serialBuffer, serialLength, lastSerialCharTime);

  serviceHeartbeat(false);

  checkDeviceLookupStatus();
  handleScanModeStream();

  if (otaCheckRequested) {
    otaCheckRequested = false;
    checkForOtaCommand(true);
  }

  // Poll for a pending OTA command; gated internally on idle + battery.
  checkForOtaCommand(false);

  oledUpdateIdle();
  yield();
}
