"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { AlertTriangle, RefreshCw, ExternalLink, Settings } from "lucide-react"
import { useRouter } from "next/navigation"

interface FirebasePermissionErrorProps {
  error: string
  onRetry?: () => void
}

export function FirebasePermissionError({ error, onRetry }: FirebasePermissionErrorProps) {
  const [retrying, setRetrying] = useState(false)
  const router = useRouter()

  const handleRetry = async () => {
    if (onRetry) {
      setRetrying(true)
      await new Promise(resolve => setTimeout(resolve, 1000)) // Small delay
      onRetry()
      setRetrying(false)
    }
  }

  const goToSettings = () => {
    router.push('/pengaturan')
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4">
              <AlertTriangle className="w-6 h-6 text-red-600" />
            </div>
            <CardTitle className="text-red-900">Firebase Permission Error</CardTitle>
            <CardDescription>
              Sistem tidak dapat mengakses database Firebase untuk fitur absensi
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <strong>Error:</strong> {error}
              </AlertDescription>
            </Alert>

            <div className="space-y-4">
              <h3 className="font-semibold">Penyebab dan Solusi:</h3>
              
              <div className="space-y-3">
                <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg">
                  <Badge variant="outline" className="text-xs mt-0.5">1</Badge>
                  <div>
                    <h4 className="font-medium text-blue-900">Firebase Database Rules</h4>
                    <p className="text-sm text-blue-800">
                      Rules Firebase belum dikonfigurasi untuk mengizinkan akses ke path '/attendance'
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 bg-green-50 rounded-lg">
                  <Badge variant="outline" className="text-xs mt-0.5">2</Badge>
                  <div>
                    <h4 className="font-medium text-green-900">Solusi Cepat</h4>
                    <p className="text-sm text-green-800">
                      Pergi ke halaman Pengaturan → tab "Sistem" dan ikuti panduan Firebase Rules Setup
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 bg-yellow-50 rounded-lg">
                  <Badge variant="outline" className="text-xs mt-0.5">3</Badge>
                  <div>
                    <h4 className="font-medium text-yellow-900">Manual Steps</h4>
                    <p className="text-sm text-yellow-800">
                      Buka Firebase Console → Database → Rules, dan update rules untuk memberikan akses ke 'attendance'
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <Button onClick={goToSettings} className="flex-1">
                <Settings className="w-4 h-4 mr-2" />
                Buka Pengaturan
              </Button>
              
              <Button 
                onClick={handleRetry} 
                disabled={retrying}
                variant="outline" 
                className="flex-1"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${retrying ? 'animate-spin' : ''}`} />
                {retrying ? 'Retrying...' : 'Retry'}
              </Button>
              
              <Button 
                onClick={() => window.open('https://console.firebase.google.com/project/barcodescanesp32/database/barcodescanesp32-default-rtdb/rules', '_blank')}
                variant="outline"
                className="flex-1"
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                Firebase Console
              </Button>
            </div>

            <div className="bg-gray-50 p-4 rounded-lg">
              <h4 className="font-medium mb-2">Temporary Workaround:</h4>
              <p className="text-sm text-gray-600 mb-3">
                Jika ingin menggunakan sistem tanpa Firebase, Anda dapat menggunakan mode offline 
                dengan data tersimpan di browser local storage.
              </p>
              <Button 
                onClick={() => router.push('/absensi?offline=true')} 
                variant="outline" 
                size="sm"
              >
                Gunakan Mode Offline
              </Button>
            </div>

            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <strong>Note:</strong> Setelah Firebase rules diupdate, tunggu 2-3 menit agar perubahan berlaku, 
                kemudian refresh halaman dan coba lagi.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
