"use client"

import { useState, useEffect } from "react"
import { useRealtimeScan } from "@/hooks/use-realtime-scan"

export function MobileDebugOverlay() {
  const [isVisible, setIsVisible] = useState(false)
  const [deviceInfo, setDeviceInfo] = useState<any>({})
  const { isScanning, lastScannedBarcode, scanCount } = useRealtimeScan()

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setDeviceInfo({
        userAgent: navigator.userAgent,
        isMobile: /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent),
        screenWidth: window.screen.width,
        screenHeight: window.screen.height,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio,
        touchSupport: 'ontouchstart' in window,
      })
    }
  }, [])

  // Show debug overlay on triple tap
  useEffect(() => {
    let tapCount = 0
    let tapTimer: NodeJS.Timeout

    const handleTap = () => {
      tapCount++
      clearTimeout(tapTimer)
      
      if (tapCount === 3) {
        setIsVisible(!isVisible)
        tapCount = 0
      } else {
        tapTimer = setTimeout(() => {
          tapCount = 0
        }, 500)
      }
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('click', handleTap)
      return () => {
        window.removeEventListener('click', handleTap)
        clearTimeout(tapTimer)
      }
    }
  }, [isVisible])

  if (!isVisible) return null

  return (
    <div className="fixed top-4 left-4 right-4 z-[10000] bg-black/90 text-white p-4 rounded-lg text-xs font-mono max-h-[50vh] overflow-y-auto">
      <div className="flex justify-between items-center mb-2">
        <span className="font-bold">Mobile Debug Info</span>
        <button 
          onClick={() => setIsVisible(false)}
          className="text-red-400 hover:text-red-300"
        >
          ✕
        </button>
      </div>
      
      <div className="space-y-1">
        <div>📱 Mobile: {deviceInfo.isMobile ? 'Yes' : 'No'}</div>
        <div>📏 Screen: {deviceInfo.screenWidth}x{deviceInfo.screenHeight}</div>
        <div>🖼️ Viewport: {deviceInfo.viewportWidth}x{deviceInfo.viewportHeight}</div>
        <div>🔍 DPR: {deviceInfo.devicePixelRatio}</div>
        <div>👆 Touch: {deviceInfo.touchSupport ? 'Yes' : 'No'}</div>
        <div>📊 Scan Count: {scanCount}</div>
        <div>🔄 Is Scanning: {isScanning ? 'Yes' : 'No'}</div>
        <div>🏷️ Last Barcode: {lastScannedBarcode || 'None'}</div>
        <div>🌍 User Agent: {deviceInfo.userAgent?.substring(0, 50)}...</div>
      </div>
      
      <div className="mt-2 text-gray-400 text-[10px]">
        Triple-tap to toggle this overlay
      </div>
    </div>
  )
}
