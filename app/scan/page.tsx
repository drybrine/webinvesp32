"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Smartphone, Search, Wifi, WifiOff, Settings, Clock } from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { useFirebaseScans, useFirebaseDevices, useFirebaseInventory } from "@/hooks/use-firebase"
import { ScanHistory } from "@/components/scan-history"
import { ProductInfoPopup } from "@/components/product-info-popup"

export default function ScanPage() {
  const [manualBarcode, setManualBarcode] = useState("")
  const [lastScan, setLastScan] = useState<string>("")
  const [popupBarcode, setPopupBarcode] = useState<string>("")
  const [isPopupOpen, setIsPopupOpen] = useState(false)

  // Get data from Firebase hooks
  const { scans, addScan, loading: scansLoading } = useFirebaseScans()
  const { devices, loading: devicesLoading } = useFirebaseDevices()
  const { items } = useFirebaseInventory()

  // Process scans to include product names
  const processedScans = scans.map((scan) => {
    const matchingItem = items.find((item) => item.id === scan.itemId || item.barcode === scan.barcode)
    return {
      ...scan,
      productName: matchingItem?.name || undefined,
    }
  })

  // Handle barcode detection
  const handleBarcodeDetected = async (barcode: string) => {
    try {
      // Find item with this barcode
      const item = items.find((item) => item.barcode === barcode)

      // Add scan record
      await addScan({
        barcode,
        deviceId: "manual_input",
        processed: true,
        itemFound: !!item,
        itemId: item?.id,
        location: "Web App",
      })

      setLastScan(barcode)

      // Show popup with product info
      setPopupBarcode(barcode)
      setIsPopupOpen(true)

      toast({
        title: item ? "Barcode Ditemukan" : "Barcode Tidak Ditemukan",
        description: item ? `Produk: ${item.name}` : `Barcode ${barcode} tidak terdaftar dalam inventaris`,
        variant: item ? "default" : "destructive",
      })
    } catch (error) {
      toast({
        title: "Error",
        description: "Gagal memproses barcode",
        variant: "destructive",
      })
    }
  }

  // Handle manual barcode search
  const handleManualSearch = async () => {
    if (!manualBarcode.trim()) {
      toast({
        title: "Error",
        description: "Masukkan barcode terlebih dahulu",
        variant: "destructive",
      })
      return
    }

    await handleBarcodeDetected(manualBarcode)
    setManualBarcode("")
  }

  // Handle Enter key press in manual input
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleManualSearch()
    }
  }

  // Open device management page
  const openDeviceManagement = () => {
    window.location.href = "/pengaturan?tab=perangkat"
  }

  // ESP32 connection status based on last heartbeat
  const getEsp32Status = () => {
    if (!devices || devices.length === 0) return "disconnected"

    // Check if any device has been seen in the last 2 minutes
    const recentDevice = devices.find((device) => {
      const lastSeen = device.lastSeen ? new Date(device.lastSeen).getTime() : 0
      return Date.now() - lastSeen < 2 * 60 * 1000 // 2 minutes
    })

    return recentDevice ? "connected" : "disconnected"
  }

  const esp32Status = getEsp32Status()

  // Check for new scans from ESP32 and show popup
  useEffect(() => {
    if (scans && scans.length > 0) {
      const latestScan = scans[0]

      // Only show popup for new ESP32 scans (not manual ones)
      if (
        latestScan.deviceId !== "manual_input" &&
        latestScan.deviceId !== "web_camera" &&
        latestScan.barcode !== lastScan
      ) {
        setLastScan(latestScan.barcode)
        setPopupBarcode(latestScan.barcode)
        setIsPopupOpen(true)
      }
    }
  }, [scans, lastScan])

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Scan Barcode</h1>
          <p className="text-gray-600 mt-2">Scan atau input barcode untuk mengelola stok</p>
        </div>

        {/* Main Content */}
        <div className="space-y-8">
          {/* Input Manual */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="w-5 h-5" />
                Input Manual
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label htmlFor="barcode" className="block text-sm font-medium text-gray-700 mb-2">
                  Barcode
                </label>
                <div className="flex gap-2">
                  <Input
                    id="barcode"
                    value={manualBarcode}
                    onChange={(e) => setManualBarcode(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="Masukkan barcode..."
                    className="flex-1"
                    autoFocus
                  />
                  <Button onClick={handleManualSearch} className="bg-gray-900 hover:bg-gray-800">
                    Cari
                  </Button>
                </div>
              </div>

              {/* Last Scan Result */}
              {lastScan && (
                <Alert>
                  <Search className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Scan terakhir:</strong> {lastScan}
                  </AlertDescription>
                </Alert>
              )}

              {/* Recent Scans */}
              {scans && scans.length > 0 && (
                <div className="mt-4">
                  <h3 className="text-sm font-medium text-gray-700 mb-2">Pemindaian Terbaru</h3>
                  <div className="max-h-64 overflow-y-auto border rounded-md">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Barcode</TableHead>
                          <TableHead>Waktu</TableHead>
                          <TableHead>Device</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Aksi</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {processedScans.slice(0, 5).map((scan) => (
                          <TableRow key={scan.id}>
                            <TableCell className="font-mono">{scan.barcode}</TableCell>
                            <TableCell>{new Date(scan.timestamp).toLocaleTimeString()}</TableCell>
                            <TableCell>{scan.deviceId}</TableCell>
                            <TableCell>
                              <Badge variant={scan.itemFound ? "default" : "secondary"}>
                                {scan.itemFound ? "Ditemukan" : "Tidak Ada"}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setPopupBarcode(scan.barcode)
                                  setIsPopupOpen(true)
                                }}
                              >
                                Detail
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ESP32 Scanner Status */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Smartphone className="w-5 h-5" />
                ESP32 Scanner Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    {esp32Status === "connected" ? (
                      <Wifi className="w-5 h-5 text-green-600" />
                    ) : (
                      <WifiOff className="w-5 h-5 text-red-600" />
                    )}
                    <Badge variant={esp32Status === "connected" ? "default" : "secondary"}>
                      {esp32Status === "connected" ? "Terhubung" : "Terputus"}
                    </Badge>
                  </div>
                  <p className="text-gray-600">Pastikan ESP32 scanner terhubung dan dikonfigurasi dengan benar</p>
                </div>
                <Button variant="outline" onClick={openDeviceManagement}>
                  <Settings className="w-4 h-4 mr-2" />
                  Kelola Device
                </Button>
              </div>

              {/* Connected Devices */}
              {devices && devices.length > 0 && (
                <div className="mt-4">
                  <h3 className="text-sm font-medium text-gray-700 mb-2">Perangkat Terhubung</h3>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>ID Perangkat</TableHead>
                          <TableHead>IP Address</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Terakhir Aktif</TableHead>
                          <TableHead>Total Scan</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {devices.map((device) => {
                          const isOnline = device.lastSeen && Date.now() - device.lastSeen < 2 * 60 * 1000
                          return (
                            <TableRow key={device.deviceId}>
                              <TableCell className="font-mono">{device.deviceId}</TableCell>
                              <TableCell>{device.ipAddress}</TableCell>
                              <TableCell>
                                <Badge variant={isOnline ? "default" : "secondary"}>
                                  {isOnline ? "Online" : "Offline"}
                                </Badge>
                              </TableCell>
                              <TableCell className="whitespace-nowrap">
                                <div className="flex items-center gap-1">
                                  <Clock className="w-4 h-4" />
                                  {device.lastSeen ? new Date(device.lastSeen).toLocaleTimeString() : "Tidak diketahui"}
                                </div>
                              </TableCell>
                              <TableCell>{device.scanCount || 0}</TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Scan History */}
          <Card>
            <CardHeader>
              <CardTitle>Riwayat Pemindaian</CardTitle>
            </CardHeader>
            <CardContent>
              <ScanHistory scans={processedScans} loading={scansLoading} />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Product Info Popup */}
      <ProductInfoPopup barcode={popupBarcode} isOpen={isPopupOpen} onClose={() => setIsPopupOpen(false)} />
    </div>
  )
}
