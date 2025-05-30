"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Wifi, WifiOff, Smartphone, Activity, Clock, Package } from "lucide-react"
import { toast } from "@/hooks/use-toast"

interface ScannerDevice {
  deviceId: string
  ipAddress: string
  status: "online" | "offline"
  lastSeen: string
  scanCount: number
  uptime: number
}

interface BarcodeScans {
  barcode: string
  timestamp: string
  deviceId: string
  processed: boolean
}

export default function ScannerIntegration() {
  const [devices, setDevices] = useState<ScannerDevice[]>([])
  const [scans, setScans] = useState<BarcodeScans[]>([])
  const [isScanning, setIsScanning] = useState(false)
  const [scannerIP, setScannerIP] = useState("192.168.1.100")
  const [connectionStatus, setConnectionStatus] = useState<"disconnected" | "connecting" | "connected">("disconnected")
  const [lastScan, setLastScan] = useState<string>("")
  const wsRef = useRef<WebSocket | null>(null)

  // Connect to ESP32 WebSocket
  const connectToScanner = async () => {
    if (!scannerIP) {
      toast({
        title: "Error",
        description: "Please enter scanner IP address",
        variant: "destructive",
      })
      return
    }

    setConnectionStatus("connecting")

    try {
      // First test HTTP connection
      const response = await fetch(`http://${scannerIP}/api/status`, {
        method: "GET",
        mode: "cors",
      })

      if (!response.ok) {
        throw new Error("Scanner not responding")
      }

      const data = await response.json()

      // Update device info
      const device: ScannerDevice = {
        deviceId: data.deviceId,
        ipAddress: scannerIP,
        status: "online",
        lastSeen: new Date().toISOString(),
        scanCount: data.scanCount || 0,
        uptime: data.uptime || 0,
      }

      setDevices((prev) => {
        const existing = prev.find((d) => d.deviceId === device.deviceId)
        if (existing) {
          return prev.map((d) => (d.deviceId === device.deviceId ? device : d))
        }
        return [...prev, device]
      })

      // Connect WebSocket
      const ws = new WebSocket(`ws://${scannerIP}:81`)

      ws.onopen = () => {
        setConnectionStatus("connected")
        setIsScanning(true)
        wsRef.current = ws

        toast({
          title: "Connected",
          description: `Connected to scanner ${data.deviceId}`,
        })
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)

          if (data.type === "barcode_scan") {
            const scan: BarcodeScans = {
              barcode: data.barcode,
              timestamp: new Date().toISOString(),
              deviceId: data.deviceId,
              processed: false,
            }

            setScans((prev) => [scan, ...prev.slice(0, 49)]) // Keep last 50 scans
            setLastScan(data.barcode)

            // Process the barcode (check if it exists in inventory)
            processBarcodeScans(data.barcode)

            toast({
              title: "Barcode Scanned",
              description: `Scanned: ${data.barcode}`,
            })
          }
        } catch (error) {
          console.error("Error parsing WebSocket message:", error)
        }
      }

      ws.onclose = () => {
        setConnectionStatus("disconnected")
        setIsScanning(false)
        wsRef.current = null

        toast({
          title: "Disconnected",
          description: "Scanner connection lost",
          variant: "destructive",
        })
      }

      ws.onerror = (error) => {
        console.error("WebSocket error:", error)
        setConnectionStatus("disconnected")
        setIsScanning(false)

        toast({
          title: "Connection Error",
          description: "Failed to connect to scanner",
          variant: "destructive",
        })
      }
    } catch (error) {
      setConnectionStatus("disconnected")
      toast({
        title: "Connection Failed",
        description: `Cannot connect to scanner at ${scannerIP}`,
        variant: "destructive",
      })
    }
  }

  const disconnectScanner = () => {
    if (wsRef.current) {
      wsRef.current.close()
    }
    setConnectionStatus("disconnected")
    setIsScanning(false)
    wsRef.current = null
  }

  const processBarcodeScans = async (barcode: string) => {
    // Here you would typically check against your inventory
    // For now, we'll just simulate processing
    console.log("Processing barcode:", barcode)

    // Update scan as processed
    setScans((prev) =>
      prev.map((scan) => (scan.barcode === barcode && !scan.processed ? { ...scan, processed: true } : scan)),
    )
  }

  const testScannerConnection = async () => {
    if (!scannerIP) return

    try {
      const response = await fetch(`http://${scannerIP}/api/status`)
      const data = await response.json()

      toast({
        title: "Test Successful",
        description: `Scanner ${data.deviceId} is responding`,
      })
    } catch (error) {
      toast({
        title: "Test Failed",
        description: "Cannot reach scanner",
        variant: "destructive",
      })
    }
  }

  const clearScanHistory = () => {
    setScans([])
    toast({
      title: "History Cleared",
      description: "Scan history has been cleared",
    })
  }

  // Cleanup WebSocket on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close()
      }
    }
  }, [])

  return (
    <div className="space-y-6">
      {/* Connection Control */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="w-5 h-5" />
            Koneksi Pemindai
          </CardTitle>
          <CardDescription>Hubungkan ke perangkat pemindai barcode ESP32</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <Label htmlFor="scanner-ip">Alamat IP Pemindai</Label>
              <Input
                id="scanner-ip"
                value={scannerIP}
                onChange={(e) => setScannerIP(e.target.value)}
                placeholder="192.168.1.100"
                disabled={connectionStatus === "connected"}
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={testScannerConnection} disabled={connectionStatus === "connecting"}>
                Tes
              </Button>
              {connectionStatus === "connected" ? (
                <Button variant="destructive" onClick={disconnectScanner}>
                  <WifiOff className="w-4 h-4 mr-2" />
                  Putuskan
                </Button>
              ) : (
                <Button onClick={connectToScanner} disabled={connectionStatus === "connecting"}>
                  <Wifi className="w-4 h-4 mr-2" />
                  {connectionStatus === "connecting" ? "Menghubungkan..." : "Hubungkan"}
                </Button>
              )}
            </div>
          </div>

          {/* Connection Status */}
          <Alert className={connectionStatus === "connected" ? "border-green-500 bg-green-50" : ""}>
            <Activity className="h-4 w-4" />
            <AlertDescription>
              Status:{" "}
              <Badge variant={connectionStatus === "connected" ? "default" : "secondary"}>
                {connectionStatus === "connected"
                  ? "Terhubung"
                  : connectionStatus === "connecting"
                    ? "Menghubungkan"
                    : "Terputus"}
              </Badge>
              {lastScan && (
                <span className="ml-4">
                  Pemindaian terakhir: <code className="bg-gray-100 px-2 py-1 rounded text-sm">{lastScan}</code>
                </span>
              )}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Connected Devices */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="w-5 h-5" />
            Pemindai Terhubung
          </CardTitle>
          <CardDescription>Perangkat pemindai ESP32 aktif</CardDescription>
        </CardHeader>
        <CardContent>
          {devices.length === 0 ? (
            <p className="text-gray-500 text-center py-8">Tidak ada pemindai terhubung</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID Perangkat</TableHead>
                  <TableHead>Alamat IP</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Waktu Aktif</TableHead>
                  <TableHead>Pemindaian</TableHead>
                  <TableHead>Terakhir Terlihat</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {devices.map((device) => (
                  <TableRow key={device.deviceId}>
                    <TableCell className="font-mono">{device.deviceId}</TableCell>
                    <TableCell>{device.ipAddress}</TableCell>
                    <TableCell>
                      <Badge variant={device.status === "online" ? "default" : "secondary"}>{device.status}</Badge>
                    </TableCell>
                    <TableCell>{Math.floor(device.uptime / 60)}m</TableCell>
                    <TableCell>{device.scanCount}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        {new Date(device.lastSeen).toLocaleTimeString()}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Scan History */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Riwayat Pemindaian Real-time</CardTitle>
              <CardDescription>Pemindaian barcode langsung dari perangkat terhubung</CardDescription>
            </div>
            <Button variant="outline" onClick={clearScanHistory}>
              Bersihkan Riwayat
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {scans.length === 0 ? (
            <div className="text-center py-8">
              <Package className="w-12 h-12 mx-auto text-gray-400 mb-4" />
              <p className="text-gray-500">Belum ada pemindaian</p>
              <p className="text-sm text-gray-400">Barcode yang dipindai akan muncul di sini secara real-time</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {scans.map((scan, index) => (
                <div
                  key={index}
                  className={`flex items-center justify-between p-3 rounded-lg border ${
                    scan.processed ? "bg-green-50 border-green-200" : "bg-gray-50 border-gray-200"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Badge variant={scan.processed ? "default" : "secondary"}>
                      {scan.processed ? "Diproses" : "Tertunda"}
                    </Badge>
                    <code className="bg-white px-2 py-1 rounded text-sm font-mono">{scan.barcode}</code>
                  </div>
                  <div className="text-sm text-gray-500 flex items-center gap-2">
                    <span>{scan.deviceId}</span>
                    <Clock className="w-4 h-4" />
                    <span>{new Date(scan.timestamp).toLocaleTimeString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Integration Instructions */}
      <Card>
        <CardHeader>
          <CardTitle>Pengaturan Integrasi</CardTitle>
          <CardDescription>Cara mengatur integrasi pemindai ESP32</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <h4 className="font-semibold">1. Pengaturan Perangkat Keras</h4>
            <ul className="list-disc list-inside text-sm space-y-1 ml-4">
              <li>Hubungkan pemindai barcode ke ESP32 melalui UART (pin 16, 17)</li>
              <li>Nyalakan ESP32 dengan catu daya 5V</li>
              <li>Pastikan ESP32 terhubung ke jaringan WiFi yang sama</li>
            </ul>
          </div>

          <div className="space-y-2">
            <h4 className="font-semibold">2. Konfigurasi Perangkat Lunak</h4>
            <ul className="list-disc list-inside text-sm space-y-1 ml-4">
              <li>Flash firmware ESP32 yang disediakan</li>
              <li>Konfigurasi WiFi menggunakan QR code atau antarmuka web</li>
              <li>Atur URL server ke alamat aplikasi ini</li>
              <li>Uji koneksi menggunakan antarmuka web pemindai</li>
            </ul>
          </div>

          <div className="space-y-2">
            <h4 className="font-semibold">3. Fitur Real-time</h4>
            <ul className="list-disc list-inside text-sm space-y-1 ml-4">
              <li>Koneksi WebSocket untuk pembaruan pemindaian instan</li>
              <li>Pencarian dan pembaruan inventaris otomatis</li>
              <li>Pemantauan status perangkat dan heartbeat</li>
              <li>Riwayat pemindaian dan analitik</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
