"use client"

import React, { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { onValue, off, ref } from "firebase/database"
import { database, isFirebaseConfigured } from "@/lib/firebase"
import { ProductInfoPopup } from "./product-info-popup"
import { MobileQuickActionPopup } from "./mobile-quick-action-popup"
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
  const [isMobile, setIsMobile] = useState(false)

  // Detect mobile device and setup
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const checkMobile = () => {
        const userAgent = window.navigator.userAgent
        const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent)
        const isSmallScreen = window.innerWidth <= 768
        const isTouchDevice = 'ontouchstart' in window
        
        console.log('🔍 Mobile Detection:', { 
          userAgent: userAgent.substring(0, 50), 
          isMobileDevice, 
          isSmallScreen, 
          isTouchDevice,
          windowWidth: window.innerWidth,
          pathname
        })
        
        return isMobileDevice || isSmallScreen || isTouchDevice
      }
      
      const mobileStatus = checkMobile()
      setIsMobile(mobileStatus)
      
      // Force wake up Firebase connection on mobile
      if (mobileStatus && isFirebaseConfigured() && database) {
        console.log('📱 Mobile detected - Initializing Firebase connection...')
        
        // Test Firebase connection
        const testRef = ref(database, '.info/connected')
        const unsubscribeTest = onValue(testRef, (snapshot) => {
          const connected = snapshot.val()
          console.log('📱 Firebase connection status:', connected ? 'Connected' : 'Disconnected')
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
        console.log('📐 Resize - Mobile status:', newIsMobile)
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
      console.log('❌ Firebase not configured or database not available')
      return
    }

    console.log('🔥 Setting up Firebase listener for scans...', { isMobile, pathname })

    // Listen to scan events from Firebase Realtime Database
    const scansRef = ref(database, "scans")

    const unsubscribe = onValue(scansRef, (snapshot) => {
      const data = snapshot.val()
      
      console.log('🔥 Firebase scan data received:', { 
        hasData: !!data, 
        dataKeys: data ? Object.keys(data).length : 0,
        isMobile,
        pathname 
      })
      
      if (data) {
        // Get the most recent scan
        const scansArray = Object.keys(data)
          .map((key) => ({
            id: key,
            ...data[key],
          }))
          .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))

        console.log('📊 Scans array:', scansArray.length, 'items')

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
          
          console.log('🔍 Latest scan analysis:', {
            barcode: latestScan.barcode,
            scanTime,
            now,
            scanAge: now - scanTime,
            isRecentScan,
            isScanFromInventoryMode,
            lastScannedBarcode,
            isNewBarcode: latestScan.barcode !== lastScannedBarcode,
            mode: latestScan.mode,
            type: latestScan.type
          })
          
          if (!isScanFromInventoryMode) {
            console.log('⚠️ Skipping non-inventory scan')
            return
          }

          if (isRecentScan && latestScan.barcode !== lastScannedBarcode) {
            console.log('🎯 ESP32 Scan Detection - TRIGGERING POPUP:', {
              barcode: latestScan.barcode,
              timestamp: latestScan.timestamp,
              deviceId: latestScan.deviceId || 'unknown',
              mode: latestScan.mode || 'unknown',
              type: latestScan.type || 'unknown',
              isPopupDisabled,
              pathname,
              isMobile,
              showPopup: showPopup,
              scanAge: now - scanTime,
              userAgent: typeof window !== 'undefined' ? window.navigator.userAgent.substring(0, 50) : 'unknown'
            })
            
            setLastScannedBarcode(latestScan.barcode)
            setCurrentBarcode(latestScan.barcode)
            setScanCount(prev => {
              const newCount = prev + 1
              console.log('📈 Scan count updated:', newCount)
              return newCount
            })
            setIsScanning(true)
            
            // Show popup regardless of device type - popup akan menyesuaikan dengan ukuran layar
            if (!isPopupDisabled) {
              console.log('✅ SHOWING POPUP for ESP32 barcode:', latestScan.barcode)
              setShowPopup(true)
              
              // Enhanced mobile scroll prevention
              if (typeof document !== 'undefined') {
                document.body.classList.add('dialog-open')
                
                // Only apply fixed positioning on actual mobile devices
                if (isMobile) {
                  console.log('📱 Applying mobile-specific scroll prevention')
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
                  console.log('Vibration not supported')
                }
              }
            } else {
              console.log('❌ Popup disabled on page:', pathname)
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
  }, [lastScannedBarcode, isPopupDisabled, pathname, isMobile])

  const handleClosePopup = () => {
    console.log('🔒 Closing ESP32 popup - Mobile:', isMobile)
    setShowPopup(false)
    setCurrentBarcode("")
    
    // Remove body class and restore scroll
    if (typeof document !== 'undefined') {
      document.body.classList.remove('dialog-open')
      if (isMobile) {
        console.log('📱 Restoring mobile scroll')
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