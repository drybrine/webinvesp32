"use client"

import { useState } from "react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Package,
  Search,
  Download,
} from "lucide-react"
import { useFirebaseScans } from "@/hooks/use-firebase"
import { useRealtimeDeviceStatus } from "@/hooks/use-realtime-device-status"
import { getFirebaseStatus } from "@/lib/firebase"
import { downloadCsv } from "@/lib/csv"
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
    new Date(scan.timestamp || Date.now()).toDateString() === new Date().toDateString()
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

  const processedScansList = scans
    .filter(s => {
      if (!searchTerm) return true
      const term = searchTerm.toLowerCase()
      return (
        s.barcode?.toLowerCase().includes(term) ||
        s.deviceId?.toLowerCase().includes(term) ||
        s.location?.toLowerCase().includes(term)
      )
    })
    .map(s => ({
      ...s,
      itemName: s.itemFound ? 'Item Ditemukan' : 'Tidak Ditemukan',
      itemCategory: 'Unknown',
      itemLocation: s.location || 'Unknown',
      timeAgo: new Date(s.timestamp || Date.now()).toLocaleString(),
      status: s.processed ? 'processed' : 'new' as 'new' | 'processed' | 'error'
    }));

  const exportScansToCSV = () => {
    const headers = ["ID", "Barcode", "Device ID", "Timestamp", "Processed", "Location"]
    const rows = scans.map(s => [
      s.id,
      s.barcode || "",
      s.deviceId || "",
      new Date(s.timestamp || Date.now()).toLocaleString(),
      s.processed ? "Ya" : "Tidak",
      s.location || "",
    ])
    downloadCsv(`scan_history_${new Date().toISOString().split("T")[0]}.csv`, [headers, ...rows])
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8 space-y-6">
        {/* Header */}
        <div className="animate-fade-in-up">
          <h1 className="text-3xl sm:text-4xl font-bold text-foreground tracking-tight">Riwayat Scan</h1>
          <p className="text-sm text-muted-foreground mt-1">Pantau aktivitas scan barcode</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 stagger-children">
          <Card className="card-hover">
            <CardHeader className="pb-2">
              <CardTitle className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Total Scan</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold tabular-nums">{scans.length}</div>
              <p className="text-[11px] text-muted-foreground mt-0.5">Semua waktu</p>
            </CardContent>
          </Card>

          <Card className="card-hover">
            <CardHeader className="pb-2">
              <CardTitle className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Hari Ini</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold tabular-nums">{todayScans}</div>
              <p className="text-[11px] text-muted-foreground mt-0.5">Scan hari ini</p>
            </CardContent>
          </Card>

          <Card className="card-hover">
            <CardHeader className="pb-2">
              <CardTitle className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Berhasil</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-emerald-700 tabular-nums">{processedScans}</div>
              <p className="text-[11px] text-muted-foreground mt-0.5">Item ditemukan</p>
            </CardContent>
          </Card>

          <Card className="card-hover">
            <CardHeader className="pb-2">
              <CardTitle className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${firebaseStatus.isConfigured ? 'bg-emerald-500' : 'bg-muted-foreground'}`}></div>
                <span className={`font-semibold text-sm ${firebaseStatus.isConfigured ? 'text-emerald-700' : 'text-muted-foreground'}`}>
                  {firebaseStatus.isConfigured ? 'Aktif' : 'Offline'}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
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
              <Button variant="outline" size="sm" onClick={exportScansToCSV}>
                <Download className="w-4 h-4 mr-2" />
                Export
              </Button>
            </div>
            <div className="mt-4 relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Cari barcode, produk..."
                className="pl-10"
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
