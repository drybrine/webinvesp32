# Enhanced Device Status and Offline Detection System

## Overview

This document describes the enhanced device status monitoring system that ensures ESP32 devices are properly marked as "offline" in the database when they stop sending heartbeats.

## System Components

### 1. Device Status API (`/api/check-device-status/route.ts`)

**Purpose**: Updates device status in the Firebase database based on heartbeat timestamps.

**Key Features**:
- **2-minute timeout**: Devices are marked offline if no heartbeat received for 2+ minutes
- **Comprehensive logging**: Detailed logs for debugging and monitoring
- **Batch updates**: Efficient database updates for multiple devices
- **Internal call support**: Enhanced response data for internal monitoring
- **Timestamp handling**: Uses most recent timestamp from `lastHeartbeat` or `lastSeen`

**Logic**:
```typescript
// Device is considered offline if:
const shouldBeOffline = !mostRecentTimestamp || (now - mostRecentTimestamp) > 120000;

// Status updates are applied in batch:
if (shouldBeOffline && currentStatus !== "offline") {
  updates[`${deviceId}/status`] = "offline";
  updates[`${deviceId}/lastStatusUpdate`] = now;
}
```

### 2. Device Status Monitor (`/lib/device-status-monitor.ts`)

**Purpose**: Client-side background service that automatically calls the status API.

**Key Features**:
- **30-second intervals**: Checks device status every 30 seconds
- **Visibility handling**: Pauses when tab is hidden, resumes when visible
- **Event system**: Dispatches custom events when status updates occur
- **Auto-start/stop**: Automatically manages lifecycle
- **Error handling**: Graceful handling of network failures

**Usage**:
```typescript
// Auto-starts when imported in browser
import { startDeviceStatusMonitor } from '@/lib/device-status-monitor';

// Manual control
const monitor = startDeviceStatusMonitor();
monitor.stop();
```

### 3. Device Status Component (`/components/device-status.tsx`)

**Purpose**: Real-time UI component that displays device status.

**Key Features**:
- **30-second auto-refresh**: Updates display every 30 seconds
- **Event-driven updates**: Listens for status updates from background monitor
- **Smart status logic**: Prioritizes database status with timestamp fallback
- **Manual refresh**: Users can force refresh
- **Visual indicators**: Clear online/offline status display

**Status Logic**:
```typescript
const checkDeviceStatus = (device) => {
  // Prioritize database status if online
  if (device.status === "online") return "online";
  
  // Check timestamp for recent activity
  const timeDiff = now - lastSeenMs;
  if (timeDiff < 120000) return "online";
  
  return "offline";
};
```

### 4. Provider Integration (`/components/device-status-monitor-provider.tsx`)

**Purpose**: Ensures the background monitor runs application-wide.

**Integration**: Added to root layout to start monitor when app loads.

## Offline Detection Flow

### 1. Normal Operation
```
ESP32 → Heartbeat API → Database (status: online, lastHeartbeat: timestamp)
                    ↓
Background Monitor → Status Check API → No changes needed
                    ↓
UI Component → Shows "Online" status
```

### 2. Device Goes Offline
```
ESP32 stops sending heartbeats
                    ↓
Background Monitor (30s later) → Status Check API → Detects 2+ minute gap
                    ↓
Database updated (status: offline, lastStatusUpdate: timestamp)
                    ↓
Custom event dispatched → UI Component refreshes → Shows "Offline" status
```

### 3. Device Comes Back Online
```
ESP32 resumes heartbeats → Database (status: online, lastHeartbeat: new timestamp)
                        ↓
Background Monitor → Status Check API → Detects recent heartbeat
                        ↓
Database confirmed online → UI Component → Shows "Online" status
```

## Configuration

### Timeout Settings
- **Offline Timeout**: 120,000ms (2 minutes)
- **Monitor Interval**: 30,000ms (30 seconds)
- **UI Refresh**: 30,000ms (30 seconds)

### API Endpoints
- **Heartbeat**: `POST /api/heartbeat` (ESP32 → Server)
- **Status Check**: `POST /api/check-device-status` (Internal monitoring)

## Testing

### Manual Testing Script
Use `test-offline-detection.sh` to test the offline detection:

```bash
chmod +x test-offline-detection.sh
./test-offline-detection.sh
```

**Test Flow**:
1. Sends initial heartbeat to create device
2. Waits 3 minutes for device to go offline
3. Calls status check API to update database
4. Sends heartbeat to bring device back online
5. Verifies final status

### ESP32 Simulation
Use `simulate-esp32-heartbeat.sh` to simulate a real ESP32:

```bash
chmod +x simulate-esp32-heartbeat.sh
./simulate-esp32-heartbeat.sh
```

## Monitoring and Debugging

### Console Logs
The system provides comprehensive logging:

```javascript
// Device status monitor
console.log('🔍 Running automated device status check...');
console.log('📱 Device status updates: 2 devices (1 online, 1 offline)');

// API calls
console.log('⚠️ Setting device ESP32-ABC123 to OFFLINE - last seen: 2024-01-01T10:00:00Z, time diff: 180s');
console.log('✅ Setting device ESP32-XYZ789 to ONLINE - last seen: 2024-01-01T10:02:30Z');

// UI components
console.log('📡 Received device status update from monitor:', event.detail);
```

### Firebase Database Structure
```json
{
  "devices": {
    "ESP32-ABC123": {
      "status": "offline",
      "lastHeartbeat": 1704110400000,
      "lastSeen": 1704110400000,
      "lastStatusUpdate": 1704110520000,
      "ipAddress": "192.168.1.100",
      "uptime": 3600000,
      "scanCount": 42
    }
  }
}
```

## Benefits

### 1. Reliability
- **Multiple checks**: Background monitor + UI refresh + manual refresh
- **Redundancy**: Multiple timestamp sources (lastHeartbeat, lastSeen)
- **Error recovery**: Graceful handling of network issues

### 2. Real-time Feel
- **30-second updates**: Quick detection of status changes
- **Event-driven**: Immediate UI updates when status changes
- **Visual feedback**: Clear indicators for online/offline status

### 3. Performance
- **Batch updates**: Efficient database operations
- **Background processing**: Non-blocking UI updates
- **Smart intervals**: Pauses when tab is hidden

### 4. User Experience
- **Auto-refresh indicators**: Users know when data updates
- **Manual refresh**: Users can force updates if needed
- **Clear status**: No ambiguous or conflicting status displays

## Troubleshooting

### Common Issues

1. **Device shows online but should be offline**
   - Check console logs for timestamp comparisons
   - Verify heartbeat API is not receiving ghost requests
   - Ensure status check API is running regularly

2. **Status not updating in UI**
   - Check if background monitor is running
   - Verify network connectivity
   - Look for JavaScript errors in console

3. **Slow offline detection**
   - Current system detects offline status within 30-150 seconds
   - Can reduce monitor interval if needed (but increases server load)

### Debug Commands
```javascript
// Check monitor status
getDeviceStatusMonitor()?.getStatus();

// Force status check
await fetch('/api/check-device-status', { 
  method: 'POST', 
  headers: { 'X-Internal-Call': 'true' } 
});
```

## Future Enhancements

1. **WebSocket Integration**: Real-time push notifications for status changes
2. **Health Checks**: Periodic verification of monitor functionality
3. **Analytics**: Device uptime and reliability metrics
4. **Alerts**: Email/SMS notifications for extended offline periods
5. **Multi-region**: Support for devices across different time zones
