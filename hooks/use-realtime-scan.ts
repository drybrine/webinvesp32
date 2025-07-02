"use client"

import { createContext, useContext } from "react"

export interface RealtimeScanContextType {
  isScanning: boolean
  lastScannedBarcode: string | null
  scanCount: number
}

export const RealtimeScanContext = createContext<RealtimeScanContextType>({
  isScanning: false,
  lastScannedBarcode: null,
  scanCount: 0,
})

export const useRealtimeScan = () => useContext(RealtimeScanContext)
