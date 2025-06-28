// Device Status Monitor - Client-side background service
// This provides a more reliable way to monitor device status

class DeviceStatusMonitor {
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;
  private readonly CHECK_INTERVAL = 20000; // 20 seconds for more stable detection
  private readonly API_ENDPOINT = '/api/check-device-status';

  constructor() {
    console.log('🔧 DeviceStatusMonitor initialized');
  }

  start() {
    // Only run in browser environment
    if (typeof window === 'undefined') {
      console.log('⚠️ DeviceStatusMonitor - not in browser environment, skipping');
      return;
    }

    if (this.isRunning) {
      console.log('⚠️ DeviceStatusMonitor already running');
      return;
    }

    console.log('🚀 Starting DeviceStatusMonitor...');
    this.isRunning = true;

    // Run immediately (with small delay to ensure DOM is ready)
    setTimeout(() => {
      this.checkDeviceStatus();
    }, 1000);

    // Set up interval
    this.intervalId = setInterval(() => {
      // Only run if document is visible
      if (document.visibilityState === 'visible') {
        this.checkDeviceStatus();
      }
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
      
      // Ensure we have a valid URL
      const url = this.API_ENDPOINT.startsWith('http') 
        ? this.API_ENDPOINT 
        : `${window.location.origin}${this.API_ENDPOINT}`;
      
      // Create fetch options with optional timeout
      const fetchOptions: RequestInit = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Call': 'true'
        }
      };
      
      // Add timeout if AbortSignal.timeout is available
      if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) {
        fetchOptions.signal = AbortSignal.timeout(10000); // 10 second timeout
      }
      
      const response = await fetch(url, fetchOptions);

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
      
      // More specific error handling
      if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
        console.error('🌐 Network connection error - check if server is running');
      } else if (error instanceof DOMException && error.name === 'AbortError') {
        console.error('⏱️ Request timeout - server taking too long to respond');
      } else {
        console.error('🔧 Unexpected error in device status monitor');
      }
      
      // Dispatch error event for network/other errors
      window.dispatchEvent(new CustomEvent('deviceStatusError', {
        detail: { 
          error: error instanceof Error ? error.message : 'Network error',
          errorType: error instanceof TypeError ? 'network' : 'unknown',
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
