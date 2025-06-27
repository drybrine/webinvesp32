// Device Status Monitor - Client-side background service
// This provides a more reliable way to monitor device status

class DeviceStatusMonitor {
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;
  private readonly CHECK_INTERVAL = 30000; // 30 seconds
  private readonly API_ENDPOINT = '/api/check-device-status';

  constructor() {
    console.log('🔧 DeviceStatusMonitor initialized');
  }

  start() {
    if (this.isRunning) {
      console.log('⚠️ DeviceStatusMonitor already running');
      return;
    }

    console.log('🚀 Starting DeviceStatusMonitor...');
    this.isRunning = true;

    // Run immediately
    this.checkDeviceStatus();

    // Set up interval
    this.intervalId = setInterval(() => {
      this.checkDeviceStatus();
    }, this.CHECK_INTERVAL);

    console.log(`✅ DeviceStatusMonitor started (checking every ${this.CHECK_INTERVAL / 1000}s)`);
  }

  stop() {
    if (!this.isRunning) {
      console.log('⚠️ DeviceStatusMonitor not running');
      return;
    }

    console.log('🛑 Stopping DeviceStatusMonitor...');
    
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.isRunning = false;
    console.log('✅ DeviceStatusMonitor stopped');
  }

  private async checkDeviceStatus() {
    try {
      console.log('🔍 Running automated device status check...');
      
      const response = await fetch(this.API_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Call': 'true'
        }
      });

      if (response.ok) {
        const result = await response.json();
        
        if (result.updatedDevices > 0) {
          console.log(`📱 Device status updates: ${result.updatedDevices} devices (${result.onlineDevices} online, ${result.offlineDevices} offline)`);
          
          // Dispatch custom event for components to listen to
          window.dispatchEvent(new CustomEvent('deviceStatusUpdated', {
            detail: result
          }));
        } else {
          console.log('ℹ️ Device status check completed - no updates needed');
        }
      } else {
        console.error('❌ Device status check failed:', response.status, response.statusText);
        
        // Try to parse error response
        try {
          const errorData = await response.text();
          console.error('Error details:', errorData);
        } catch (parseError) {
          console.error('Could not parse error response');
        }
        
        // Dispatch error event
        window.dispatchEvent(new CustomEvent('deviceStatusError', {
          detail: { 
            status: response.status, 
            statusText: response.statusText,
            timestamp: new Date().toISOString()
          }
        }));
      }
    } catch (error) {
      console.error('❌ Error in automated device status check:', error);
      
      // Dispatch error event for network/other errors
      window.dispatchEvent(new CustomEvent('deviceStatusError', {
        detail: { 
          error: error instanceof Error ? error.message : 'Network error',
          timestamp: new Date().toISOString()
        }
      }));
    }
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      checkInterval: this.CHECK_INTERVAL,
      nextCheckIn: this.isRunning ? this.CHECK_INTERVAL : null
    };
  }
}

// Global instance
let deviceStatusMonitor: DeviceStatusMonitor | null = null;

export function startDeviceStatusMonitor() {
  if (!deviceStatusMonitor) {
    deviceStatusMonitor = new DeviceStatusMonitor();
  }
  deviceStatusMonitor.start();
  return deviceStatusMonitor;
}

export function stopDeviceStatusMonitor() {
  if (deviceStatusMonitor) {
    deviceStatusMonitor.stop();
  }
}

export function getDeviceStatusMonitor() {
  return deviceStatusMonitor;
}

// Auto-start when module is imported (if in browser environment)
if (typeof window !== 'undefined') {
  // Auto-start the monitor when the page loads
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      startDeviceStatusMonitor();
    });
  } else {
    startDeviceStatusMonitor();
  }

  // Stop monitor when page is about to unload
  window.addEventListener('beforeunload', () => {
    stopDeviceStatusMonitor();
  });

  // Handle visibility change (stop when tab is hidden, restart when visible)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      console.log('📱 Page hidden, pausing device status monitor...');
      stopDeviceStatusMonitor();
    } else {
      console.log('📱 Page visible, resuming device status monitor...');
      startDeviceStatusMonitor();
    }
  });
}
