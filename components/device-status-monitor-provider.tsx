"use client"

import { useEffect } from 'react';
import { startDeviceStatusMonitor, stopDeviceStatusMonitor } from '@/lib/device-status-monitor';

export function DeviceStatusMonitorProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    console.log('🔧 DeviceStatusMonitorProvider initialized');
    
    // Start the device status monitor
    startDeviceStatusMonitor();
    
    return () => {
      console.log('🔧 DeviceStatusMonitorProvider cleanup');
      // Stop the monitor when component unmounts
      stopDeviceStatusMonitor();
    };
  }, []);

  return <>{children}</>;
}
