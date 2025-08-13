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
  Filter,
  Download,
  CheckCircle,
  Clock,
  Wifi,
  Activity,
} from "lucide-react"
import {
  useFirebaseScans,
  ScanRecord,
} from "@/hooks/use-firebase"
import { useRealtimeDeviceStatus } from "@/hooks/use-realtime-device-status"
import { getFirebaseStatus } from "@/lib/firebase"
import { ScanHistory } from "@/components/scan-history"

interface ScanStats {
  totalScans: number
  newScans: number
  processedScans: number
  errorScans: number
  lastScanTime?: string
  averageProcessingTime?: string
}

export default function ScanPage() {
  const [searchTerm, setSearchTerm] = useState("")
  const [scanStats, setScanStats] = useState<ScanStats>({
    totalScans: 0,
    newScans: 0,
    processedScans: 0,
    errorScans: 0,
  })

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

  useEffect(() => {
    const updateStats = () => {
      const total = scans.length;
      const newScans = scans.filter(s => !s.processed).length;
      const processedScans = scans.filter(s => s.processed).length;
      const errorScans = 0; // No error status in current ScanRecord type

      setScanStats({
        totalScans: total,
        newScans: newScans,
        processedScans: processedScans,
        errorScans: errorScans,
      });
    };

    updateStats();
    const interval = setInterval(updateStats, 1000); // Update every second
    return () => clearInterval(interval);
  }, [scans]);

  const processedScans = scans.map(s => ({
    ...s, 
    itemName: s.itemFound ? 'Item Found' : 'Not Found',
    itemCategory: 'Unknown',
    itemLocation: s.location || 'Unknown',
    timeAgo: new Date(s.timestamp).toLocaleString(),
    status: s.processed ? 'processed' : 'new' as 'new' | 'processed' | 'error'
  }));

  if (scansLoading || devicesLoading) {
    return (
      <div className="min-h-screen bg-gray-50 p-4 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Memuat riwayat pemindaian...</p>
        </div>
      </div>
    )
  }

  if (scansError || devicesError) {
    return (
      <div className="min-h-screen bg-gray-50 p-4 flex items-center justify-center">
        <div className="text-center text-red-600">
          <p>Gagal memuat data: {scansError || devicesError}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen gradient-surface p-3 sm:p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Enhanced Header with modern design - Mobile responsive */}
        <div className="mb-6 sm:mb-8 md:mb-10 text-center md:text-left animate-fade-in-up">
          <div className="flex flex-col sm:flex-row items-center justify-center md:justify-start mb-4 sm:mb-6 gap-3 sm:gap-4">
            <div className="relative">
              <div className="absolute -inset-1 gradient-primary rounded-full blur opacity-30 animate-pulse"></div>
              <div className="relative w-10 h-10 sm:w-12 sm:h-12 md:w-16 md:h-16 gradient-secondary rounded-full flex items-center justify-center shadow-colored">
                <Activity className="w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8 text-white animate-float" />
              </div>
            </div>
            <div className="text-center md:text-left">
              <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold gradient-text tracking-tight">
                Riwayat Transaksi
              </h1>
              <p className="text-xs sm:text-sm md:text-base lg:text-lg text-muted-foreground font-medium mt-1 sm:mt-2">
                Pantau aktivitas scan dan transaksi inventaris
              </p>
            </div>
          </div>
          <div className="flex items-center justify-center md:justify-start space-x-4">
            <div className="h-1 w-16 gradient-secondary rounded-full animate-pulse"></div>
            <div className="h-1 w-8 gradient-primary rounded-full animate-pulse animation-delay-200"></div>
            <div className="h-1 w-4 gradient-accent rounded-full animate-pulse animation-delay-400"></div>
          </div>
        </div>

        {/* Enhanced Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 md:gap-8 mb-8 sm:mb-10 animate-fade-in-up animation-delay-200">
          <Card className="glass-card card-hover shadow-medium hover:shadow-colored transition-all duration-500 group">
            <div className="absolute inset-0 gradient-primary opacity-5 rounded-xl"></div>
            <CardHeader className="relative z-10 pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-muted-foreground">Total Scan</CardTitle>
                <div className="p-2 gradient-primary rounded-lg shadow-sm">
                  <Package className="h-4 w-4 text-white" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="relative z-10 pt-0">
              <div className="space-y-2">
                <div className="text-2xl sm:text-3xl font-bold gradient-text">{scanStats.totalScans}</div>
                <p className="text-xs text-muted-foreground font-medium">Semua waktu</p>
                <div className="w-full bg-muted/50 rounded-full h-1">
                  <div className="gradient-primary h-1 rounded-full w-full animate-pulse"></div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card card-hover shadow-medium hover:shadow-colored transition-all duration-500 group">
            <div className="absolute inset-0 gradient-secondary opacity-5 rounded-xl"></div>
            <CardHeader className="relative z-10 pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-muted-foreground">Hari Ini</CardTitle>
                <div className="p-2 gradient-secondary rounded-lg shadow-sm">
                  <Clock className="h-4 w-4 text-white" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="relative z-10 pt-0">
              <div className="space-y-2">
                <div className="text-2xl sm:text-3xl font-bold gradient-text">
                  {processedScans.filter(scan => 
                    new Date(scan.timestamp).toDateString() === new Date().toDateString()
                  ).length}
                </div>
                <p className="text-xs text-muted-foreground font-medium">Scan hari ini</p>
                <div className="w-full bg-muted/50 rounded-full h-1">
                  <div className="gradient-secondary h-1 rounded-full w-3/4 animate-pulse"></div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card card-hover shadow-medium hover:shadow-colored transition-all duration-500 group">
            <div className="absolute inset-0 gradient-accent opacity-5 rounded-xl"></div>
            <CardHeader className="relative z-10 pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-muted-foreground">Scan Berhasil</CardTitle>
                <div className="p-2 gradient-accent rounded-lg shadow-sm">
                  <CheckCircle className="h-4 w-4 text-white" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="relative z-10 pt-0">
              <div className="space-y-2">
                <div className="text-2xl sm:text-3xl font-bold gradient-text">
                  {processedScans.filter(scan => scan.status === 'processed').length}
                </div>
                <p className="text-xs text-muted-foreground font-medium">Item ditemukan</p>
                <div className="w-full bg-muted/50 rounded-full h-1">
                  <div className="bg-emerald-500 h-1 rounded-full w-4/5 animate-pulse"></div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card card-hover shadow-medium hover:shadow-colored transition-all duration-500 group">
            <div className="absolute inset-0 bg-orange-500 opacity-5 rounded-xl"></div>
            <CardHeader className="relative z-10 pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-muted-foreground">Status Real-time</CardTitle>
                <div className="p-2 bg-orange-500 rounded-lg shadow-sm">
                  <Wifi className="h-4 w-4 text-white" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="relative z-10 pt-0">
              <div className="space-y-2">
                                  <div className="text-lg sm:text-xl font-bold text-orange-600">
                   {firebaseStatus.isConfigured ? 'Aktif' : 'Offline'}
                  </div>
                  <p className="text-xs text-muted-foreground font-medium">
                   {firebaseStatus.isConfigured ? 'Ada aktivitas' : 'Menunggu scan'}
                  </p>
                  <div className="w-full bg-muted/50 rounded-full h-1">
                   <div className={`h-1 rounded-full ${firebaseStatus.isConfigured ? 'bg-orange-500 animate-pulse' : 'bg-gray-400'} transition-all duration-300`} 
                        style={{ width: firebaseStatus.isConfigured ? '90%' : '30%' }}></div>
                  </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Enhanced History Table */}
        <Card className="glass-card shadow-large hover:shadow-extra-large transition-all duration-500 animate-fade-in-up animation-delay-600">
          <CardHeader className="p-6 sm:p-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-2xl font-bold gradient-text">Riwayat Transaksi</CardTitle>
                <CardDescription className="text-sm text-muted-foreground mt-2 font-medium">
                  Pantau semua aktivitas scan barang real-time
                </CardDescription>
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <Button variant="outline" className="glass-card hover:shadow-medium btn-modern font-semibold">
                  <Download className="mr-2 h-4 w-4" />
                  Export Data
                </Button>
                <Button variant="outline" className="glass-card hover:shadow-medium btn-modern font-semibold">
                  <Filter className="mr-2 h-4 w-4" />
                  Filter
                </Button>
              </div>
            </div>
            
            {/* Enhanced Search */}
            <div className="mt-6 relative">
              <Search className="absolute left-4 top-4 h-5 w-5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Cari berdasarkan barcode, nama produk, atau ID..."
                className="pl-12 h-12 glass-card border-0 shadow-medium focus:shadow-large transition-all duration-300 font-medium"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </CardHeader>
          
          <CardContent className="p-6 sm:p-8 pt-0">
            {processedScans.length === 0 ? (
              <div className="space-y-8">
                <div className="text-center py-16 sm:py-20">
                  <div className="relative mx-auto mb-6">
                    <div className="absolute -inset-1 gradient-primary rounded-full blur opacity-20"></div>
                    <div className="relative w-20 h-20 mx-auto glass-card rounded-full flex items-center justify-center shadow-large">
                      <Package className="h-10 w-10 text-muted-foreground" />
                    </div>
                  </div>
                  <h2 className="text-xl font-bold text-foreground mb-3">Belum ada riwayat transaksi</h2>
                  <p className="text-muted-foreground mb-2 font-medium">
                    Riwayat scan barang masuk dan keluar akan muncul di sini
                  </p>
                  <p className="text-sm text-muted-foreground/70">
                    Mulai scan barcode untuk melihat aktivitas real-time
                  </p>
                </div>
              </div>
            ) : (
              <ScanHistory scans={processedScans} />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
