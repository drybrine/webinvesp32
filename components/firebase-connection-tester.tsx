"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Zap, Wifi, RefreshCw } from "lucide-react"
import { database, isFirebaseConfigured } from "@/lib/firebase"
import { ref, push, set } from "firebase/database"
import { toast } from "@/hooks/use-toast"

export function FirebaseConnectionTester() {
  const [isConnecting, setIsConnecting] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<'unknown' | 'connected' | 'failed'>('unknown')

  const testFirebaseConnection = async () => {
    setIsConnecting(true)
    setConnectionStatus('unknown')

    try {
      if (!isFirebaseConfigured() || !database) {
        throw new Error('Firebase not configured')
      }

      // Test write to Firebase
      const testData = {
        barcode: `TEST_${Date.now()}`,
        timestamp: Date.now(),
        deviceId: "mobile-connection-test",
        mode: "inventory",
        type: "inventory_scan",
        source: "mobile_connection_test",
        location: "Mobile Connection Test"
      }

      console.log('🧪 Testing Firebase connection with data:', testData)

      const scansRef = ref(database, "scans")
      const newScanRef = push(scansRef)
      await set(newScanRef, testData)

      setConnectionStatus('connected')
      toast({
        title: "✅ Firebase Test Berhasil",
        description: "Koneksi Firebase berfungsi normal. Popup seharusnya muncul.",
        duration: 4000,
      })

      console.log('✅ Firebase connection test successful')

    } catch (error) {
      console.error('❌ Firebase connection test failed:', error)
      setConnectionStatus('failed')
      toast({
        title: "❌ Firebase Test Gagal",
        description: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: "destructive",
        duration: 5000,
      })
    } finally {
      setIsConnecting(false)
    }
  }

  const refreshPage = () => {
    console.log('🔄 Refreshing page...')
    window.location.reload()
  }

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wifi className="w-5 h-5" />
          Firebase Connection Test
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="text-sm">Status:</span>
          <Badge 
            variant={
              connectionStatus === 'connected' ? 'default' : 
              connectionStatus === 'failed' ? 'destructive' : 
              'secondary'
            }
          >
            {connectionStatus === 'connected' ? 'Connected' : 
             connectionStatus === 'failed' ? 'Failed' : 
             'Unknown'}
          </Badge>
        </div>
        
        <div className="grid grid-cols-1 gap-3">
          <Button 
            onClick={testFirebaseConnection}
            disabled={isConnecting}
            className="w-full"
          >
            {isConnecting ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Testing...
              </>
            ) : (
              <>
                <Zap className="w-4 h-4 mr-2" />
                Test Firebase
              </>
            )}
          </Button>
          
          <Button 
            onClick={refreshPage}
            variant="outline"
            className="w-full"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh Page
          </Button>
        </div>
        
        <div className="text-xs text-gray-500 text-center">
          1. Test Firebase connection<br/>
          2. Jika gagal, coba refresh page<br/>
          3. Check ESP32 Debug Panel untuk status
        </div>
      </CardContent>
    </Card>
  )
}
