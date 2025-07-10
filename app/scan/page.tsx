"use client"

import { useMemo } from "react"
import { useRouter } from "next/navigation"
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
  History,
  Search,
  Filter,
  Download,
  Calendar,
  Package,
  Clock,
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { useFirebaseScans, useFirebaseInventory } from "@/hooks/use-firebase"
import { ScanHistory } from "@/components/scan-history"
import { MobilePopupTester } from "@/components/mobile-popup-tester"

interface ProcessedScanRecord {
  id: string
  barcode: string
  timestamp: number
  deviceId?: string
  itemFound?: boolean
  productName?: string
  location?: string
  [key: string]: any // Allow other properties
}

export default function ScanPage() {
  const router = useRouter()
  const { scans, addScan, loading: scansLoading, error: scansError } = useFirebaseScans()
  const { items, loading: inventoryLoading, error: inventoryError } = useFirebaseInventory()

  const { toast } = useToast()

  const processedScans = useMemo(() => {
    if (inventoryLoading || !items) return scans.map(s => ({...s, productName: 'Memuat...'})); // Handle inventory loading
    return scans.map((scan) => {
      const matchingItem = items.find((item) => item.id === scan.itemId || item.barcode === scan.barcode)
      return {
        ...scan,
        productName: matchingItem?.name || undefined,
      }
    })
  }, [scans, items, inventoryLoading])

  if (scansLoading || inventoryLoading) {
    return (
      <div className="min-h-screen bg-gray-50 p-4 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Memuat riwayat pemindaian...</p>
        </div>
      </div>
    )
  }

  if (scansError || inventoryError) {
    return (
      <div className="min-h-screen bg-gray-50 p-4 flex items-center justify-center">
        <div className="text-center text-red-600">
          <p>Gagal memuat data: { (typeof scansError === 'string' ? scansError : (scansError as any)?.message) || (typeof inventoryError === 'string' ? inventoryError : (inventoryError as any)?.message) }</p>
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
                <History className="w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8 text-white animate-float" />
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
                  <History className="h-4 w-4 text-white" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="relative z-10 pt-0">
              <div className="space-y-2">
                <div className="text-2xl sm:text-3xl font-bold gradient-text">{processedScans.length}</div>
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
                  <Calendar className="h-4 w-4 text-white" />
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
                  <Package className="h-4 w-4 text-white" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="relative z-10 pt-0">
              <div className="space-y-2">
                <div className="text-2xl sm:text-3xl font-bold gradient-text">
                  {processedScans.filter(scan => scan.productName && scan.productName !== 'Memuat...').length}
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
                  <Clock className="h-4 w-4 text-white" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="relative z-10 pt-0">
              <div className="space-y-2">
                <div className="text-lg sm:text-xl font-bold text-orange-600">
                  {processedScans.length > 0 ? 'Aktif' : 'Standby'}
                </div>
                <p className="text-xs text-muted-foreground font-medium">
                  {processedScans.length > 0 ? 'Ada aktivitas' : 'Menunggu scan'}
                </p>
                <div className="w-full bg-muted/50 rounded-full h-1">
                  <div className={`h-1 rounded-full ${processedScans.length > 0 ? 'bg-orange-500 animate-pulse' : 'bg-gray-400'} transition-all duration-300`} 
                       style={{ width: processedScans.length > 0 ? '90%' : '30%' }}></div>
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
              <Input
                placeholder="Cari berdasarkan barcode, nama produk, atau ID..."
                className="pl-12 h-12 glass-card border-0 shadow-medium focus:shadow-large transition-all duration-300 font-medium"
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
                  <h3 className="text-xl font-bold text-foreground mb-3">Belum ada riwayat transaksi</h3>
                  <p className="text-muted-foreground mb-2 font-medium">
                    Riwayat scan barang masuk dan keluar akan muncul di sini
                  </p>
                  <p className="text-sm text-muted-foreground/70">
                    Mulai scan barcode untuk melihat aktivitas real-time
                  </p>
                </div>
                
                {/* Mobile Popup Tester - Only show on mobile screens */}
                <div className="block sm:hidden">
                  <MobilePopupTester />
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
