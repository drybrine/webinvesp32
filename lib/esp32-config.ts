// ESP32 Configuration Constants - matching GM67_ESP32_BARCODESCANNER.ino exactly

export const ESP32_CONFIG = {
  // Default Firebase URL from ESP32 .ino file
  FIREBASE_URL: "https://barcodescanesp32-default-rtdb.asia-southeast1.firebasedatabase.app",
  
  // Default Server URL from ESP32 .ino file
  SERVER_URL: "https://stokmanager.vercel.app/",
  
  // Default location from ESP32 .ino file
  DEFAULT_LOCATION: "Warehouse-Scanner",
  
  // Firebase project from ESP32 .ino file
  FIREBASE_PROJECT: "barcodescanesp32",
  
  // Scanner modes from ESP32 .ino enum
  MODES: {
    INVENTORY: "inventory"
  },
  
  // Scan types from ESP32 .ino file
  SCAN_TYPES: {
    INVENTORY: "inventory_scan"
  },
  
  // Device ID pattern from ESP32 .ino: "ESP32-" + MAC address
  DEVICE_ID_PATTERN: /^ESP32-[0-9A-Fa-f]+$/,
  
  // Version from ESP32 .ino file
  VERSION: "3.3",
  
  // Heartbeat interval from ESP32 .ino (optimized to 3 seconds)
  HEARTBEAT_INTERVAL: 3000,
  
  // WiFi check interval from ESP32 .ino (optimized to 5 seconds)
  WIFI_CHECK_INTERVAL: 5000,
  
  // Timeout values from ESP32 .ino (optimized)
  TIMEOUTS: {
    FIREBASE_HTTP: 5000,  // 5 seconds for scans (faster)
    HEARTBEAT: 2000,      // 2 seconds for heartbeat (faster)
  },
  
  // EEPROM addresses from ESP32 .ino
  EEPROM: {
    WIFI_CONFIG_ADDR: 0,
    DEVICE_CONFIG_ADDR: 512,
    SIZE: 1024
  }
} as const

// Helper functions matching ESP32 .ino logic
export const ESP32_HELPERS = {
  // Check if device ID matches ESP32 pattern from .ino
  isESP32Device: (deviceId?: string): boolean => {
    if (!deviceId) return false
    return ESP32_CONFIG.DEVICE_ID_PATTERN.test(deviceId) ||
           deviceId.toLowerCase().includes('esp32')
  },
  
  // Check if location matches ESP32 default from .ino
  isESP32Location: (location?: string): boolean => {
    if (!location) return false
    return location === ESP32_CONFIG.DEFAULT_LOCATION ||
           location.toLowerCase().includes('warehouse-scanner')
  },
  
  // Create scan data structure matching ESP32 .ino
  createScanData: (barcode: string, deviceId?: string, mode: string = ESP32_CONFIG.MODES.INVENTORY) => {
    return {
      barcode,
      deviceId: deviceId || `ESP32-TEST-${Date.now().toString(16).toUpperCase()}`,
      processed: false,
      location: ESP32_CONFIG.DEFAULT_LOCATION,
      mode,
      type: ESP32_CONFIG.SCAN_TYPES.INVENTORY,
      timestamp: Date.now(),
      source: deviceId || `test_esp32_${Date.now()}` // Add source field
    }
  },
  
  // Create heartbeat data structure matching ESP32 .ino
  createHeartbeatData: (deviceId: string) => {
    return {
      status: "online",
      version: ESP32_CONFIG.VERSION,
      lastHeartbeat: Date.now(),
      timestamp: Date.now()
    }
  }
} as const

export default ESP32_CONFIG
