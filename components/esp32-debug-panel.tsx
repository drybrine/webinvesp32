"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useRealtimeScan } from "@/hooks/use-realtime-scan"
import { Bug, Smartphone, Wifi, RefreshCw } from "lucide-react"
import { database, isFirebaseConfigured } from "@/lib/firebase"
import { ref, onValue, off } from "firebase/database"

export function ESP32DebugPanel() {
  const { isScanning, lastScannedBarcode, scanCount } = useRealtimeScan()
  const [deviceInfo, setDeviceInfo] = useState<any>({})
  const [isVisible, setIsVisible] = useState(false)
  const [firebaseConnected, setFirebaseConnected] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const userAgent = navigator.userAgent
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent)
      const isSmallScreen = window.innerWidth <= 768
      const isTouchDevice = 'ontouchstart' in window
      
      setDeviceInfo({
        userAgent: userAgent.substring(0, 80),
        isMobile,
        isSmallScreen,
        isTouchDevice,
        screenWidth: window.screen.width,
        screenHeight: window.screen.height,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio,
        touchSupport: 'ontouchstart' in window,
        vibrationSupport: 'vibrate' in navigator,
        standalone: (window.navigator as any).standalone,
      })
    }

    // Monitor Firebase connection
    if (isFirebaseConfigured() && database) {
      const connectedRef = ref(database, '.info/connected')
      const unsubscribe = onValue(connectedRef, (snapshot) => {
        const connected = snapshot.val()
        setFirebaseConnected(connected === true)
        console.log('🔥 Firebase connection status:', connected ? 'Connected' : 'Disconnected')
      })

      return () => {
        if (connectedRef && unsubscribe) {
          off(connectedRef, "value", unsubscribe)
        }
      }
    }
  }, [])

  // Show debug panel with triple tap
  useEffect(() => {
    let tapCount = 0
    let tapTimer: NodeJS.Timeout

    const handleTripleTap = () => {
      tapCount++
      clearTimeout(tapTimer)
      
      if (tapCount === 3) {
        setIsVisible(!isVisible)
        console.log('ESP32 Debug Panel toggled:', !isVisible)
        tapCount = 0
      } else {
        tapTimer = setTimeout(() => {
          tapCount = 0
        }, 600)
      }
    }

    document.addEventListener('click', handleTripleTap)
    return () => {
      document.removeEventListener('click', handleTripleTap)
      clearTimeout(tapTimer)
    }
  }, [isVisible])

  // Force refresh Firebase connection
  const forceRefresh = async () => {
    setIsRefreshing(true)
    try {
      console.log('🔄 Force refreshing page for Firebase reconnection...')
      // Force page reload to reinitialize Firebase
      window.location.reload()
    } catch (error) {
      console.error('❌ Error force refreshing:', error)
    } finally {
      setIsRefreshing(false)
    }
  }

  if (!isVisible) return null

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 md:left-auto md:right-4 md:w-80">
      <Card className="bg-black/90 text-white text-xs border-gray-600">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Bug className="h-4 w-4" />
            ESP32 Debug Panel
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setIsVisible(false)}
              className="ml-auto h-6 w-6 p-0 text-white hover:bg-white/20"
            >
              ×
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {/* ESP32 Status */}
          <div className="flex items-center gap-2">
            <Wifi className="h-3 w-3" />
            <span>ESP32 Status:</span>
            <Badge variant={isScanning ? "default" : "secondary"} className="text-xs">
              {isScanning ? "Scanning" : "Idle"}
            </Badge>
          </div>
          
          <div className="flex items-center gap-2">
            <span>Firebase:</span>
            <Badge variant={firebaseConnected ? "default" : "destructive"} className="text-xs">
              {firebaseConnected ? "Connected" : "Disconnected"}
            </Badge>
            <Button
              size="sm"
              variant="outline"
              onClick={forceRefresh}
              disabled={isRefreshing}
              className="ml-auto h-6 px-2 text-xs"
            >
              {isRefreshing ? (
                <RefreshCw className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
            </Button>
          </div>
          
          <div>Scan Count: <span className="text-yellow-400">{scanCount}</span></div>
          <div>Last Barcode: <span className="text-green-400 font-mono">{lastScannedBarcode || "None"}</span></div>
          
          {/* Device Info */}
          <div className="pt-2 border-t border-gray-600">
            <div className="flex items-center gap-2 mb-1">
              <Smartphone className="h-3 w-3" />
              <span className="font-semibold">Device Info:</span>
            </div>
            <div>Mobile: <span className={deviceInfo.isMobile ? "text-green-400" : "text-red-400"}>{deviceInfo.isMobile ? "Yes" : "No"}</span></div>
            <div>Touch: <span className={deviceInfo.isTouchDevice ? "text-green-400" : "text-red-400"}>{deviceInfo.isTouchDevice ? "Yes" : "No"}</span></div>
            <div>Screen: <span className="text-blue-400">{deviceInfo.viewportWidth}×{deviceInfo.viewportHeight}</span></div>
            <div>Vibration: <span className={deviceInfo.vibrationSupport ? "text-green-400" : "text-red-400"}>{deviceInfo.vibrationSupport ? "Yes" : "No"}</span></div>
            <div className="text-gray-400 break-all">{deviceInfo.userAgent}</div>
          </div>
          
          <div className="text-gray-400 text-center pt-2 border-t border-gray-600">
            Triple tap to hide • Check console for logs<br/>
            <span className="text-xs">Refresh jika Firebase disconnected</span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
