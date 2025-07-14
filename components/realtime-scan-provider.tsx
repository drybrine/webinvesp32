"use client"

import React, { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { onValue, off, ref } from "firebase/database"
import { database, isFirebaseConfigured } from "@/lib/firebase"
import { ESP32_CONFIG, ESP32_HELPERS } from "@/lib/esp32-config"
import { ProductInfoPopup } from "./product-info-popup"
import { MobileQuickActionPopup } from "./mobile-quick-action-popup"
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
  const [closedPopups, setClosedPopups] = useState<Set<string>>(new Set())

  // Detect mobile device and setup
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Load closed popups from localStorage
      const savedClosedPopups = localStorage.getItem('closedPopups')
      const savedTimestamp = localStorage.getItem('closedPopupsTimestamp')
      const currentTime = Date.now()
      
      // Clear closed popups if they're older than 24 hours
      if (savedTimestamp && (currentTime - parseInt(savedTimestamp)) > 86400000) {
        localStorage.removeItem('closedPopups')
        localStorage.removeItem('closedPopupsTimestamp')
        // Cleared old closed popups (24h+ old)
      } else if (savedClosedPopups) {
        try {
          const parsed = JSON.parse(savedClosedPopups)
          setClosedPopups(new Set(parsed))
          // Loaded closed popups from localStorage
        } catch (error) {
          console.error('Error parsing closed popups:', error)
        }
      }
      
      // Set timestamp if not exists
      if (!savedTimestamp) {
        localStorage.setItem('closedPopupsTimestamp', currentTime.toString())
      }
      
      const checkMobile = () => {
        const userAgent = window.navigator.userAgent
        const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent)
        const isSmallScreen = window.innerWidth <= 768
        const isTouchDevice = 'ontouchstart' in window
        
        return isMobileDevice || isSmallScreen || isTouchDevice
      }
      
      const mobileStatus = checkMobile()
      setIsMobile(mobileStatus)
      
      // Force wake up Firebase connection on mobile
      if (mobileStatus && isFirebaseConfigured() && database) {
        // Mobile detected - Initializing Firebase connection
        
        // Test Firebase connection
        const testRef = ref(database, '.info/connected')
        const unsubscribeTest = onValue(testRef, (snapshot) => {
          const connected = snapshot.val()
          // Firebase connection status available
        })
        
        // Cleanup test listener after 5 seconds
        setTimeout(() => {
          if (testRef && unsubscribeTest) {
            off(testRef, "value", unsubscribeTest)
          }
        }, 5000)
      }
      
      const handleResize = () => {
        const newIsMobile = checkMobile()
        setIsMobile(newIsMobile)
      }
      
      window.addEventListener('resize', handleResize)
      return () => window.removeEventListener('resize', handleResize)
    }
  }, [pathname])

  // Pages where product popup should be disabled
  const disabledPages = ['/absensi']
  const isPopupDisabled = disabledPages.includes(pathname)

  useEffect(() => {
    if (!isFirebaseConfigured() || !database) {
      // Firebase not configured or database not available
      return
    }

    // Setting up Firebase listener for scans

    // Listen to scan events from Firebase Realtime Database
    const scansRef = ref(database, "scans")

    const unsubscribe = onValue(scansRef, (snapshot) => {
      const data = snapshot.val()
      
      console.log('🔥 Firebase scan data received:', { 
        hasData: !!data, 
        dataKeys: data ? Object.keys(data).length : 0
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
          
          // Enhanced ESP32 device detection using ESP32_CONFIG constants
          const isESP32Device = (
            // Primary detection using ESP32_HELPERS
            ESP32_HELPERS.isESP32Device(latestScan.deviceId) ||
            ESP32_HELPERS.isESP32Location(latestScan.location) ||
            // Secondary patterns
            latestScan.source?.toLowerCase().includes('esp32') ||
            // Test devices
            latestScan.deviceId?.toLowerCase().includes('test') ||
            latestScan.deviceId?.toLowerCase().includes('mobile-test') ||
            latestScan.deviceId?.toLowerCase().includes('desktop-test') ||
            // Fallback: if no deviceId specified but has recent timestamp, assume ESP32
            (!latestScan.deviceId && scanAge < 5000)
          )
          
          // SPECIAL HANDLING for ESP32 timestamp issues
          // ESP32 might have wrong timestamp due to NTP sync issues
          // We'll detect "new" ESP32 scans by checking if this scan ID is different from last processed
          const isNewScanFromESP32 = isESP32Device && (latestScan.id !== lastScannedBarcode)
          
          const timeWindow = isESP32Device ? 300000 : 60000 // 5 min for ESP32, 1 min for others
          const isRecentScan = scanAge < timeWindow
          
          // For ESP32 devices with timestamp issues, we'll be more lenient
          const isRecentOrNewESP32 = isESP32Device && (isRecentScan || isNewScanFromESP32)
          
          // Enhanced barcode comparison - check if this is truly a new scan event
          const isNewBarcode = latestScan.barcode !== lastScannedBarcode
          
          // Additional check: if scan is very recent (< 5 seconds) and from ESP32, always consider it new
          const isVeryRecentESP32 = isESP32Device && scanAge < 5000
          
          // SPECIAL CASE: ESP32 with old timestamp but new scan ID (timestamp sync issue)
          const isNewESP32ScanDespiteOldTimestamp = isESP32Device && (latestScan.id !== lastProcessedScanId)
          
          // Check if the scan is from inventory mode (matching ESP32 .ino logic)
          const isScanFromInventoryMode = (
            latestScan.mode === ESP32_CONFIG.MODES.INVENTORY || 
            latestScan.type === ESP32_CONFIG.SCAN_TYPES.INVENTORY || 
            (!latestScan.mode && !latestScan.type) // For backward compatibility with older scans
          )
          
          
          if (!isScanFromInventoryMode) {
            return
          }

          // Enhanced trigger logic: popup should appear if:
          // 1. It's a new barcode AND recent scan, OR
          // 2. It's a very recent ESP32 scan (regardless of barcode), OR  
          // 3. It's an ESP32 device with a scan younger than 5 minutes, OR
          // 4. It's a NEW ESP32 scan despite old timestamp (NTP sync issue)
          const shouldTriggerPopup = (
            (isNewBarcode && isRecentScan) ||
            isVeryRecentESP32 ||
            (isESP32Device && isRecentScan) ||
            isNewESP32ScanDespiteOldTimestamp
          )
          
          
          if (shouldTriggerPopup) {
            // Check if this popup was already closed
            const popupKey = `${latestScan.id}_${latestScan.barcode}`
            
            if (closedPopups.has(popupKey)) {
              return
            }
            
            
            setLastScannedBarcode(latestScan.barcode)
            setLastProcessedScanId(latestScan.id)
            setCurrentBarcode(latestScan.barcode)
            setScanCount(prev => prev + 1)
            setIsScanning(true)
            
            // Show popup regardless of device type - popup akan menyesuaikan dengan ukuran layar
            if (!isPopupDisabled) {
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
  }, [lastScannedBarcode, lastProcessedScanId, isPopupDisabled, pathname, isMobile])

  const handleClosePopup = () => {
    logger.info('Closing ESP32 popup - Mobile:', isMobile)
    
    // Mark this popup as closed to prevent it from showing again
    if (lastProcessedScanId && currentBarcode) {
      const popupKey = `${lastProcessedScanId}_${currentBarcode}`
      const newClosedPopups = new Set(closedPopups)
      newClosedPopups.add(popupKey)
      setClosedPopups(newClosedPopups)
      
      // Save to localStorage for persistence across page reloads
      try {
        localStorage.setItem('closedPopups', JSON.stringify(Array.from(newClosedPopups)))
        localStorage.setItem('closedPopupsTimestamp', Date.now().toString())
        logger.info('💾 Saved closed popup to localStorage:', popupKey)
      } catch (error) {
        console.error('Error saving closed popups:', error)
      }
      
      // Clean up old entries (keep only last 50 to prevent localStorage bloat)
      if (newClosedPopups.size > 50) {
        const closedArray = Array.from(newClosedPopups)
        const recentClosed = new Set(closedArray.slice(-50))
        setClosedPopups(recentClosed)
        localStorage.setItem('closedPopups', JSON.stringify(Array.from(recentClosed)))
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
  }

  return (
    <RealtimeScanContext.Provider value={contextValue}>
      {children}
      {/* Always use the main ProductInfoPopup but with mobile-responsive design */}
      <ProductInfoPopup
        barcode={currentBarcode}
        isOpen={showPopup}
        onClose={handleClosePopup}
      />
    </RealtimeScanContext.Provider>
  )
}