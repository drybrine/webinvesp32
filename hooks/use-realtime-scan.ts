"use client"

import { createContext, useContext } from "react"

export interface RealtimeScanContextType {
  isScanning: boolean
  lastScannedBarcode: string | null
  scanCount: number
  disablePopupsGlobally?: () => void
  enablePopupsGlobally?: () => void
  popupsGloballyDisabled?: boolean
}

export const RealtimeScanContext = createContext<RealtimeScanContextType>({
  isScanning: false,
  lastScannedBarcode: null,
  scanCount: 0,
  disablePopupsGlobally: undefined,
  enablePopupsGlobally: undefined,
  popupsGloballyDisabled: false,
})

export const useRealtimeScan = () => useContext(RealtimeScanContext)
