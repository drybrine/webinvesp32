"use client"

import React, { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { onValue, off, ref } from "firebase/database"
import { database, isFirebaseConfigured } from "@/lib/firebase"
import { ProductInfoPopup } from "./product-info-popup"
import { RealtimeScanContext, type RealtimeScanContextType } from "@/hooks/use-realtime-scan"

interface RealtimeScanProviderProps {
  children: React.ReactNode
}

export function RealtimeScanProvider({ children }: RealtimeScanProviderProps) {
  const pathname = usePathname()
  const [isScanning, setIsScanning] = useState(false)
  const [lastScannedBarcode, setLastScannedBarcode] = useState<string | null>(null)
  const [scanCount, setScanCount] = useState(0)
  const [showPopup, setShowPopup] = useState(false)
  const [currentBarcode, setCurrentBarcode] = useState("")

  // Pages where product popup should be disabled
  const disabledPages = ['/absensi']
  const isPopupDisabled = disabledPages.includes(pathname)

  useEffect(() => {
    if (!isFirebaseConfigured() || !database) {
      return
    }

    // Listen to scan events from Firebase Realtime Database
    const scansRef = ref(database, "scans")

    const unsubscribe = onValue(scansRef, (snapshot) => {
      const data = snapshot.val()
      
      if (data) {
        // Get the most recent scan
        const scansArray = Object.keys(data)
          .map((key) => ({
            id: key,
            ...data[key],
          }))
          .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))

        if (scansArray.length > 0) {
          const latestScan = scansArray[0]
          
          // Check if this is a new scan (within last 30 seconds)
          const now = Date.now()
          const scanTime = latestScan.timestamp || 0
          const isRecentScan = now - scanTime < 30000

          // Check if the scan is from inventory mode
          const isScanFromInventoryMode = (
            latestScan.mode === "inventory" || 
            latestScan.type === "inventory_scan" || 
            (!latestScan.mode && !latestScan.type) // For backward compatibility with older scans
          )
          
          if (!isScanFromInventoryMode) {
            // Skip processing scans from attendance mode
            return
          }

          if (isRecentScan && latestScan.barcode !== lastScannedBarcode) {
            setLastScannedBarcode(latestScan.barcode)
            setCurrentBarcode(latestScan.barcode)
            setScanCount(prev => prev + 1)
            setIsScanning(true)
            
            // Only show popup if not on disabled pages
            if (!isPopupDisabled) {
              setShowPopup(true)
            }

            // Reset scanning state after 2 seconds
            setTimeout(() => {
              setIsScanning(false)
            }, 2000)
          }
        }
      }
    }, (error) => {
      console.error("Firebase realtime scan error:", error)
    })

    return () => {
      if (scansRef && unsubscribe) {
        off(scansRef, "value", unsubscribe)
      }
    }
  }, [lastScannedBarcode, isPopupDisabled, pathname])

  const handleClosePopup = () => {
    setShowPopup(false)
    setCurrentBarcode("")
  }

  const contextValue: RealtimeScanContextType = {
    isScanning,
    lastScannedBarcode,
    scanCount,
  }

  return (
    <RealtimeScanContext.Provider value={contextValue}>
      {children}
      <ProductInfoPopup
        barcode={currentBarcode}
        isOpen={showPopup}
        onClose={handleClosePopup}
      />
    </RealtimeScanContext.Provider>
  )
}