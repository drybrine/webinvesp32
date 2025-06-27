# 🔧 Manual Testing Guide - Device Status Fix

## 🎯 Testing Perbaikan Status Device

### **Problem**: Device menampilkan "Offline" padahal seharusnya "Online"

### **Testing Steps:**

#### 1. **Preparation**
```bash
# Start development server
npm run dev

# Open browser
http://localhost:3000/absensi
```

#### 2. **Manual Device Data Testing**

Untuk test tanpa ESP32 fisik, buka **Browser Console** (F12) dan run:

```javascript
// Simulate device data dengan status online
const testDeviceData = [
  {
    deviceId: "ESP32-5fbf713c",
    status: "online",
    ipAddress: "192.168.101.20",
    lastSeen: Date.now(), // Current timestamp
    scanCount: 3,
    uptime: 300000,
    version: "3.1"
  }
];

// Check detection logic
testDeviceData.forEach(device => {
  console.log('🧪 Testing device:', device.deviceId);
  console.log('Database status:', device.status);
  console.log('LastSeen timestamp:', device.lastSeen);
  console.log('Time diff:', Date.now() - device.lastSeen, 'ms');
});
```

#### 3. **Expected Results**

Dengan perbaikan yang dilakukan:

✅ **Database Status Priority:**
- Jika `device.status === "online"` → Should show **Online**
- Console log: `✅ Device ESP32-xxx: Database says ONLINE`

✅ **Threshold Check:**
- Jika timestamp < 2 menit yang lalu → Should show **Online**
- Console log: `🔄 Device ESP32-xxx: Timestamp override to ONLINE`

✅ **Visual Indicators:**
- Badge: `🟢 Online` (hijau)
- Icon: `Wifi` dengan background hijau
- Status: `Aktif sekarang`

#### 4. **Debug Console Logs**

Check di browser console untuk:
```
✅ Device ESP32-5fbf713c: Database says ONLINE
🔍 Device ESP32-5fbf713c: DB=online, timeDiff=5s
📊 Current devices data: [{...}]
📱 Device ESP32-5fbf713c: {status: "online", lastSeen: 1640000000000}
```

#### 5. **Offline Test**

Untuk test offline detection:
```javascript
// Simulate old timestamp (more than 2 minutes ago)
const offlineDevice = {
  deviceId: "ESP32-test",
  status: "offline", 
  lastSeen: Date.now() - (3 * 60 * 1000), // 3 minutes ago
  // ... other fields
};
```

Expected: Should show **🔴 Offline**

## 🔍 Troubleshooting

### **If still showing Offline:**

1. **Check console logs** - Debug messages should appear
2. **Verify device data structure** - All required fields present
3. **Check timestamp format** - Should be number (milliseconds)
4. **Refresh manually** - Click refresh button to force update

### **Firebase Connection Issues:**

If using local development without Firebase:
- Device data will use mock data from localStorage
- Simulate heartbeat won't work (returns "Firebase not available")
- But status logic should still work correctly

## ✅ Success Criteria

Device status fix is working if:

1. ✅ Console shows debug logs
2. ✅ Device with `status: "online"` shows as Online
3. ✅ Recent timestamp overrides offline status  
4. ✅ Visual indicators match actual status
5. ✅ No false offline detection

---

## 🎯 Key Changes Made

1. **Priority Logic**: Database status checked first
2. **Reasonable Threshold**: 2 minutes instead of 45 seconds
3. **Better Parsing**: Multiple timestamp format support
4. **Rich Debugging**: Console logs for troubleshooting
5. **Fallback Handling**: Proper error handling

**Status: Ready for testing! 🚀**
