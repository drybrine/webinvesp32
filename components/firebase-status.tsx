"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Database, Activity, AlertTriangle, Settings } from "lucide-react"
import { database, getFirebaseStatus } from "@/lib/firebase"
import { ref, onValue, off } from "firebase/database"

export default function FirebaseStatus() {
  const [connectionStatus, setConnectionStatus] = useState<
    "connecting" | "connected" | "disconnected" | "not-configured"
  >("connecting")
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [firebaseStatus, setFirebaseStatus] = useState(getFirebaseStatus())

  useEffect(() => {
    const status = getFirebaseStatus()
    setFirebaseStatus(status)

    if (!status.initialized || !status.hasValidConfig) {
      setConnectionStatus("not-configured")
      return
    }

    if (!database) {
      setConnectionStatus("disconnected")
      return
    }

    const connectedRef = ref(database, ".info/connected")

    const unsubscribe = onValue(
      connectedRef,
      (snapshot) => {
        if (snapshot.val() === true) {
          setConnectionStatus("connected")
          setLastUpdate(new Date())
        } else {
          setConnectionStatus("disconnected")
        }
      },
      (error) => {
        console.error("Firebase connection error:", error)
        setConnectionStatus("disconnected")
      },
    )

    return () => {
      if (connectedRef && unsubscribe) {
        off(connectedRef, "value", unsubscribe)
      }
    }
  }, [])

  const getStatusColor = () => {
    switch (connectionStatus) {
      case "connected":
        return "bg-green-500"
      case "connecting":
        return "bg-yellow-500"
      case "disconnected":
        return "bg-red-500"
      case "not-configured":
        return "bg-gray-500"
      default:
        return "bg-gray-500"
    }
  }

  const getStatusText = () => {
    switch (connectionStatus) {
      case "connected":
        return "Terhubung"
      case "connecting":
        return "Menghubungkan"
      case "disconnected":
        return "Terputus"
      case "not-configured":
        return "Belum Dikonfigurasi"
      default:
        return "Tidak Diketahui"
    }
  }

  const refreshPage = () => {
    window.location.reload()
  }

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="w-5 h-5" />
          Status Firebase Realtime Database
        </CardTitle>
        <CardDescription>Status koneksi real-time dan informasi sinkronisasi</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${getStatusColor()}`}></div>
              <Badge variant={connectionStatus === "connected" ? "default" : "secondary"}>{getStatusText()}</Badge>
            </div>

            {connectionStatus === "connected" && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Activity className="w-4 h-4" />
                <span>Sinkronisasi real-time aktif</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {lastUpdate && (
              <div className="text-sm text-gray-500">Pembaruan terakhir: {lastUpdate.toLocaleTimeString()}</div>
            )}

            {connectionStatus === "not-configured" && (
              <Button variant="outline" size="sm" onClick={refreshPage}>
                <Settings className="w-4 h-4 mr-2" />
                Segarkan
              </Button>
            )}
          </div>
        </div>

        {connectionStatus === "not-configured" && (
          <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5" />
              <div>
                <p className="text-sm text-yellow-800 font-medium">Firebase Belum Dikonfigurasi</p>
                <p className="text-sm text-yellow-700 mt-1">
                  Variabel lingkungan FIREBASE_DATABASE_URL hilang atau tidak valid.
                </p>
                <p className="text-sm text-yellow-700 mt-1">
                  Nilai saat ini: {firebaseStatus.databaseUrl || "undefined"}
                </p>
                <p className="text-sm text-yellow-700 mt-2">
                  Harap periksa variabel lingkungan Anda dan segarkan halaman.
                </p>
              </div>
            </div>
          </div>
        )}

        {connectionStatus === "disconnected" && firebaseStatus.initialized && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-800">
              ⚠️ Koneksi Firebase terputus. Data mungkin tidak sinkron secara real-time. Periksa koneksi internet Anda.
            </p>
          </div>
        )}

        {connectionStatus === "connected" && (
          <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-sm text-green-800">
              ✅ Firebase terhubung. Semua data perubahan akan sinkron secara real-time di semua perangkat.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
