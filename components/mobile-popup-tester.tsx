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
      // Simulate adding a scan to Firebase
      const scanData = {
        barcode: testBarcode,
        timestamp: Date.now(),
        deviceId: "mobile-test",
        mode: "inventory",
        type: "inventory_scan",
        source: "mobile_test"
      }
      
      console.log('Simulating scan with data:', scanData)
      
      // Add to Firebase
      await firebaseHelpers.addScanRecord(scanData)
      
      toast({
        title: "🧪 Test Scan Berhasil",
        description: `Barcode ${testBarcode} berhasil disimulasikan. Popup seharusnya muncul sekarang.`,
        duration: 3000,
      })
      
    } catch (error) {
      console.error('Error simulating scan:', error)
      toast({
        title: "❌ Test Scan Gagal",
        description: "Terjadi error saat simulasi scan",
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
          Mobile Popup Tester
        </CardTitle>
        <CardDescription>
          Test popup pada mobile dengan simulasi scan barcode
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
              Simulate Scan
            </>
          )}
        </Button>
        
        <div className="text-xs text-gray-500 text-center">
          Setelah klik tombol, popup produk seharusnya muncul.<br/>
          Jika tidak muncul, aktifkan debug overlay (triple tap).
        </div>
      </CardContent>
    </Card>
  )
}
