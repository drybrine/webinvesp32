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
import { useToast } from "@/hooks/use-toast"
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

export default function RiwayatPage() {
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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8 text-center md:text-left">
          <h1 className="text-4xl font-bold text-gray-900">📋 Riwayat Transaksi</h1>
          <p className="text-gray-600">Lihat riwayat scan masuk dan keluar barang inventaris</p>
        </div>

        {/* Stats Cards untuk Riwayat */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Scan Hari Ini</CardTitle>
              <History className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">0</div>
              <p className="text-xs text-muted-foreground">Aktivitas scan hari ini</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Barang Masuk</CardTitle>
              <ArrowUp className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">0</div>
              <p className="text-xs text-muted-foreground">Total scan masuk</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Barang Keluar</CardTitle>
              <ArrowDown className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">0</div>
              <p className="text-xs text-muted-foreground">Total scan keluar</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Scan Terakhir</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">-</div>
              <p className="text-xs text-muted-foreground">Belum ada aktivitas</p>
            </CardContent>
          </Card>
        </div>

        {/* Riwayat Table */}
        <Card>
          <CardHeader>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <CardTitle>Riwayat Transaksi</CardTitle>
              <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
                <Button variant="outline" className="w-full sm:w-auto">
                  <Download className="mr-2 h-4 w-4" /> Export Riwayat
                </Button>
              </div>
            </div>
            <div className="mt-4 flex flex-col md:flex-row gap-4">
              <div className="relative flex-grow">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cari riwayat (barcode, nama produk...)"
                  className="pl-9 w-full"
                />
              </div>
              <div className="flex gap-4">
                <Button variant="outline" className="w-full md:w-auto">
                  <Filter className="mr-2 h-4 w-4" /> Filter
                </Button>
                <Button variant="outline" className="w-full md:w-auto">
                  <Calendar className="mr-2 h-4 w-4" /> Tanggal
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8">
              <Package className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <p className="text-gray-500">Belum ada riwayat transaksi</p>
              <p className="text-sm text-gray-400 mt-2">
                Riwayat scan barang masuk dan keluar akan muncul di sini
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
