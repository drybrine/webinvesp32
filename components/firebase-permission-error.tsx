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
  onAuthRetry?: () => Promise<void>
}

export function FirebasePermissionError({ error, onRetry, onAuthRetry }: FirebasePermissionErrorProps) {
  const [retrying, setRetrying] = useState(false)
  const [authRetrying, setAuthRetrying] = useState(false)
  const router = useRouter()

  // Determine error type
  const isPermissionError = error.includes('permission_denied') || error.includes('Permission denied')
  const isNetworkError = error.includes('network') || error.includes('offline') || error.includes('connection')
  const isAuthError = error.includes('auth') || error.includes('Authentication')

  const handleRetry = async () => {
    if (onRetry) {
      setRetrying(true)
      await new Promise(resolve => setTimeout(resolve, 1000)) // Small delay
      onRetry()
      setRetrying(false)
    }
  }

  const handleAuthRetry = async () => {
    if (onAuthRetry) {
      setAuthRetrying(true)
      try {
        await onAuthRetry()
      } catch (error) {
        console.error("Auth retry failed:", error)
      }
      setAuthRetrying(false)
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
            <CardTitle className="text-red-900">
              {isPermissionError ? 'Firebase Permission Error' : 
               isNetworkError ? 'Connection Error' : 
               isAuthError ? 'Authentication Error' : 'Firebase Error'}
            </CardTitle>
            <CardDescription>
              {isPermissionError ? 'Sistem tidak dapat mengakses database Firebase untuk fitur absensi' :
               isNetworkError ? 'Tidak dapat terhubung ke server Firebase' :
               isAuthError ? 'Gagal melakukan autentikasi ke Firebase' :
               'Terjadi kesalahan pada sistem Firebase'}
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
                {isPermissionError && (
                  <>
                    <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg">
                      <Badge variant="outline" className="text-xs mt-0.5">1</Badge>
                      <div>
                        <h4 className="font-medium text-blue-900">Firebase Database Rules</h4>
                        <p className="text-sm text-blue-800">
                          Rules Firebase belum dikonfigurasi untuk mengizinkan akses ke database
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
                  </>
                )}

                {isNetworkError && (
                  <>
                    <div className="flex items-start gap-3 p-3 bg-orange-50 rounded-lg">
                      <Badge variant="outline" className="text-xs mt-0.5">1</Badge>
                      <div>
                        <h4 className="font-medium text-orange-900">Koneksi Internet</h4>
                        <p className="text-sm text-orange-800">
                          Periksa koneksi internet Anda dan coba lagi
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg">
                      <Badge variant="outline" className="text-xs mt-0.5">2</Badge>
                      <div>
                        <h4 className="font-medium text-blue-900">Server Firebase</h4>
                        <p className="text-sm text-blue-800">
                          Server Firebase mungkin sedang mengalami gangguan. Coba beberapa saat lagi.
                        </p>
                      </div>
                    </div>
                  </>
                )}

                {isAuthError && (
                  <>
                    <div className="flex items-start gap-3 p-3 bg-purple-50 rounded-lg">
                      <Badge variant="outline" className="text-xs mt-0.5">1</Badge>
                      <div>
                        <h4 className="font-medium text-purple-900">Autentikasi Gagal</h4>
                        <p className="text-sm text-purple-800">
                          Sistem gagal melakukan autentikasi ke Firebase
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 p-3 bg-green-50 rounded-lg">
                      <Badge variant="outline" className="text-xs mt-0.5">2</Badge>
                      <div>
                        <h4 className="font-medium text-green-900">Retry Autentikasi</h4>
                        <p className="text-sm text-green-800">
                          Coba untuk autentikasi ulang atau refresh halaman
                        </p>
                      </div>
                    </div>
                  </>
                )}

                <div className="flex items-start gap-3 p-3 bg-yellow-50 rounded-lg">
                  <Badge variant="outline" className="text-xs mt-0.5">!</Badge>
                  <div>
                    <h4 className="font-medium text-yellow-900">Manual Steps</h4>
                    <p className="text-sm text-yellow-800">
                      {isPermissionError ? 
                        "Buka Firebase Console → Database → Rules, dan update rules untuk memberikan akses yang sesuai" :
                        "Jika masalah berlanjut, periksa konfigurasi Firebase di halaman Pengaturan"
                      }
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              {isPermissionError && (
                <Button onClick={goToSettings} className="flex-1">
                  <Settings className="w-4 h-4 mr-2" />
                  Buka Pengaturan
                </Button>
              )}
              
              {isAuthError && onAuthRetry && (
                <Button 
                  onClick={handleAuthRetry} 
                  disabled={authRetrying}
                  className="flex-1"
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${authRetrying ? 'animate-spin' : ''}`} />
                  {authRetrying ? 'Authenticating...' : 'Retry Auth'}
                </Button>
              )}
              
              <Button 
                onClick={handleRetry} 
                disabled={retrying}
                variant="outline" 
                className="flex-1"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${retrying ? 'animate-spin' : ''}`} />
                {retrying ? 'Retrying...' : 'Retry'}
              </Button>
              
              {isPermissionError && (
                <Button 
                  onClick={() => window.open('https://console.firebase.google.com', '_blank')}
                  variant="outline"
                  className="flex-1"
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Firebase Console
                </Button>
              )}
            </div>

            <div className="bg-gray-50 p-4 rounded-lg">
              <h4 className="font-medium mb-2">Temporary Workaround:</h4>
              <p className="text-sm text-gray-600 mb-3">
                {isNetworkError ? 
                  "Jika koneksi tidak stabil, Anda dapat menggunakan mode offline dengan data tersimpan di browser." :
                  "Jika ingin menggunakan sistem tanpa Firebase, Anda dapat menggunakan mode offline dengan data tersimpan di browser local storage."
                }
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
