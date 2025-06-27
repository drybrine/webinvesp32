"use client"

import { useState, useEffect } from "react" // Add useEffect import
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Smartphone, Wifi, WifiOff, RefreshCw, Clock, Zap, Database } from "lucide-react"
import { toast } from "@/hooks/use-toast"

interface DeviceStatus {
  deviceId: string
  status: "online" | "offline"
  ipAddress: string
  lastSeen: any
  scanCount: number
  uptime: number
  freeHeap?: number
  version?: string
  name?: string
  batteryLevel?: number
  lastHeartbeat?: any
}

interface DeviceStatusProps {
  devices: DeviceStatus[]
  loading?: boolean
  onRefresh?: () => void
}

export function DeviceStatusDisplay({ devices, loading = false, onRefresh }: DeviceStatusProps) {
  const [refreshing, setRefreshing] = useState(false)
  const [lastRefresh, setLastRefresh] = useState(new Date())

  // Add auto-refresh every 30 seconds for more responsive offline detection
  useEffect(() => {
    // Initial refresh when component mounts
    if (onRefresh) {
      onRefresh();
    }
    
    // Set up interval for regular refresh - more frequent for offline detection
    const intervalId = setInterval(() => {
      if (onRefresh) {
        console.log('🔄 Auto-refreshing device status...');
        setRefreshing(true);
        onRefresh();
        setLastRefresh(new Date());
        setTimeout(() => setRefreshing(false), 500);
      }
    }, 30000); // 30000 ms = 30 seconds (more frequent for real-time feel)

    // Listen for device status updates from the background monitor
    const handleDeviceStatusUpdate = (event: CustomEvent) => {
      console.log('📡 Received device status update from monitor:', event.detail);
      if (onRefresh) {
        onRefresh();
        setLastRefresh(new Date());
      }
    };

    // Listen for device status errors from the background monitor
    const handleDeviceStatusError = (event: CustomEvent) => {
      console.warn('⚠️ Device status monitor error:', event.detail);
      // Don't spam users with error toasts from automatic checks
      // Just log the error for debugging
    };

    window.addEventListener('deviceStatusUpdated', handleDeviceStatusUpdate as EventListener);
    window.addEventListener('deviceStatusError', handleDeviceStatusError as EventListener);
    
    // Clear interval and event listener on component unmount
    return () => {
      clearInterval(intervalId);
      window.removeEventListener('deviceStatusUpdated', handleDeviceStatusUpdate as EventListener);
      window.removeEventListener('deviceStatusError', handleDeviceStatusError as EventListener);
    };
  }, [onRefresh]);

  const handleRefresh = () => {
    if (onRefresh) {
      setRefreshing(true)
      onRefresh()
      setLastRefresh(new Date())
      
      // Debug: log current device data
      console.log('📊 Current devices data:', devices)
      devices.forEach(device => {
        console.log(`📱 Device ${device.deviceId}:`, {
          status: device.status,
          lastSeen: device.lastSeen,
          ipAddress: device.ipAddress
        })
      })
      
      setTimeout(() => setRefreshing(false), 2000)
    }
  }

  const handleRestartDevice = (deviceId: string) => {
    toast({
      title: "Restart Device",
      description: `Mengirim perintah restart ke ${deviceId}...`,
    })

    // Simulate restart command
    setTimeout(() => {
      toast({
        title: "Perintah Terkirim",
        description: `Perintah restart berhasil dikirim ke ${deviceId}`,
      })
    }, 1500)
  }

  // Format uptime to human readable
  const formatUptime = (milliseconds: number) => {
    if (!milliseconds) return "Unknown"

    const seconds = Math.floor(milliseconds / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)

    if (days > 0) {
      return `${days}d ${hours % 24}h`
    } else if (hours > 0) {
      return `${hours}h ${minutes % 60}m`
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`
    } else {
      return `${seconds}s`
    }
  }

  // Format date for display
  const formatDate = (timestamp: any) => {
    if (!timestamp) return "Unknown"
    const date = new Date(timestamp)
    return date.toLocaleString("id-ID", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  // Check if device is online (seen in last 2 minutes)
  const isDeviceOnline = (device: DeviceStatus) => {
    if (!device.lastSeen) return false
    const lastSeen = new Date(device.lastSeen).getTime()
    return Date.now() - lastSeen < 2 * 60 * 1000 // 2 minutes
  }

  // Check device status with proper logic - prioritize database status
  const checkDeviceStatus = (device: DeviceStatus) => {
    // First, trust the database status if it says online
    if (device.status === "online") {
      console.log(`✅ Device ${device.deviceId}: Database says ONLINE`)
      return "online"
    }

    // If database says offline, double-check with timestamp
    const lastSeen = device.lastSeen
    let lastSeenMs = 0
    
    if (typeof lastSeen === "string") {
      const parsedNumber = parseInt(lastSeen, 10)
      if (!isNaN(parsedNumber)) {
        lastSeenMs = parsedNumber > 1000000000000 ? parsedNumber : parsedNumber * 1000
      } else {
        lastSeenMs = new Date(lastSeen).getTime()
      }
    } else if (typeof lastSeen === "number") {
      lastSeenMs = lastSeen > 1000000000000 ? lastSeen : lastSeen * 1000
    }

    const now = Date.now()
    const timeDiff = now - lastSeenMs
    const OFFLINE_THRESHOLD = 120000 // 2 minutes

    console.log(`🔍 Device ${device.deviceId}: DB=${device.status}, timeDiff=${Math.floor(timeDiff/1000)}s`)

    // If timestamp indicates recent activity, override database offline status
    if (lastSeenMs > 0 && timeDiff < OFFLINE_THRESHOLD) {
      console.log(`🔄 Device ${device.deviceId}: Timestamp override to ONLINE`)
      return "online"
    }

    return "offline"
  }

  return (
    <Card>
      <CardHeader className="flex flex-col space-y-2 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
        <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
          <Smartphone className="w-5 h-5" />
          Status Perangkat Scanner
        </CardTitle>
        <div className="flex flex-col items-start sm:items-end">
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing} className="w-full sm:w-auto">
            <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <span className="text-xs text-gray-400 mt-1">
            Update otomatis setiap 30 detik
          </span>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="flex flex-col items-center">
              <div className="w-8 h-8 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin mb-2"></div>
              <p className="text-gray-500">Memuat data perangkat...</p>
            </div>
          </div>
        ) : devices.length === 0 ? (
          <div className="text-center py-8">
            <Smartphone className="w-12 h-12 mx-auto text-gray-400 mb-2" />
            <p className="text-gray-500">Tidak ada perangkat yang terhubung</p>
            <p className="text-sm text-gray-400 mt-1">
              Pastikan ESP32 scanner Anda terhubung ke internet dan dikonfigurasi dengan benar
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {devices.map((device) => {
              // Use the more reliable checkDeviceStatus function instead
              const online = checkDeviceStatus(device) === "online"
              return (
                <div key={device.deviceId} className="border rounded-lg p-4">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div
                        className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                          online ? "bg-green-100" : "bg-gray-100"
                        }`}
                      >
                        {online ? (
                          <Wifi className={`w-6 h-6 ${online ? "text-green-600" : "text-gray-400"}`} />
                        ) : (
                          <WifiOff className="w-6 h-6 text-gray-400" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium">{device.name || device.deviceId}</h3>
                          {/* Only show badge for online devices */}
                          {online && <Badge variant="default">Online</Badge>}
                        </div>
                        <p className="text-sm text-gray-500">ID: {device.deviceId}</p>
                        <div className="flex items-center gap-1 text-sm text-gray-500">
                          <Clock className="w-3.5 h-3.5" />
                          <span>Terakhir aktif: {formatDate(device.lastSeen)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="flex flex-col">
                        <span className="text-xs text-gray-500">IP Address</span>
                        <span className="font-mono text-sm">{device.ipAddress || "Unknown"}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs text-gray-500">Uptime</span>
                        <span className="text-sm">{formatUptime(device.uptime)}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs text-gray-500">Total Scan</span>
                        <div className="flex items-center gap-1">
                          <Database className="w-3.5 h-3.5 text-blue-500" />
                          <span className="text-sm">{device.scanCount || 0}</span>
                        </div>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs text-gray-500">Version</span>
                        <span className="text-sm">{device.version || "Unknown"}</span>
                      </div>
                    </div>

                    {device.batteryLevel !== undefined && (
                      <div className="w-full md:w-32">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-gray-500">Battery</span>
                          <span className="text-xs font-medium">{device.batteryLevel}%</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Zap className="w-3.5 h-3.5 text-yellow-500" />
                          <Progress value={device.batteryLevel} className="h-2" />
                        </div>
                      </div>
                    )}

                    <div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRestartDevice(device.deviceId)}
                        disabled={!online}
                      >
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Restart
                      </Button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
