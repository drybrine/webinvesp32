"use client"

import { useState, useEffect, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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

export default function ScanPage() {
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
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Riwayat Pemindaian</h1>
          <p className="text-gray-600 mt-2">Lihat riwayat semua pemindaian barcode yang tercatat dalam sistem.</p>
        </div>

        {/* Main Content */}
        <div className="space-y-8">
          {/* Scan History */}
          <Card>
            <CardHeader>
              <CardTitle>Seluruh Riwayat Pemindaian</CardTitle>
            </CardHeader>
            <CardContent>
              <ScanHistory scans={processedScans} loading={scansLoading} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
