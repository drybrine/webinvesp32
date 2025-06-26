"use client"

import { useState, useEffect, useMemo } from "react"
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
import { Badge } from "@/components/ui/badge"
import {
  History,
  Search,
  Filter,
  Download,
  Calendar,
  Package,
  ArrowUp,
  ArrowDown,
  Clock,
} from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { useFirebaseScans, useFirebaseInventory } from "@/hooks/use-firebase"
import { ScanHistory } from "@/components/scan-history"

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
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-purple-50 to-blue-50 p-3 sm:p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Enhanced Header - Mobile optimized */}
        <div className="mb-6 sm:mb-8 text-center md:text-left px-1">
          <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold bg-gradient-to-r from-purple-600 via-blue-600 to-indigo-600 bg-clip-text text-transparent mb-2 sm:mb-3">
            📋 Riwayat Transaksi
          </h1>
          <p className="text-sm sm:text-base lg:text-lg text-gray-600 font-medium mb-3 sm:mb-4">Lihat riwayat scan masuk dan keluar barang inventaris</p>
          <div className="w-24 sm:w-32 h-1 bg-gradient-to-r from-purple-500 to-blue-500 mx-auto md:mx-0 rounded-full"></div>
        </div>

        {/* Enhanced Stats Cards - Mobile first */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-6 mb-6 sm:mb-8">
          <Card className="relative overflow-hidden bg-gradient-to-br from-blue-50 to-blue-100 border-0 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105">
            <div className="absolute top-0 right-0 w-16 sm:w-20 h-16 sm:h-20 bg-blue-200 rounded-full -mr-8 sm:-mr-10 -mt-8 sm:-mt-10 opacity-20"></div>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 sm:pb-2 relative z-10 p-3 sm:p-4">
              <CardTitle className="text-xs font-semibold text-blue-800 leading-tight">Total Scan</CardTitle>
              <History className="h-3 w-3 sm:h-4 sm:w-4 lg:h-5 lg:w-5 text-blue-600 flex-shrink-0" />
            </CardHeader>
            <CardContent className="relative z-10 p-3 sm:p-4 pt-0 sm:pt-0">
              <div className="text-lg sm:text-xl lg:text-3xl font-bold text-blue-900">0</div>
              <p className="text-xs text-blue-600 font-medium leading-tight">Aktivitas hari ini</p>
            </CardContent>
          </Card>
          
          <Card className="relative overflow-hidden bg-gradient-to-br from-green-50 to-emerald-100 border-0 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105">
            <div className="absolute top-0 right-0 w-16 sm:w-20 h-16 sm:h-20 bg-green-200 rounded-full -mr-8 sm:-mr-10 -mt-8 sm:-mt-10 opacity-20"></div>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 sm:pb-2 relative z-10 p-3 sm:p-4">
              <CardTitle className="text-xs font-semibold text-green-800 leading-tight">Barang Masuk</CardTitle>
              <ArrowUp className="h-3 w-3 sm:h-4 sm:w-4 lg:h-5 lg:w-5 text-green-600 flex-shrink-0" />
            </CardHeader>
            <CardContent className="relative z-10 p-3 sm:p-4 pt-0 sm:pt-0">
              <div className="text-lg sm:text-xl lg:text-3xl font-bold text-green-900">0</div>
              <p className="text-xs text-green-600 font-medium leading-tight">Total scan masuk</p>
            </CardContent>
          </Card>
          
          <Card className="relative overflow-hidden bg-gradient-to-br from-red-50 to-red-100 border-0 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105">
            <div className="absolute top-0 right-0 w-16 sm:w-20 h-16 sm:h-20 bg-red-200 rounded-full -mr-8 sm:-mr-10 -mt-8 sm:-mt-10 opacity-20"></div>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 sm:pb-2 relative z-10 p-3 sm:p-4">
              <CardTitle className="text-xs font-semibold text-red-800 leading-tight">Barang Keluar</CardTitle>
              <ArrowDown className="h-3 w-3 sm:h-4 sm:w-4 lg:h-5 lg:w-5 text-red-600 flex-shrink-0" />
            </CardHeader>
            <CardContent className="relative z-10 p-3 sm:p-4 pt-0 sm:pt-0">
              <div className="text-lg sm:text-xl lg:text-3xl font-bold text-red-900">0</div>
              <p className="text-xs text-red-600 font-medium leading-tight">Total scan keluar</p>
            </CardContent>
          </Card>
          
          <Card className="relative overflow-hidden bg-gradient-to-br from-amber-50 to-amber-100 border-0 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105">
            <div className="absolute top-0 right-0 w-16 sm:w-20 h-16 sm:h-20 bg-amber-200 rounded-full -mr-8 sm:-mr-10 -mt-8 sm:-mt-10 opacity-20"></div>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 sm:pb-2 relative z-10 p-3 sm:p-4">
              <CardTitle className="text-xs font-semibold text-amber-800 leading-tight">Scan Terakhir</CardTitle>
              <Clock className="h-3 w-3 sm:h-4 sm:w-4 lg:h-5 lg:w-5 text-amber-600 flex-shrink-0" />
            </CardHeader>
            <CardContent className="relative z-10 p-3 sm:p-4 pt-0 sm:pt-0">
              <div className="text-lg sm:text-xl lg:text-3xl font-bold text-amber-900">-</div>
              <p className="text-xs text-amber-600 font-medium leading-tight">Belum ada aktivitas</p>
            </CardContent>
          </Card>
        </div>

        {/* Riwayat Table - Mobile optimized */}
        <Card className="shadow-xl border-0 bg-white/80 backdrop-blur-sm">
          <CardHeader className="p-4 sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <div>
                <CardTitle className="text-lg sm:text-xl font-bold">Riwayat Transaksi</CardTitle>
                <CardDescription className="text-sm text-gray-600 mt-1">Lihat semua aktivitas scan barang</CardDescription>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                <Button variant="outline" className="w-full sm:w-auto text-sm">
                  <Download className="mr-2 h-4 w-4" /> Export
                </Button>
              </div>
            </div>
            
            {/* Search and Filter - Mobile stack */}
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:gap-4">
              <div className="relative flex-grow">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cari riwayat..."
                  className="pl-10 w-full h-11"
                />
              </div>
              <div className="flex gap-2 sm:gap-3">
                <Button variant="outline" className="flex-1 sm:flex-none text-sm h-11">
                  <Filter className="mr-2 h-4 w-4" /> Filter
                </Button>
                <Button variant="outline" className="flex-1 sm:flex-none text-sm h-11">
                  <Calendar className="mr-2 h-4 w-4" /> <span className="hidden sm:inline">Tanggal</span>
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0">
            <div className="text-center py-12 sm:py-16">
              <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
                <Package className="h-8 w-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">Belum ada riwayat transaksi</h3>
              <p className="text-sm text-gray-500 mb-1">
                Riwayat scan barang masuk dan keluar akan muncul di sini
              </p>
              <p className="text-xs text-gray-400">
                Mulai scan barcode untuk melihat aktivitas
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
