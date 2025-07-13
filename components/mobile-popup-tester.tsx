"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { firebaseHelpers } from "@/lib/firebase"
import { toast } from "@/hooks/use-toast"
import { TestTube, Zap } from "lucide-react"

export function MobilePopupTester() {
  const [testBarcode, setTestBarcode] = useState("123456789")
  const [isSimulating, setIsSimulating] = useState(false)

  const simulateBarcodeScanning = async () => {
    setIsSimulating(true)
    
    try {
      // Reset scan states first on mobile
      console.log('🔄 Resetting scan states for fresh test...')
      
      // Simulate adding a scan to Firebase
      const scanData = {
        barcode: testBarcode,
        timestamp: Date.now(),
        deviceId: "mobile-test-esp32",
        mode: "inventory",
        type: "inventory_scan",
        source: "mobile_test_esp32",
        location: "Mobile Test Location"
      }
      
      console.log('🧪 Simulating ESP32 scan with data:', scanData)
      
      // Add to Firebase
      await firebaseHelpers.addScanRecord(scanData)
      
      // Force a small delay to ensure Firebase processes the data
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      // Also trigger vibration if supported
      if ('navigator' in window && 'vibrate' in navigator) {
        try {
          navigator.vibrate([200, 100, 200])
        } catch (e) {
          console.log('Vibration not supported')
        }
      }
      
      toast({
        title: "🧪 ESP32 Test Scan Berhasil",
        description: `Barcode ${testBarcode} berhasil disimulasikan dari ESP32. Quick Action Popup seharusnya muncul dalam 1-2 detik.`,
        duration: 5000,
      })
      
    } catch (error) {
      console.error('Error simulating ESP32 scan:', error)
      toast({
        title: "❌ ESP32 Test Scan Gagal",
        description: "Terjadi error saat simulasi scan ESP32",
        variant: "destructive",
      })
    } finally {
      setIsSimulating(false)
    }
  }

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TestTube className="w-5 h-5" />
          ESP32 Mobile Popup Tester
        </CardTitle>
        <CardDescription>
          Test quick action popup pada mobile dengan simulasi scan barcode ESP32
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="testBarcode" className="text-sm font-medium">
            Test Barcode
          </label>
          <Input
            id="testBarcode"
            value={testBarcode}
            onChange={(e) => setTestBarcode(e.target.value)}
            placeholder="Masukkan barcode test..."
          />
        </div>
        
        <Button 
          onClick={simulateBarcodeScanning}
          disabled={isSimulating || !testBarcode}
          className="w-full"
        >
          {isSimulating ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
              Simulating...
            </>
          ) : (
            <>
              <Zap className="w-4 h-4 mr-2" />
              Simulate ESP32 Scan
            </>
          )}
        </Button>
        
        <div className="text-xs text-gray-500 text-center">
          Setelah klik tombol, quick action popup seharusnya muncul.<br/>
          Aktifkan ESP32 Debug Panel (triple tap) untuk melihat status.<br/>
          Pastikan berada di halaman selain /absensi.
        </div>
      </CardContent>
    </Card>
  )
}
