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
  Loader2,
  BatteryFull,
  BatteryMedium,
  BatteryLow,
  BatteryWarning
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
    <Card className="shadow-sm hover:shadow-md transition-shadow duration-200">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
        <div className="flex items-center space-x-4">
          <div className={cn(
            "p-3 rounded-lg",
            isOnline ? "bg-emerald-100" : "bg-muted"
          )}>
            {isOnline ? (
              <Wifi className="h-5 w-5 text-emerald-700" />
            ) : (
              <WifiOff className="h-5 w-5 text-muted-foreground" />
            )}
          </div>
          <div className="space-y-1">
            <CardTitle className="text-base font-bold text-foreground">{device.name || device.deviceId}</CardTitle>
            <p className="text-xs text-muted-foreground font-mono">ID: {device.deviceId}</p>
            {lastSeenDate && (
              <div className="flex items-center space-x-1.5 text-[11px] text-muted-foreground pt-0.5">
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
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 text-center pt-4 border-t border-border">
          <div className="space-y-1">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">IP Address</p>
            <p className="text-sm font-semibold text-foreground font-mono">{device.ipAddress || "-"}</p>
          </div>
          <div className="space-y-1">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Status</p>
            <Badge variant={isOnline ? "default" : "destructive"} className={cn(isOnline && "bg-emerald-600 hover:bg-emerald-700")}>
              {isOnline ? "Online" : "Offline"}
            </Badge>
          </div>
          <div className="space-y-1">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Baterai</p>
            <p className="text-sm font-semibold flex items-center justify-center space-x-1">
              {device.batteryLevel != null ? (
                <>
                  {device.batteryLevel >= 60 ? (
                    <BatteryFull className="h-4 w-4 text-emerald-600" />
                  ) : device.batteryLevel >= 20 ? (
                    <BatteryMedium className="h-4 w-4 text-amber-500" />
                  ) : device.batteryLevel > 5 ? (
                    <BatteryLow className="h-4 w-4 text-red-500" />
                  ) : (
                    <BatteryWarning className="h-4 w-4 text-red-600 animate-pulse" />
                  )}
                  <span className={cn(
                    device.batteryLevel >= 60 ? "text-emerald-700" :
                    device.batteryLevel >= 20 ? "text-amber-600" : "text-red-600"
                  )}>
                    {device.batteryLevel}%
                  </span>
                </>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Total Scan</p>
            <p className="text-sm font-semibold text-foreground flex items-center justify-center space-x-1">
              <Database className="h-3 w-3 text-muted-foreground" />
              <span className="tabular-nums">{device.scanCount || 0}</span>
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Version</p>
            <p className="text-sm font-semibold text-foreground">{device.version || "-"}</p>
          </div>
        </div>
        <div className="flex justify-end mt-4 pt-4 border-t border-border">
          <Button 
            variant="outline"
            size="sm"
            onClick={handleRestartClick}
            disabled={!isOnline || isRestarting}
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
    <Card className="shadow-sm">
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center space-x-3">
            <Smartphone className="h-5 w-5 text-foreground" />
            <CardTitle className="text-lg font-bold text-foreground tracking-tight">Status Perangkat Scanner</CardTitle>
          </div>
          <div className="flex items-center space-x-4 mt-3 sm:mt-0">
            <p className="text-[11px] text-muted-foreground">
              Update otomatis setiap 5 detik
            </p>
            <Button 
              variant="outline"
              size="sm"
              onClick={() => refreshDeviceStatus()}
              disabled={loading}
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
          <div className="flex items-center justify-center p-8 space-x-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Memuat perangkat...</span>
          </div>
        )}
        {error && (
          <div className="flex items-center justify-center p-8 space-x-2 text-destructive bg-destructive/5 rounded-lg">
            <AlertTriangle className="h-5 w-5" />
            <span>Gagal memuat status: {error}</span>
          </div>
        )}
        {!loading && !error && devices.length === 0 && (
          <div className="flex items-center justify-center p-8 space-x-2 text-muted-foreground bg-muted/30 rounded-lg">
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
