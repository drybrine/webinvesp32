#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// WiFi credentials
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

// Server configuration
const char* serverUrl = "https://your-vercel-app.vercel.app"; // Replace with your actual domain
const char* barcodeEndpoint = "/api/barcode-scan";
const char* heartbeatEndpoint = "/api/heartbeat";

// Device configuration
String deviceId = "ESP32_001"; // Unique ID for this device
unsigned long bootTime = 0;
unsigned long lastHeartbeat = 0;
const unsigned long heartbeatInterval = 30000; // Send heartbeat every 30 seconds
unsigned long scanCount = 0;

// Serial barcode scanner configuration
#define RXD2 16
#define TXD2 17
String barcodeBuffer = "";
bool newBarcodeAvailable = false;

void setup() {
  // Start serial communication
  Serial.begin(115200);
  Serial2.begin(9600, SERIAL_8N1, RXD2, TXD2); // For barcode scanner
  
  // Connect to WiFi
  WiFi.begin(ssid, password);
  Serial.print("Connecting to WiFi");
  
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  
  Serial.println("");
  Serial.println("WiFi connected");
  Serial.println("IP address: ");
  Serial.println(WiFi.localIP());
  
  // Record boot time
  bootTime = millis();
  
  // Send initial heartbeat
  sendHeartbeat();
}

void loop() {
  // Check for barcode data from scanner
  while (Serial2.available()) {
    char c = Serial2.read();
    
    // Check for end of barcode (usually CR or LF)
    if (c == '\r' || c == '\n') {
      if (barcodeBuffer.length() > 0) {
        newBarcodeAvailable = true;
      }
    } else {
      barcodeBuffer += c;
    }
  }
  
  // Process new barcode
  if (newBarcodeAvailable) {
    Serial.print("Barcode scanned: ");
    Serial.println(barcodeBuffer);
    
    // Send barcode to server
    sendBarcodeToServer(barcodeBuffer);
    
    // Clear buffer for next scan
    barcodeBuffer = "";
    newBarcodeAvailable = false;
  }
  
  // Send heartbeat periodically
  if (millis() - lastHeartbeat > heartbeatInterval) {
    sendHeartbeat();
  }
}

void sendBarcodeToServer(String barcode) {
  // Check WiFi connection
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi not connected. Reconnecting...");
    WiFi.reconnect();
    delay(5000);
    if (WiFi.status() != WL_CONNECTED) {
      Serial.println("Failed to reconnect to WiFi");
      return;
    }
  }
  
  HTTPClient http;
  String url = String(serverUrl) + barcodeEndpoint;
  
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  
  // Create JSON payload
  DynamicJsonDocument doc(1024);
  doc["barcode"] = barcode;
  doc["deviceId"] = deviceId;
  doc["timestamp"] = millis();
  
  String payload;
  serializeJson(doc, payload);
  
  // Send POST request
  int httpResponseCode = http.POST(payload);
  
  if (httpResponseCode > 0) {
    String response = http.getString();
    Serial.println("HTTP Response code: " + String(httpResponseCode));
    Serial.println("Response: " + response);
    
    // Parse response
    DynamicJsonDocument responseDoc(1024);
    DeserializationError error = deserializeJson(responseDoc, response);
    
    if (!error) {
      bool success = responseDoc["success"];
      if (success) {
        scanCount++;
        Serial.println("Barcode successfully sent to server");
      }
    }
  } else {
    Serial.println("Error sending barcode: " + String(httpResponseCode));
  }
  
  http.end();
}

void sendHeartbeat() {
  // Check WiFi connection
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi not connected. Reconnecting...");
    WiFi.reconnect();
    delay(5000);
    if (WiFi.status() != WL_CONNECTED) {
      Serial.println("Failed to reconnect to WiFi");
      return;
    }
  }
  
  HTTPClient http;
  String url = String(serverUrl) + heartbeatEndpoint;
  
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  
  // Create JSON payload
  DynamicJsonDocument doc(1024);
  doc["deviceId"] = deviceId;
  doc["uptime"] = millis() - bootTime;
  doc["freeHeap"] = ESP.getFreeHeap();
  doc["scanCount"] = scanCount;
  doc["version"] = "1.0.0";
  
  String payload;
  serializeJson(doc, payload);
  
  // Send POST request
  int httpResponseCode = http.POST(payload);
  
  if (httpResponseCode > 0) {
    String response = http.getString();
    Serial.println("Heartbeat sent. HTTP Response code: " + String(httpResponseCode));
    lastHeartbeat = millis();
  } else {
    Serial.println("Error sending heartbeat: " + String(httpResponseCode));
  }
  
  http.end();
}
