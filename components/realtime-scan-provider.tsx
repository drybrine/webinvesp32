"use client"

import React, { createContext, useContext, useEffect, useState } from "react"
import { onValue, off, ref } from "firebase/database"
import { database, isFirebaseConfigured } from "@/lib/firebase"
import { ProductInfoPopup } from "./product-info-popup"

interface RealtimeScanContextType {
  isScanning: boolean
  lastScannedBarcode: string | null
  scanCount: number
}

const RealtimeScanContext = createContext<RealtimeScanContextType>({
  isScanning: false,
  lastScannedBarcode: null,
  scanCount: 0,
})

export const useRealtimeScan = () => useContext(RealtimeScanContext)

interface RealtimeScanProviderProps {
  children: React.ReactNode
}

export function RealtimeScanProvider({ children }: RealtimeScanProviderProps) {
  const [isScanning, setIsScanning] = useState(false)
  const [lastScannedBarcode, setLastScannedBarcode] = useState<string | null>(null)
  const [scanCount, setScanCount] = useState(0)
  const [showPopup, setShowPopup] = useState(false)
  const [currentBarcode, setCurrentBarcode] = useState("")

  useEffect(() => {
    if (!isFirebaseConfigured() || !database) {
      console.log("Firebase not available for realtime scans")
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
          
          // Check if this is a new scan (within last 5 seconds)
          const now = Date.now()
          const scanTime = latestScan.timestamp || 0
          const isRecentScan = now - scanTime < 5000

          if (isRecentScan && latestScan.barcode !== lastScannedBarcode) {
            setLastScannedBarcode(latestScan.barcode)
            setCurrentBarcode(latestScan.barcode)
            setScanCount(prev => prev + 1)
            setIsScanning(true)
            setShowPopup(true)

            // Reset scanning state after 2 seconds
            setTimeout(() => {
              setIsScanning(false)
            }, 2000)
          }
        }
      }
    })

    return () => {
      if (scansRef && unsubscribe) {
        off(scansRef, "value", unsubscribe)
      }
    }
  }, [lastScannedBarcode])

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