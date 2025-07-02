"use client";

import dynamic from "next/dynamic";
import React from "react";

// Lazy load heavy components for better performance
const RealtimeScanProvider = dynamic(() => import("./realtime-scan-provider").then(mod => ({ default: mod.RealtimeScanProvider })), {
  ssr: false,
  loading: () => null
});

const RealtimeAttendanceProvider = dynamic(() => import("./realtime-attendance-provider").then(mod => ({ default: mod.RealtimeAttendanceProvider })), {
  ssr: false,
  loading: () => null
});

const DeviceStatusMonitorProvider = dynamic(() => import("./device-status-monitor-provider").then(mod => ({ default: mod.DeviceStatusMonitorProvider })), {
  ssr: false,
  loading: () => null
});

// Import default export from performance-monitor
const PerformanceMonitor = dynamic(() => import("./performance-monitor"), {
  ssr: false,
  loading: () => null
});

export function DynamicProviders({ children }: { children: React.ReactNode }) {
  return (
    <RealtimeScanProvider>
      <RealtimeAttendanceProvider>
        <DeviceStatusMonitorProvider>
          {children}
          <PerformanceMonitor />
        </DeviceStatusMonitorProvider>
      </RealtimeAttendanceProvider>
    </RealtimeScanProvider>
  );
}
