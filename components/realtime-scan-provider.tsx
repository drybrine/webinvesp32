"use client"

import type React from "react"
import { createContext, useContext, useEffect, useState } from "react"
import { toast } from "@/hooks/use-toast" //
import { useFirebaseScans, useFirebaseInventory } from "@/hooks/use-firebase" //
import { ProductInfoPopup } from "@/components/product-info-popup" //

// Add these imports
import { Button as UIButton } from "@/components/ui/button";
import { PackageCheck, AlertTriangle, PackagePlus } from 'lucide-react';

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

  const { scans } = useFirebaseScans() //
  const { items } = useFirebaseInventory() //

  // Function to show product info popup
  const showProductInfo = (barcode: string) => {
    setPopupBarcode(barcode)
    setIsPopupOpen(true)
  }

  // Monitor for new scans from ESP32
  useEffect(() => {
    if (!scans || scans.length === 0) return;

    const latestScan = scans[0];

    // Only process ESP32 scans (not manual input or web camera) and not already processed by this provider instance
    if (
      latestScan.deviceId !== "manual_input" && //
      latestScan.deviceId !== "web_camera" && //
      !processedScans.has(latestScan.id) 
    ) {
      // Mark this scan as processed by this provider instance
      setProcessedScans((prev) => new Set(prev).add(latestScan.id));
      setLastScan(latestScan.barcode);

      const product = items.find((item) => item.barcode === latestScan.barcode);

      if (product) {
        toast({
          title: (
            <div className="flex items-center gap-2">
              <PackageCheck className="h-5 w-5 text-green-500" />
              <span className="font-semibold">Produk Ditemukan: {product.name}</span>
            </div>
          ),
          description: (
            <div className="mt-1 space-y-0.5">
              <p className="text-sm">
                Barcode: <span className="font-mono bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">{latestScan.barcode}</span>
              </p>
              <p className="text-sm">Stok Saat Ini: <span className="font-medium">{product.quantity}</span></p>
              <p className="text-sm">Lokasi: <span className="font-medium">{product.location || '-'}</span></p>
            </div>
          ),
          variant: "default",
          action: (
            <UIButton
              variant="outline"
              size="sm"
              onClick={() => showProductInfo(latestScan.barcode)}
              className="mt-2 border-blue-600 text-blue-600 hover:bg-blue-50 hover:text-blue-700 dark:border-blue-500 dark:text-blue-400 dark:hover:bg-blue-900/50 dark:hover:text-blue-300"
            >
              Lihat Detail & Atur Stok
            </UIButton>
          ),
        });
      } else {
        toast({
          title: (
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              <span className="font-semibold">Barcode Baru Terdeteksi</span>
            </div>
          ),
          description: (
            <div className="mt-1 space-y-0.5">
              <p className="text-sm">
                Barcode <span className="font-mono bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">{latestScan.barcode}</span> belum terdaftar.
              </p>
              <p className="text-sm mt-1">Apakah ingin menambahkannya sebagai produk baru?</p>
            </div>
          ),
          variant: "default", 
          action: (
            <UIButton
              variant="default" 
              onClick={() => showProductInfo(latestScan.barcode)}
              className="mt-2 bg-green-600 hover:bg-green-700 text-white dark:bg-green-500 dark:hover:bg-green-600"
            >
              <PackagePlus className="h-4 w-4 mr-2" />
              Tambah Produk
            </UIButton>
          ),
        });

        // Auto-show popup for unregistered products
        setTimeout(() => {
          showProductInfo(latestScan.barcode);
        }, 2500); 
      }

      // Play notification sound
      try {
        const audio = new Audio("/notification.mp3");
        audio.volume = 0.3; 
        audio.play().catch((e) => {
          console.warn("Audio play failed:", e); 
        });
      } catch (error) {
        console.warn("Audio error:", error);
      }
    }
  }, [scans, items, processedScans, showProductInfo]);

  return (
    <RealtimeScanContext.Provider value={{ lastScan, showProductInfo }}>
      {children}
      <ProductInfoPopup barcode={popupBarcode} isOpen={isPopupOpen} onClose={() => setIsPopupOpen(false)} />
    </RealtimeScanContext.Provider>
  )
}