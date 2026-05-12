"use client"

import { useState, useEffect } from "react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Package,
  Search,
  Download,
  CheckCircle,
  Clock,
  Wifi,
  Activity,
} from "lucide-react"
import { useFirebaseScans } from "@/hooks/use-firebase"
import { useRealtimeDeviceStatus } from "@/hooks/use-realtime-device-status"
import { getFirebaseStatus } from "@/lib/firebase"
import { ScanHistory } from "@/components/scan-history"

export default function ScanPage() {
  const [searchTerm, setSearchTerm] = useState("")

  const {
    scans,
    loading: scansLoading,
    error: scansError,
  } = useFirebaseScans()

  const {
    loading: devicesLoading,
    error: devicesError,
  } = useRealtimeDeviceStatus()

  const firebaseStatus = getFirebaseStatus()

  // Calculate stats
  const todayScans = scans.filter(scan =>
    new Date(scan.timestamp).toDateString() === new Date().toDateString()
  ).length

  const processedScans = scans.filter(scan => scan.processed).length

  if (scansLoading || devicesLoading) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary border-t-transparent mx-auto mb-4"></div>
          <p className="text-muted-foreground">Memuat riwayat pemindaian...</p>
        </div>
      </div>
    )
  }

  if (scansError || devicesError) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
        <Card className="max-w-md">
          <CardContent className="pt-6">
            <p className="text-destructive text-center">{scansError || devicesError}</p>
            <Button onClick={() => window.location.reload()} className="w-full mt-4">Muat Ulang</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const processedScansList = scans.map(s => ({
    ...s,
    itemName: s.itemFound ? 'Item Ditemukan' : 'Tidak Ditemukan',
    itemCategory: 'Unknown',
    itemLocation: s.location || 'Unknown',
    timeAgo: new Date(s.timestamp).toLocaleString(),
    status: s.processed ? 'processed' : 'new' as 'new' | 'processed' | 'error'
  }));

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8 space-y-6">
        {/* Header */}
        <div className="animate-fade-in-up">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Activity className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Riwayat Scan</h1>
              <p className="text-sm text-muted-foreground">Pantau aktivitas scan barcode</p>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-in-up">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Scan</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl sm:text-3xl font-bold">{scans.length}</div>
              <p className="text-xs text-muted-foreground">Semua waktu</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Hari Ini</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl sm:text-3xl font-bold">{todayScans}</div>
              <p className="text-xs text-muted-foreground">Scan hari ini</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Berhasil</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl sm:text-3xl font-bold text-emerald-600">{processedScans}</div>
              <p className="text-xs text-muted-foreground">Item ditemukan</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${firebaseStatus.isConfigured ? 'bg-emerald-500' : 'bg-gray-400'}`}></div>
                <span className={`font-medium ${firebaseStatus.isConfigured ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                  {firebaseStatus.isConfigured ? 'Aktif' : 'Offline'}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {firebaseStatus.isConfigured ? 'Real-time aktif' : 'Menunggu koneksi'}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* History Table */}
        <Card className="animate-fade-in-up">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <CardTitle>Riwayat Transaksi</CardTitle>
                <CardDescription>Semua aktivitas scan akan muncul di sini</CardDescription>
              </div>
              <Button variant="outline" size="sm">
                <Download className="w-4 h-4 mr-2" />
                Export
              </Button>
            </div>
            <div className="mt-4 relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Cari barcode, produk..."
                className="pl-10 h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {processedScansList.length === 0 ? (
              <div className="text-center py-12 px-4">
                <Package className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                <h3 className="font-medium text-foreground mb-1">Belum ada riwayat scan</h3>
                <p className="text-sm text-muted-foreground">
                  Scan barcode dengan ESP32 untuk melihat aktivitas di sini
                </p>
              </div>
            ) : (
              <ScanHistory scans={processedScansList} />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}