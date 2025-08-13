"use client"

import { useState, useEffect, useCallback } from "react"
import { useRealtimeDeviceStatus } from "@/hooks/use-realtime-device-status"
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle, 

} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { 
  Smartphone, 
  RefreshCw, 
  Wifi, 
  WifiOff, 
  Clock, 
  Database, 
  Power, 
  Info, 
  AlertTriangle,
  Loader2
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

interface Device {
  deviceId: string
  status: "online" | "offline"
  ipAddress: string
  lastSeen: number
  scanCount: number
  freeHeap?: number
  version?: string
  name?: string
  batteryLevel?: number
  lastHeartbeat?: number
}

const DeviceCard = ({ device, onRestart }: { device: Device, onRestart: (deviceId: string) => void }) => {
  const { toast } = useToast()
  const [isRestarting, setIsRestarting] = useState(false)

  const handleRestartClick = async () => {
    setIsRestarting(true)
    try {
      await onRestart(device.deviceId)
      toast({
        title: "Perangkat Dimulai Ulang",
        description: `Perangkat ${device.name || device.deviceId} sedang dimulai ulang.`,
      })
    } catch {
      toast({
        title: "Gagal Memulai Ulang",
        description: `Gagal memulai ulang perangkat. Coba lagi nanti.`,
        variant: "destructive",
      })
    } finally {
      // Add a delay to prevent spamming the restart button
      setTimeout(() => setIsRestarting(false), 3000)
    }
  }

  const isOnline = device.status === 'online'
  const lastSeenDate = device.lastSeen ? new Date(device.lastSeen) : null

  return (
    <Card className="bg-white/60 backdrop-blur-sm shadow-md hover:shadow-lg transition-shadow duration-300">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
        <div className="flex items-center space-x-4">
          <div className={cn(
            "p-3 rounded-full",
            isOnline ? "bg-emerald-100" : "bg-gray-200"
          )}>
            {isOnline ? (
              <Wifi className="h-6 w-6 text-emerald-700 dark:text-emerald-400" />
            ) : (
              <WifiOff className="h-6 w-6 text-gray-500" />
            )}
          </div>
          <div className="space-y-1">
            <CardTitle className="text-lg font-bold text-gray-800">{device.name || device.deviceId}</CardTitle>
            <p className="text-xs text-gray-500">ID: {device.deviceId}</p>
            {lastSeenDate && (
              <div className="flex items-center space-x-1.5 text-xs text-gray-500 pt-1">
                <Clock className="h-3 w-3" />
                <span>
                  Terakhir aktif: {lastSeenDate.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}, {lastSeenDate.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center pt-4 border-t border-gray-200/80">
          <div className="space-y-1">
            <p className="text-xs font-medium text-gray-500">IP Address</p>
            <p className="text-sm font-semibold text-gray-800">{device.ipAddress || "-"}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium text-gray-500">Status</p>
            <Badge variant={isOnline ? "default" : "destructive"} className={cn(isOnline ? "bg-emerald-500" : "bg-red-500")}>
              {isOnline ? "Online" : "Offline"}
            </Badge>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium text-gray-500">Total Scan</p>
            <p className="text-sm font-semibold text-gray-800 flex items-center justify-center space-x-1">
              <Database className="h-3 w-3 text-gray-600 dark:text-gray-300" />
              <span>{device.scanCount || 0}</span>
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium text-gray-500">Version</p>
            <p className="text-sm font-semibold text-gray-800">{device.version || "-"}</p>
          </div>
        </div>
        <div className="flex justify-end mt-4 pt-4 border-t border-gray-200/80">
          <Button 
            variant="outline"
            size="sm"
            onClick={handleRestartClick}
            disabled={!isOnline || isRestarting}
            className="bg-white hover:bg-gray-50"
          >
            {isRestarting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Power className="mr-2 h-4 w-4" />
            )}
            {isRestarting ? "Memulai ulang..." : "Restart"}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export function DeviceStatus() {
  const { devices, loading, error, refresh: refreshDeviceStatus, totalDevices } = useRealtimeDeviceStatus()

  const handleRestartDevice = useCallback(async (deviceId: string) => {
    const response = await fetch(`/api/restart-device`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId }),
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || "Failed to restart device")
    }

    return response.json()
  }, [])

  return (
    <Card className="bg-white/30 backdrop-blur-md shadow-lg">
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center space-x-3">
            <Smartphone className="h-6 w-6 text-gray-700" />
            <CardTitle className="text-xl font-bold text-gray-800">Status Perangkat Scanner</CardTitle>
          </div>
          <div className="flex items-center space-x-4 mt-3 sm:mt-0">
            <p className="text-xs text-gray-500">
              Update otomatis setiap 5 detik
            </p>
            <Button 
              variant="outline"
              size="sm"
              onClick={() => refreshDeviceStatus()}
              disabled={loading}
              className="bg-white hover:bg-gray-50"
            >
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Refresh
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading && totalDevices === 0 && (
          <div className="flex items-center justify-center p-8 space-x-2 text-gray-500">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Memuat perangkat...</span>
          </div>
        )}
        {error && (
          <div className="flex items-center justify-center p-8 space-x-2 text-red-600 bg-red-50 rounded-lg">
            <AlertTriangle className="h-5 w-5" />
            <span>Gagal memuat status: {error}</span>
          </div>
        )}
        {!loading && !error && devices.length === 0 && (
          <div className="flex items-center justify-center p-8 space-x-2 text-gray-500 bg-gray-50 rounded-lg">
            <Info className="h-5 w-5" />
            <span>Tidak ada perangkat scanner yang terdaftar.</span>
          </div>
        )}
        {devices.map(device => (
          <DeviceCard key={device.deviceId} device={device} onRestart={handleRestartDevice} />
        ))}
      </CardContent>
    </Card>
  )
}
