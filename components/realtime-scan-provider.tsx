"use client"

import React, { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { onValue, off, ref, update } from "firebase/database"
import { database, isFirebaseConfigured } from "@/lib/firebase"
import { ESP32_CONFIG, ESP32_HELPERS } from "@/lib/esp32-config"
import { UnifiedQuickActionPopup } from "./unified-quick-action-popup"
import { RealtimeScanContext, type RealtimeScanContextType } from "@/hooks/use-realtime-scan"
import { logger } from "@/lib/logger"

interface RealtimeScanProviderProps {
  children: React.ReactNode
}

export function RealtimeScanProvider({ children }: RealtimeScanProviderProps) {
  const pathname = usePathname()
  const [isScanning, setIsScanning] = useState(false)
  const [lastScannedBarcode, setLastScannedBarcode] = useState<string | null>(null)
  const [lastProcessedScanId, setLastProcessedScanId] = useState<string | null>(null)
  const [scanCount, setScanCount] = useState(0)
  const [showPopup, setShowPopup] = useState(false)
  const [currentBarcode, setCurrentBarcode] = useState("")
  const [isMobile, setIsMobile] = useState(false)
  const [popupsGloballyDisabled, setPopupsGloballyDisabled] = useState(false)

  // Detect mobile device and setup
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Check if popups are globally disabled
      const globallyDisabled = localStorage.getItem('popupsGloballyDisabled') === 'true'
      setPopupsGloballyDisabled(globallyDisabled)
      
      console.log('🔥 Firebase-only mode: No localStorage needed')
      
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
        console.log('📱 Mobile detected - Force initializing Firebase...')
        import('@/lib/firebase').then(({ waitForFirebaseReady }) => {
          waitForFirebaseReady(15000).then((ready) => {
            console.log('📱 Mobile Firebase ready status:', ready)
          })
        })
      }
      
      // Force wake up Firebase connection on mobile
      if (mobileStatus && isFirebaseConfigured() && database) {
        // Mobile detected - Initializing Firebase connection
        
        // Test Firebase connection
        const testRef = ref(database, '.info/connected')
        const unsubscribeTest = onValue(testRef, (snapshot) => {
          const connected = snapshot.val()
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
      const handlePageHide = () => {
        console.log('📱 Page hiding, Firebase listeners will be cleaned up automatically...')
      }
      
      const handleVisibilityChange = () => {
        if (document.hidden) {
          console.log('📱 Page hidden, Firebase listeners paused...')
        } else {
          console.log('📱 Page visible, Firebase listeners active...')
          // Force refresh Firebase connection when page becomes visible
          // This helps with mobile browsers that may pause connections
          if (mobileStatus && isFirebaseConfigured() && database) {
            console.log('🔄 Refreshing Firebase connection for mobile...')
            // Reset scan state to allow fresh detection
            setLastProcessedScanId(null)
            setLastScannedBarcode(null)
          }
        }
      }
      
      const handlePageShow = (event: PageTransitionEvent) => {
        if (event.persisted) {
          console.log('📱 Page restored from bfcache, Firebase listeners reactivated...')
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
    console.log('🔄 Reset scan state for new page:', pathname)
  }, [pathname])

  useEffect(() => {
    // Enhanced Firebase initialization check for mobile
    const setupFirebaseListener = async () => {
      if (!isFirebaseConfigured() || !database) {
        console.log('🔥 Firebase not ready, waiting...')
        
        // Wait for Firebase to be ready (especially important for mobile)
        const { waitForFirebaseReady } = await import('@/lib/firebase')
        const isReady = await waitForFirebaseReady(10000) // Wait up to 10 seconds
        
        if (!isReady) {
          console.error('🔥 Firebase failed to initialize within timeout')
          return
        }
        
        console.log('🔥 Firebase is now ready, setting up listener...')
      }

      // Setting up Firebase listener for scans
      console.log('🔥 Setting up Firebase scan listener for mobile:', isMobile)

      // Listen to scan events from Firebase Realtime Database
      const scansRef = ref(database!, "scans")

      const unsubscribe = onValue(scansRef, (snapshot) => {
      const data = snapshot.val()
      
      console.log('🔥 Firebase scan data received:', {
        hasData: !!data,
        isMobile,
        pathname,
        timestamp: new Date().toISOString()
      })
      
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
          
          // Enhanced scan detection logic
          const now = Date.now()
          const scanTime = latestScan.timestamp || 0
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
          
          
          // SPECIAL HANDLING for ESP32 timestamp issues
          // ESP32 might have wrong timestamp due to NTP sync issues
          // We'll detect "new" ESP32 scans by checking if this scan ID is different from last processed
          const isNewScanFromESP32 = isESP32Device && (latestScan.id !== lastProcessedScanId)
          
          const timeWindow = isESP32Device ? 30000 : 60000 // 30 sec for ESP32 (faster), 1 min for others
          const isRecentScan = scanAge < timeWindow
          
          // For ESP32 devices with timestamp issues, we'll be more lenient
          const isRecentOrNewESP32 = isESP32Device && (isRecentScan || isNewScanFromESP32)
          
          // Enhanced barcode comparison - check if this is truly a new scan event
          const isNewBarcode = latestScan.barcode !== lastScannedBarcode
          
          // Additional check: if scan is very recent (< 2 seconds) and from ESP32, always consider it new
          const isVeryRecentESP32 = isESP32Device && scanAge < 2000
          
          // SPECIAL CASE: ESP32 with old timestamp but new scan ID (timestamp sync issue)
          const isNewESP32ScanDespiteOldTimestamp = isESP32Device && (latestScan.id !== lastProcessedScanId)
          
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
            !latestScan.processed && 
            latestScan.id !== lastProcessedScanId &&
            isScanFromInventoryMode
          )
          
          if (!shouldTriggerPopup) {
            return
          }
          
          console.log('🔍 Scan trigger analysis - POPUP WILL SHOW:', {
            isESP32Device,
            scanAge,
            scanId: latestScan.id,
            lastProcessedId: lastProcessedScanId,
            processed: latestScan.processed,
            barcode: latestScan.barcode,
            deviceId: latestScan.deviceId,
            isScanFromInventoryMode
          })
          
          setLastScannedBarcode(latestScan.barcode)
          setLastProcessedScanId(latestScan.id)
          setCurrentBarcode(latestScan.barcode)
          setScanCount(prev => prev + 1)
          setIsScanning(true)
          
          // Show popup regardless of device type - popup akan menyesuaikan dengan ukuran layar
          if (!isPopupDisabled && !popupsGloballyDisabled) {
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
              } catch (e) {
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
    setupFirebaseListener().then((unsubscribe) => {
      cleanup = unsubscribe
    }).catch((error) => {
      console.error('🔥 Failed to setup Firebase listener:', error)
    })

    // Cleanup function
    return () => {
      if (cleanup) {
        cleanup()
      }
    }
  }, [lastScannedBarcode, lastProcessedScanId, isPopupDisabled, pathname, isMobile, popupsGloballyDisabled])

  const disablePopupsGlobally = () => {
    setPopupsGloballyDisabled(true)
    localStorage.setItem('popupsGloballyDisabled', 'true')
    setShowPopup(false)
    setCurrentBarcode("")
  }

  const handleClosePopup = async () => {
    logger.info('Closing ESP32 popup - Mobile:', isMobile)
    
    // Mark scan as processed in Firebase
    if (lastProcessedScanId && database) {
      try {
        const scanRef = ref(database, `scans/${lastProcessedScanId}`)
        await update(scanRef, { processed: true })
        console.log('✅ Marked scan as processed in Firebase:', lastProcessedScanId)
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