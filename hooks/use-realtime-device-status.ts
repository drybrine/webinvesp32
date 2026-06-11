"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { ref, onValue, DataSnapshot, Unsubscribe } from "firebase/database"
import { database, isFirebaseConfigured, waitForFirebaseReady } from "@/lib/firebase"
import { toast } from "@/hooks/use-toast"

export interface DeviceStatus {
  deviceId: string
  status: "online" | "offline"
  ipAddress: string
  lastSeen: any
  scanCount: number
  freeHeap?: number
  version?: string
  name?: string
  batteryLevel?: number
  lastHeartbeat?: any
}

// Device dianggap offline jika heartbeat/lastSeen terakhir lebih dari threshold ini (ms)
const OFFLINE_THRESHOLD_MS = 15000
// Interval re-evaluasi status client-side (ms) — makin kecil makin responsif
const STATUS_RECHECK_INTERVAL_MS = 3000
const DEFAULT_OFFLINE_SCANNER_ID = "ESP32-GM67"

interface RawDevice {
  status?: string
  ipAddress?: string
  lastSeen?: number | string
  lastHeartbeat?: number | string
  scanCount?: number
  freeHeap?: number
  version?: string
  name?: string
  batteryLevel?: number
}

function computeStatus(raw: RawDevice, now: number): "online" | "offline" {
  const heartbeat = Number(raw.lastHeartbeat) || 0
  const seen = Number(raw.lastSeen) || 0
  const latest = Math.max(heartbeat, seen)
  if (!latest) return "offline"
  return now - latest <= OFFLINE_THRESHOLD_MS ? "online" : "offline"
}

function createDefaultOfflineScanner(): DeviceStatus {
  return {
    deviceId: DEFAULT_OFFLINE_SCANNER_ID,
    status: "offline",
    ipAddress: "",
    lastSeen: null,
    lastHeartbeat: null,
    scanCount: 0,
    name: "Scanner ESP32 GM67",
  }
}

export function useRealtimeDeviceStatus() {
  const [rawDevices, setRawDevices] = useState<Record<string, RawDevice>>({})
  const [devices, setDevices] = useState<DeviceStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date())
  const [connectionStatus, setConnectionStatus] = useState<"connected" | "disconnected" | "connecting">("connecting")

  const previousStatusRef = useRef<Map<string, string>>(new Map())

  const recomputeDevices = useCallback((raw: Record<string, RawDevice>) => {
    const now = Date.now()
    const list: DeviceStatus[] =
      Object.keys(raw).length === 0
        ? [createDefaultOfflineScanner()]
        : Object.keys(raw).map((deviceId) => {
            const d = raw[deviceId] || {}
            return {
              deviceId,
              status: computeStatus(d, now),
              ipAddress: d.ipAddress || "",
              lastSeen: d.lastSeen,
              lastHeartbeat: d.lastHeartbeat,
              scanCount: Number(d.scanCount) || 0,
              freeHeap: d.freeHeap,
              version: d.version,
              name: d.name || deviceId,
              batteryLevel: d.batteryLevel,
            }
          })

    const changes: { deviceId: string; previousStatus: string; newStatus: string }[] = []
    list.forEach((device) => {
      const previousStatus = previousStatusRef.current.get(device.deviceId)
      if (previousStatus && previousStatus !== device.status) {
        changes.push({ deviceId: device.deviceId, previousStatus, newStatus: device.status })
      }
      previousStatusRef.current.set(device.deviceId, device.status)
    })

    changes.forEach((change) => {
      const isNowOnline = change.newStatus === "online"
      toast({
        title: isNowOnline ? "Perangkat Terhubung" : "Perangkat Terputus",
        description: `${change.deviceId} ${isNowOnline ? "online" : "offline"}`,
        variant: isNowOnline ? "default" : "destructive",
      })
    })

    setDevices(list)
    setLastUpdate(new Date())
  }, [])

  useEffect(() => {
    let unsubscribe: Unsubscribe | undefined
    let cancelled = false

    const initializeDevices = async () => {
      setConnectionStatus("connecting")
      const firebaseReady = await waitForFirebaseReady(5000)

      if (cancelled) return

      if (!firebaseReady || !isFirebaseConfigured() || !database) {
        setRawDevices({})
        recomputeDevices({})
        setConnectionStatus("disconnected")
        setLoading(false)
        return
      }

      const devicesRef = ref(database, "devices")

      unsubscribe = onValue(
        devicesRef,
        (snapshot: DataSnapshot) => {
          const data = snapshot.val() as Record<string, RawDevice> | null
          const raw = data || {}
          setRawDevices(raw)
          recomputeDevices(raw)
          setConnectionStatus("connected")
          setError(null)
          setLoading(false)
        },
        (err) => {
          console.error("Firebase devices listener error:", err)
          setError(err.message)
          setRawDevices({})
          recomputeDevices({})
          setConnectionStatus("disconnected")
          setLoading(false)
        },
      )
    }

    initializeDevices()

    return () => {
      cancelled = true
      if (unsubscribe) unsubscribe()
    }
  }, [recomputeDevices])

  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        recomputeDevices(rawDevices)
      }
    }, STATUS_RECHECK_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [rawDevices, recomputeDevices])

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        recomputeDevices(rawDevices)
      }
    }
    const handleOnline = () => {
      setConnectionStatus("connected")
      recomputeDevices(rawDevices)
    }
    const handleOffline = () => {
      setConnectionStatus("disconnected")
    }
    document.addEventListener("visibilitychange", handleVisibilityChange)
    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
    }
  }, [rawDevices, recomputeDevices])

  const refresh = useCallback(async () => {
    recomputeDevices(rawDevices)
  }, [rawDevices, recomputeDevices])

  return {
    devices,
    loading,
    error,
    lastUpdate,
    connectionStatus,
    refresh,
    onlineDevices: devices.filter((d) => d.status === "online").length,
    offlineDevices: devices.filter((d) => d.status === "offline").length,
    totalDevices: devices.length,
  }
}
