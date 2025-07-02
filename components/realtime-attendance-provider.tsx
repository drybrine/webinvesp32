"use client"

import React, { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { onValue, off, ref } from "firebase/database"
import { database, isFirebaseConfigured, auth } from "@/lib/firebase"
import { useFirebaseAttendance } from "@/hooks/use-firebase"
import { useToast } from "@/hooks/use-toast"
import { startDeviceStatusMonitor, stopDeviceStatusMonitor } from "@/lib/device-status-monitor"
import { RealtimeAttendanceContext, type RealtimeAttendanceContextType } from "@/hooks/use-realtime-attendance"
import { onAuthStateChanged } from "firebase/auth"

interface RealtimeAttendanceProviderProps {
  children: React.ReactNode
}

// Inner component that uses Firebase hooks only when authenticated
function AuthenticatedAttendanceProvider({ children }: RealtimeAttendanceProviderProps) {
  const pathname = usePathname()
  const { addAttendance, attendance } = useFirebaseAttendance()
  const { toast } = useToast()
  
  const [isProcessing, setIsProcessing] = useState(false)
  const [lastProcessedNim, setLastProcessedNim] = useState<string | null>(null)
  const [processCount, setProcessCount] = useState(0)
  const [processedScans, setProcessedScans] = useState<Set<string>>(new Set())
  const [lastProcessedTime, setLastProcessedTime] = useState<number>(0)

  // Only active on attendance page
  const isAttendancePage = pathname === "/absensi"

  // Debounce settings
  const DEBOUNCE_DELAY = 3000 // 3 seconds (increased from 2)
  const DUPLICATE_TIMEOUT = 15000 // 15 seconds (increased from 10)

  useEffect(() => {
    if (!isAttendancePage || !isFirebaseConfigured() || !database) {
      return
    }

    // Cleanup old processed scans every 30 seconds
    const cleanupInterval = setInterval(() => {
      const currentTime = Date.now()
      setProcessedScans(prev => {
        const newSet = new Set<string>()
        prev.forEach(scanKey => {
          const parts = scanKey.split("-")
          if (parts.length >= 2) {
            const scanTimestamp = parseInt(parts[parts.length - 1]) * 1000
            if (currentTime - scanTimestamp < DUPLICATE_TIMEOUT) {
              newSet.add(scanKey)
            }
          }
        })
        console.log(`🧹 Cleaned up processed scans: ${prev.size} -> ${newSet.size}`)
        return newSet
      })
    }, 30000)

    // Listen to ESP32 scans from Firebase Realtime Database
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
          
          // Check if this is a new scan (within last 15 seconds)
          const now = Date.now()
          const scanTime = latestScan.timestamp || 0
          const isRecentScan = now - scanTime < 15000
          
          // Check if the scan is from attendance mode - IMPORTANT
          const isScanFromAttendanceMode = (latestScan.mode === "attendance" || latestScan.type === "attendance_scan")
          if (!isScanFromAttendanceMode) {
            // Skip processing scans from inventory mode
            console.log(`⏭️ Skipping non-attendance scan in attendance provider: ${latestScan.barcode} (mode: ${latestScan.mode || "unknown"}, type: ${latestScan.type || "unknown"})`)
            return
          }
          
          console.log(`📝 Processing attendance scan: ${latestScan.barcode} (mode: ${latestScan.mode || "unknown"}, type: ${latestScan.type || "unknown"})`)

          // Create unique scan identifier
          const scanKey = `${latestScan.barcode}-${Math.floor(scanTime / 1000)}`
          const currentTime = Date.now()
          
          // Multiple duplicate prevention checks
          // 1. Debounce check - prevent processing same barcode within DEBOUNCE_DELAY
          if (lastProcessedNim === latestScan.barcode && 
              (currentTime - lastProcessedTime) < DEBOUNCE_DELAY) {
            console.log(`🚫 Debounced duplicate scan: ${latestScan.barcode} (${currentTime - lastProcessedTime}ms ago)`)
            return
          }
          
          // 2. Check if this exact scan was already processed
          if (processedScans.has(scanKey)) {
            console.log(`🚫 Already processed scan: ${latestScan.barcode} (${scanKey})`)
            return
          }
          
          // 3. Check for any duplicate NIM within timeout period
          const duplicateKey = Array.from(processedScans).find(key => 
            key.startsWith(latestScan.barcode + "-") && 
            (currentTime - parseInt(key.split("-")[1]) * 1000) < DUPLICATE_TIMEOUT
          )
          
          if (duplicateKey) {
            console.log(`🚫 Duplicate NIM within timeout: ${latestScan.barcode} (previous: ${duplicateKey})`)
            return
          }
          
          if (isRecentScan) {
            console.log(`✅ Processing new ESP32 scan: ${latestScan.barcode} (${scanKey})`)
            
            // Show immediate detection notification
            toast({
              title: "📱 QR Code Terdeteksi!",
              description: `ESP32 Scanner mendeteksi QR Code: ${latestScan.barcode}`,
            })
            
            processESP32Scan(latestScan.barcode, latestScan.deviceId || "esp32", scanKey)
          }
        }
      }
    })

    return () => {
      clearInterval(cleanupInterval)
      if (scansRef && unsubscribe) {
        off(scansRef, "value", unsubscribe)
      }
    }
  }, [isAttendancePage, processedScans, lastProcessedNim, lastProcessedTime])

  // Device Status Monitor Effect
  useEffect(() => {
    // Start the device status monitor when component mounts
    console.log("🔧 Starting device status monitor from attendance provider...")
    const monitor = startDeviceStatusMonitor()
    
    // Cleanup function
    return () => {
      console.log("🛑 Stopping device status monitor from attendance provider...")
      stopDeviceStatusMonitor()
    }
  }, [])

  const processESP32Scan = async (barcode: string, deviceId: string, scanKey: string) => {
    try {
      setIsProcessing(true)
      
      // Mark this scan as processed
      setProcessedScans(prev => new Set(prev.add(scanKey)))
      
      // Extract NIM from barcode (assume barcode is NIM or contains NIM)
      const nim = barcode.trim()
      
      // Validate NIM format (basic validation)
      if (!nim || nim.length < 8) {
        toast({
          title: "QR Code Tidak Valid",
          description: `Format NIM tidak valid: ${nim}`,
          variant: "destructive"
        })
        return
      }

      // Check if already scanned today
      const today = new Date().toDateString()
      const todayAttendance = attendance.filter(record => 
        new Date(record.timestamp).toDateString() === today
      )
      
      const alreadyScanned = todayAttendance.find(record => record.nim === nim)
      if (alreadyScanned) {
        toast({
          title: "⚠️ Sudah Absen",
          description: `NIM ${nim} sudah melakukan absensi hari ini pada ${new Date(alreadyScanned.timestamp).toLocaleTimeString("id-ID")}`,
          variant: "destructive"
        })
        return
      }

      // Add attendance record
      await addAttendance(nim, "", deviceId)
      
      // Update state
      setLastProcessedNim(nim)
      setLastProcessedTime(Date.now())
      setProcessCount(prev => prev + 1)
      
      // Show success notification with enhanced details
      toast({
        title: "🎉 QR Code Berhasil Terdeteksi!",
        description: `✅ NIM ${nim} berhasil dicatat melalui ESP32 Scanner (${deviceId}) pada ${new Date().toLocaleTimeString("id-ID")}`,
      })

      // Additional celebration notification for mobile
      if (window.navigator?.vibrate) {
        // Vibrate pattern: short-long-short
        window.navigator.vibrate([200, 100, 200])
      }

      // Play success sound if available
      try {
        const successSound = new Audio("/success.mp3")
        successSound.volume = 0.7
        successSound.play().catch(() => console.log("Success sound not available"))
      } catch (e) {
        console.log("Success sound error:", e)
      }

      // Log successful scan for monitoring
      console.log(`🎯 ESP32 Attendance Success: NIM ${nim} scanned by ${deviceId} at ${new Date().toISOString()}`)

    } catch (error) {
      console.error("Error processing ESP32 attendance scan:", error)
      toast({
        title: "❌ Error Absensi",
        description: `Gagal memproses absensi untuk NIM ${barcode}: ${error}`,
        variant: "destructive"
      })
    } finally {
      setIsProcessing(false)
      
      // Reset processing state after 3 seconds
      setTimeout(() => {
        setIsProcessing(false)
      }, 3000)
    }
  }

  const contextValue: RealtimeAttendanceContextType = {
    isProcessing,
    lastProcessedNim,
    processCount,
  }

  return (
    <RealtimeAttendanceContext.Provider value={contextValue}>
      {children}
    </RealtimeAttendanceContext.Provider>
  )
}

// Main component that conditionally renders the authenticated provider
export function RealtimeAttendanceProvider({ children }: RealtimeAttendanceProviderProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isAuthChecked, setIsAuthChecked] = useState(false)

  useEffect(() => {
    if (!auth) {
      setIsAuthenticated(false)
      setIsAuthChecked(true)
      return
    }

    // Check current auth state
    const checkAuth = () => {
      setIsAuthenticated(!!auth?.currentUser)
      setIsAuthChecked(true)
    }

    checkAuth()

    // Listen for auth state changes
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setIsAuthenticated(!!user)
      setIsAuthChecked(true)
    })

    return () => unsubscribe()
  }, [])

  // Default context when not authenticated
  const defaultContextValue: RealtimeAttendanceContextType = {
    isProcessing: false,
    lastProcessedNim: null,
    processCount: 0,
  }

  // If not authenticated or auth not checked yet, provide default context
  if (!isAuthChecked || !isAuthenticated) {
    return (
      <RealtimeAttendanceContext.Provider value={defaultContextValue}>
        {children}
      </RealtimeAttendanceContext.Provider>
    )
  }

  // If authenticated, use the full provider
  return <AuthenticatedAttendanceProvider>{children}</AuthenticatedAttendanceProvider>
}
