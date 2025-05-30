"use client"

import type React from "react"

import { createContext, useContext, useEffect, useState } from "react"
import { toast } from "@/hooks/use-toast"
import { useFirebaseScans, useFirebaseInventory } from "@/hooks/use-firebase"
import { ProductInfoPopup } from "@/components/product-info-popup"

interface RealtimeScanContextType {
  lastScan: string | null
  showProductInfo: (barcode: string) => void
}

const RealtimeScanContext = createContext<RealtimeScanContextType>({
  lastScan: null,
  showProductInfo: () => {},
})

export const useRealtimeScan = () => useContext(RealtimeScanContext)

interface RealtimeScanProviderProps {
  children: React.ReactNode
}

export function RealtimeScanProvider({ children }: RealtimeScanProviderProps) {
  const [lastScan, setLastScan] = useState<string | null>(null)
  const [popupBarcode, setPopupBarcode] = useState<string>("")
  const [isPopupOpen, setIsPopupOpen] = useState(false)
  const [processedScans, setProcessedScans] = useState<Set<string>>(new Set())

  const { scans } = useFirebaseScans()
  const { items } = useFirebaseInventory()

  // Function to show product info popup
  const showProductInfo = (barcode: string) => {
    setPopupBarcode(barcode)
    setIsPopupOpen(true)
  }

  // Monitor for new scans from ESP32
  useEffect(() => {
    if (!scans || scans.length === 0) return

    const latestScan = scans[0]

    // Only process ESP32 scans (not manual input or web camera)
    if (
      latestScan.deviceId !== "manual_input" &&
      latestScan.deviceId !== "web_camera" &&
      !processedScans.has(latestScan.id)
    ) {
      // Mark this scan as processed
      setProcessedScans((prev) => new Set(prev).add(latestScan.id))
      setLastScan(latestScan.barcode)

      // Find the product
      const product = items.find((item) => item.barcode === latestScan.barcode)

      // Show toast notification
      toast({
        title: "🔍 Barcode Terdeteksi",
        description: product
          ? `${product.name} - Stok: ${product.quantity}`
          : `Barcode ${latestScan.barcode} tidak terdaftar`,
        variant: product ? "default" : "destructive",
        duration: 5000,
        action: (
          <button
            onClick={() => showProductInfo(latestScan.barcode)}
            className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
          >
            Detail
          </button>
        ),
      })

      // Auto-show popup for unregistered products
      if (!product) {
        setTimeout(() => {
          showProductInfo(latestScan.barcode)
        }, 2000)
      }

      // Play notification sound
      try {
        const audio = new Audio("/notification.mp3")
        audio.volume = 0.3
        audio.play().catch(() => {
          // Ignore audio play errors (browser restrictions)
        })
      } catch (error) {
        // Ignore audio errors
      }
    }
  }, [scans, items, processedScans])

  return (
    <RealtimeScanContext.Provider value={{ lastScan, showProductInfo }}>
      {children}
      <ProductInfoPopup barcode={popupBarcode} isOpen={isPopupOpen} onClose={() => setIsPopupOpen(false)} />
    </RealtimeScanContext.Provider>
  )
}
