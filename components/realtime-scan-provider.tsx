"use client"

import React, { useCallback, useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { limitToLast, off, onValue, orderByChild, query, ref } from "firebase/database"
import { database, firebaseHelpers, isFirebaseConfigured } from "@/lib/firebase"
import { UnifiedQuickActionPopup } from "./unified-quick-action-popup"
import { RealtimeScanContext, type RealtimeScanContextType } from "@/hooks/use-realtime-scan"
import { logger } from "@/lib/logger"
import { useAuth } from "@/components/auth-provider"
import { canWrite } from "@/types/security"
import { toast } from "@/hooks/use-toast"
import { useScanMode } from "@/hooks/use-scan-mode"
import { useFirebaseInventory, type InventoryItem } from "@/hooks/use-firebase"

interface RealtimeScanProviderProps {
  children: React.ReactNode
}

type IncomingScan = {
  id: string
  barcode: string
  deviceId?: string
  location?: string
  mode?: string
  type?: string
  processed?: boolean
  timestamp?: number | object
}

const scanTimestampMs = (timestamp: IncomingScan["timestamp"]) =>
  typeof timestamp === "number" ? timestamp : 0

export function RealtimeScanProvider({ children }: RealtimeScanProviderProps) {
  const { role } = useAuth()
  const writable = canWrite(role)
  const { scanMode } = useScanMode()
  const { items: inventoryItems, loading: inventoryLoading } = useFirebaseInventory()
  const pathname = usePathname()
  const [isScanning, setIsScanning] = useState(false)
  const [lastScannedBarcode, setLastScannedBarcode] = useState<string | null>(null)
  const [lastProcessedScanId, setLastProcessedScanId] = useState<string | null>(null)
  const [scanCount, setScanCount] = useState(0)
  const [showPopup, setShowPopup] = useState(false)
  const [currentBarcode, setCurrentBarcode] = useState("")
  const [isMobile, setIsMobile] = useState(false)
  const [popupsGloballyDisabled, setPopupsGloballyDisabled] = useState(false)

  // Auto-execute stock adjustment for auto mode (fire-and-forget)
  const autoExecuteStock = useCallback(async (scan: IncomingScan, item: InventoryItem, delta: number, type: "in" | "out") => {
    const txDir = delta > 0 ? "in" : "out"
    try {
      await firebaseHelpers.adjustStock(item.id, delta, {
        type: txDir,
        productName: item.name,
        productBarcode: item.barcode || scan.barcode || "",
        quantity: Math.abs(delta),
        reason: `Stock ${txDir === "in" ? "In" : "Out"} via Scanner (Auto Mode)`,
        operator: "ESP32 Scanner",
        notes: `Auto mode via ESP32 scanner - ${isMobile ? "Mobile" : "Desktop"}`,
      })
      await firebaseHelpers.markScanProcessed(scan.id)
      toast({
        title: type === "in" ? "✅ Auto Stock In" : "✅ Auto Stock Out",
        description: `${item.name} ${delta > 0 ? "+" : ""}${delta} unit.`,
        duration: 2000,
      })
    } catch (err) {
      console.error("auto stock failed:", err)
      toast({
        title: "❌ Auto Stock Gagal",
        description: err instanceof Error ? err.message : "Terjadi kesalahan",
        variant: "destructive",
        duration: 4000,
      })
    }
  }, [isMobile])

  // Detect mobile device and setup
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Check if popups are globally disabled
      const globallyDisabled = localStorage.getItem('popupsGloballyDisabled') === 'true'
      setPopupsGloballyDisabled(globallyDisabled)

      const checkMobile = () => {
        const userAgent = window.navigator.userAgent
        const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent)
        const isSmallScreen = window.innerWidth <= 768
        const isTouchDevice = 'ontouchstart' in window
        
        return isMobileDevice || isSmallScreen || isTouchDevice
      }
      
      const mobileStatus = checkMobile()
      setIsMobile(mobileStatus)
      
      // FORCE Firebase initialization for mobile immediately
      if (mobileStatus) {
        import('@/lib/firebase').then(({ waitForFirebaseReady }) => {
          waitForFirebaseReady(15000)
        })
      }
      
      // Force wake up Firebase connection on mobile
      if (mobileStatus && isFirebaseConfigured() && database) {
        // Mobile detected - Initializing Firebase connection
        
        // Test Firebase connection
        const testRef = ref(database, '.info/connected')
        const unsubscribeTest = onValue(testRef, (snapshot) => {
          snapshot.val() // fire connection listener
          // Firebase connection status available
        })
        
        // Cleanup test listener after 2 seconds
        setTimeout(() => {
          if (testRef && unsubscribeTest) {
            off(testRef, "value", unsubscribeTest)
          }
        }, 2000)
      }
      
      // Modern page lifecycle events (replaces deprecated beforeunload)
      const handlePageHide = () => {}

      const handleVisibilityChange = () => {
        if (!document.hidden && mobileStatus && isFirebaseConfigured() && database) {
          // Refresh scan state when returning to page
          setLastProcessedScanId(null)
          setLastScannedBarcode(null)
        }
      }

      const handlePageShow = (event: PageTransitionEvent) => {
        if (event.persisted) {
          // Reactivate listeners after bfcache
        }
      }
      
      const handleResize = () => {
        const newIsMobile = checkMobile()
        setIsMobile(newIsMobile)
      }
      
      // Add modern event listeners (replaces deprecated unload events)
      window.addEventListener('pagehide', handlePageHide)
      document.addEventListener('visibilitychange', handleVisibilityChange)
      window.addEventListener('pageshow', handlePageShow)
      window.addEventListener('resize', handleResize)
      
      return () => {
        // Cleanup modern event listeners
        window.removeEventListener('pagehide', handlePageHide)
        document.removeEventListener('visibilitychange', handleVisibilityChange)
        window.removeEventListener('pageshow', handlePageShow)
        window.removeEventListener('resize', handleResize)
      }
    }
  }, [pathname])

  // Pages where product popup should be disabled
  const disabledPages: string[] = []
  const isPopupDisabled = disabledPages.includes(pathname)

  // Reset processed scan ID when navigating to different pages
  // This ensures popup can appear again for the same scan on different pages
  useEffect(() => {
    setLastProcessedScanId(null)
    setLastScannedBarcode(null)
  }, [pathname])

  useEffect(() => {
    // Enhanced Firebase initialization check for mobile
    const setupFirebaseListener = async () => {
      if (!isFirebaseConfigured() || !database) {
        // Wait for Firebase to be ready (especially important for mobile)
        const { waitForFirebaseReady } = await import('@/lib/firebase')
        const isReady = await waitForFirebaseReady(10000) // Wait up to 10 seconds

        if (!isReady) {
          return
        }
      }

      // Listen to scan events from Firebase Realtime Database
      const scansRef = query(ref(database!, "scans"), orderByChild("timestamp"), limitToLast(1))

      const unsubscribe = onValue(scansRef, (snapshot) => {
      const data = snapshot.val()

      if (data) {
        // Query is limited to the newest scan, avoiding full scans download/sort on every update.
        const scansArray: IncomingScan[] = Object.keys(data).map((key) => ({
          id: key,
          ...data[key],
        }))

        if (scansArray.length > 0) {
          const latestScan = scansArray[0]
          
          // Enhanced scan detection logic
          const now = Date.now()
          const scanTime = scanTimestampMs(latestScan.timestamp)
          const scanAge = now - scanTime
          
          // Enhanced ESP32 device detection based on actual Firebase data structure
          const isESP32Device = (
            // Primary detection: ESP32-XXXXXXXX pattern from actual data
            latestScan.deviceId?.startsWith('ESP32-') ||
            // Location pattern from actual data
            latestScan.location === 'Warehouse-Scanner' ||
            // Fallback patterns
            latestScan.deviceId?.toLowerCase().includes('esp32') ||
            // Fallback: if no deviceId specified but has recent timestamp, assume ESP32
            (!latestScan.deviceId && scanAge < 2000)
          )

          // Check if the scan is from inventory mode based on actual Firebase data structure
          const isScanFromInventoryMode = (
            latestScan.mode === 'inventory' || 
            latestScan.type === 'inventory_scan' || 
            (!latestScan.mode && !latestScan.type) // For backward compatibility with older scans
          )
          
          // FIXED: Simplified trigger logic to prevent repeated popups
          // Only trigger if this is a NEW scan ID that we haven't processed yet
          const shouldTriggerPopup = (
            isESP32Device && 
            writable &&
            !latestScan.processed && 
            latestScan.id !== lastProcessedScanId &&
            isScanFromInventoryMode
          )
          
          if (!shouldTriggerPopup || inventoryLoading) {
            return
          }

          setLastScannedBarcode(latestScan.barcode)
          setLastProcessedScanId(latestScan.id)
          setCurrentBarcode(latestScan.barcode)
          setScanCount(prev => prev + 1)
          setIsScanning(true)

          // Auto mode: handle stock in/out without popup
          const foundItem = inventoryItems.find(i => i.barcode === latestScan.barcode)
          const isAutoMode = scanMode === "in" || scanMode === "out"
          let autoHandled = false

          if (isAutoMode && foundItem && writable) {
            if (scanMode === "in") {
              autoHandled = true
              autoExecuteStock(latestScan, foundItem, 1, "in")
            } else if (scanMode === "out" && foundItem.quantity >= 1) {
              autoHandled = true
              autoExecuteStock(latestScan, foundItem, -1, "out")
            }
            // out with insufficient stock → fall through to popup
          }

          if (autoHandled) {
            // Auto mode executed — no popup
          } else if (!isPopupDisabled && !popupsGloballyDisabled) {
            setShowPopup(true)

            // Enhanced mobile scroll prevention
            if (typeof document !== 'undefined') {
              document.body.classList.add('dialog-open')

              // Only apply fixed positioning on actual mobile devices
              if (isMobile) {
                document.body.style.overflow = 'hidden'
                document.body.style.position = 'fixed'
                document.body.style.width = '100%'
                document.body.style.height = '100%'
                document.body.style.touchAction = 'none'
              }
            }

            // Auto-vibrate on mobile if supported
            if (isMobile && 'navigator' in window && 'vibrate' in navigator) {
              try {
                navigator.vibrate([200, 100, 200])
              } catch {
                logger.warn('Vibration not supported')
              }
            }
          } else {
            logger.warn('Popup disabled on page:', pathname)
          }

          // Reset scanning state after 1 second (faster)
          setTimeout(() => {
            setIsScanning(false)
          }, 1000)
        }
      }
      }, (error) => {
        console.error("Firebase realtime scan error:", error)
      })

      // Return cleanup function
      return unsubscribe
    }

    // Call the async setup function
    let cleanup: (() => void) | undefined
    let cancelled = false
    setupFirebaseListener().then((unsubscribe) => {
      // If the effect was cleaned up while setup was awaiting, unsubscribe now
      if (cancelled) {
        if (unsubscribe) unsubscribe()
        return
      }
      cleanup = unsubscribe
    }).catch((error) => {
      console.error('🔥 Failed to setup Firebase listener:', error)
    })

    // Cleanup function
    return () => {
      cancelled = true
      if (cleanup) {
        cleanup()
      }
    }
  }, [autoExecuteStock, inventoryItems, inventoryLoading, isPopupDisabled, isMobile, lastProcessedScanId, pathname, popupsGloballyDisabled, scanMode, writable])

  const disablePopupsGlobally = () => {
    setPopupsGloballyDisabled(true)
    localStorage.setItem('popupsGloballyDisabled', 'true')
    setShowPopup(false)
    setCurrentBarcode("")
  }

  const handleClosePopup = async () => {
    logger.info('Closing ESP32 popup - Mobile:', isMobile)
    
    // Mark scan as processed in Firebase
    if (writable && lastProcessedScanId && database) {
      try {
        await firebaseHelpers.markScanProcessed(lastProcessedScanId)
        // scan marked processed
      } catch (error) {
        console.error('❌ Error updating scan processed status:', error)
      }
    }
    
    setShowPopup(false)
    setCurrentBarcode("")
    
    // Remove body class and restore scroll
    if (typeof document !== 'undefined') {
      document.body.classList.remove('dialog-open')
      if (isMobile) {
        document.body.style.overflow = ''
        document.body.style.position = ''
        document.body.style.width = ''
        document.body.style.height = ''
        document.body.style.touchAction = ''
      }
    }
  }

  const contextValue: RealtimeScanContextType = {
    isScanning,
    lastScannedBarcode,
    scanCount,
    disablePopupsGlobally,
    popupsGloballyDisabled,
    enablePopupsGlobally: () => {
      setPopupsGloballyDisabled(false)
      localStorage.setItem('popupsGloballyDisabled', 'false')
    }
  }

  return (
    <RealtimeScanContext.Provider value={contextValue}>
      {children}
      {/* Unified popup that automatically adapts to mobile/desktop */}
      <UnifiedQuickActionPopup
        barcode={currentBarcode}
        isOpen={showPopup}
        onClose={handleClosePopup}
      />
    </RealtimeScanContext.Provider>
  )
}
