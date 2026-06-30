"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { ref, onValue, DataSnapshot, Unsubscribe } from "firebase/database"
import { database, isFirebaseConfigured, waitForFirebaseReady } from "@/lib/firebase"
import { toast } from "@/hooks/use-toast"

import { useAuth } from "@/components/auth-provider"

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
  scanMode?: string
}

// Device dianggap offline jika timestamp server terakhir lebih dari threshold ini (ms)
const OFFLINE_THRESHOLD_MS = 15000
// Interval re-evaluasi status client-side (ms) — makin kecil makin responsif
const STATUS_RECHECK_INTERVAL_MS = 1000

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
  scanMode?: string
}

// `now` di sini WAJIB waktu-server (Date.now() + serverTimeOffset), bukan jam PC mentah.
// `lastSeen` ditulis firmware sebagai server timestamp ({".sv":"timestamp"}), jadi keduanya
// harus berada di basis waktu yang sama; kalau tidak, clock skew PC bikin device mati
// tetap kebaca online atau device hidup kebaca offline.
function computeStatus(raw: RawDevice, now: number): "online" | "offline" {
  const lastSeen = Number(raw.lastSeen) || 0
  if (lastSeen <= 0) return "offline"
  const age = now - lastSeen
  // Toleransi skew kecil ke arah negatif (server sedikit di depan client).
  return age <= OFFLINE_THRESHOLD_MS && age >= -OFFLINE_THRESHOLD_MS ? "online" : "offline"
}

export function useRealtimeDeviceStatus() {
  const { role } = useAuth()
  const [rawDevices, setRawDevices] = useState<Record<string, RawDevice>>({})
  const [devices, setDevices] = useState<DeviceStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date())
  const [connectionStatus, setConnectionStatus] = useState<"connected" | "disconnected" | "connecting">("connecting")

  const previousStatusRef = useRef<Map<string, string>>(new Map())
  // Selisih jam server Firebase vs client (ms). Dipakai agar umur heartbeat
  // dihitung relatif ke waktu server, bukan jam PC yang bisa drift (WSL2 dll).
  const serverTimeOffsetRef = useRef<number>(0)
  // Snapshot device terakhir, agar tick interval & update offset bisa re-evaluasi
  // tanpa menunggu event onValue berikutnya.
  const latestRawRef = useRef<Record<string, RawDevice>>({})

  const recomputeDevices = useCallback((raw: Record<string, RawDevice>) => {
    latestRawRef.current = raw
    const now = Date.now() + serverTimeOffsetRef.current
    const list: DeviceStatus[] = Object.keys(raw).map((deviceId) => {
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
        scanMode: d.scanMode,
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

    // Toast notifikasi — tetap langsung (tanpa debounce)
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
    if (!role) return
    let unsubscribe: Unsubscribe | undefined
    let unsubscribeOffset: Unsubscribe | undefined
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

      // Lacak offset waktu server agar computeStatus tahan terhadap clock skew client.
      const offsetRef = ref(database, ".info/serverTimeOffset")
      unsubscribeOffset = onValue(offsetRef, (snap: DataSnapshot) => {
        const off = Number(snap.val())
        if (Number.isFinite(off)) {
          serverTimeOffsetRef.current = off
          // Re-evaluasi dengan offset terbaru memakai snapshot device terakhir.
          recomputeDevices(latestRawRef.current)
        }
      })

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
      if (unsubscribeOffset) unsubscribeOffset()
    }
  }, [role, recomputeDevices])

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
