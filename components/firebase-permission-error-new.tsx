"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { AlertTriangle, RefreshCw, Settings, Wifi, WifiOff, Shield } from "lucide-react"
import { useRouter } from "next/navigation"
import { forceReauth } from "@/lib/auth"

interface FirebasePermissionErrorProps {
  error: string
  onRetry?: () => void
  showConnectionStatus?: boolean
}

export function FirebasePermissionError({ error, onRetry, showConnectionStatus = true }: FirebasePermissionErrorProps) {
  const [retrying, setRetrying] = useState(false)
  const [isOnline, setIsOnline] = useState(true)
  const [authRetrying, setAuthRetrying] = useState(false)
  const router = useRouter()

  useEffect(() => {
    // Monitor online status
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    
    setIsOnline(navigator.onLine)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const handleRetry = async () => {
    if (onRetry) {
      setRetrying(true)
      await new Promise(resolve => setTimeout(resolve, 1000))
      onRetry()
      setRetrying(false)
    }
  }

  const handleAuthRetry = async () => {
    setAuthRetrying(true)
    try {
      await forceReauth()
      await new Promise(resolve => setTimeout(resolve, 1500))
      if (onRetry) {
        onRetry()
      }
    } catch (err) {
      console.error('Auth retry failed:', err)
    } finally {
      setAuthRetrying(false)
    }
  }

  const goToSettings = () => {
    router.push('/pengaturan')
  }

  // Determine error type for better guidance
  const getErrorType = (errorStr: string) => {
    const lowerError = errorStr.toLowerCase()
    if (lowerError.includes('permission')) return 'permission'
    if (lowerError.includes('network') || lowerError.includes('connection')) return 'network'
    if (lowerError.includes('auth') || lowerError.includes('unauthenticated')) return 'auth'
    if (lowerError.includes('rules')) return 'rules'
    return 'unknown'
  }

  const errorType = getErrorType(error)

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4">
              {errorType === 'network' ? (
                <WifiOff className="w-6 h-6 text-red-600" />
              ) : errorType === 'auth' ? (
                <Shield className="w-6 h-6 text-red-600" />
              ) : (
                <AlertTriangle className="w-6 h-6 text-red-600" />
              )}
            </div>
            <CardTitle className="text-red-900">
              {errorType === 'network' ? 'Kesalahan Koneksi' : 
               errorType === 'auth' ? 'Kesalahan Autentikasi' :
               'Firebase Permission Error'}
            </CardTitle>
            <CardDescription>
              {errorType === 'network' ? 'Sistem tidak dapat terhubung ke server Firebase' :
               errorType === 'auth' ? 'Sistem tidak dapat memverifikasi identitas pengguna' :
               'Sistem tidak dapat mengakses database Firebase untuk fitur absensi'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {showConnectionStatus && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-gray-50">
                {isOnline ? (
                  <Wifi className="w-4 h-4 text-green-600" />
                ) : (
                  <WifiOff className="w-4 h-4 text-red-600" />
                )}
                <span className={`text-sm ${isOnline ? 'text-green-700' : 'text-red-700'}`}>
                  Status: {isOnline ? 'Online' : 'Offline'}
                </span>
              </div>
            )}

            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <strong>Error:</strong> {error}
              </AlertDescription>
            </Alert>

            <div className="space-y-4">
              <h3 className="font-semibold">Penyebab dan Solusi:</h3>
              
              <div className="space-y-3">
                {errorType === 'auth' && (
                  <div className="flex items-start gap-3 p-3 bg-orange-50 rounded-lg">
                    <Badge variant="outline" className="text-xs mt-0.5">1</Badge>
                    <div>
                      <h4 className="font-medium text-orange-900">Masalah Autentikasi</h4>
                      <p className="text-sm text-orange-800">
                        Sesi autentikasi mungkin expired atau tidak valid. Coba autentikasi ulang.
                      </p>
                    </div>
                  </div>
                )}

                {errorType === 'network' && (
                  <div className="flex items-start gap-3 p-3 bg-red-50 rounded-lg">
                    <Badge variant="outline" className="text-xs mt-0.5">1</Badge>
                    <div>
                      <h4 className="font-medium text-red-900">Masalah Koneksi</h4>
                      <p className="text-sm text-red-800">
                        {!isOnline ? 'Perangkat sedang offline. ' : ''}
                        Periksa koneksi internet dan coba lagi. Jika masalah berlanjut, server mungkin sedang maintenance.
                      </p>
                    </div>
                  </div>
                )}

                <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg">
                  <Badge variant="outline" className="text-xs mt-0.5">{errorType === 'auth' || errorType === 'network' ? '2' : '1'}</Badge>
                  <div>
                    <h4 className="font-medium text-blue-900">Firebase Database Rules</h4>
                    <p className="text-sm text-blue-800">
                      Rules Firebase belum dikonfigurasi untuk mengizinkan akses ke path yang diperlukan
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 bg-green-50 rounded-lg">
                  <Badge variant="outline" className="text-xs mt-0.5">{errorType === 'auth' || errorType === 'network' ? '3' : '2'}</Badge>
                  <div>
                    <h4 className="font-medium text-green-900">Solusi Cepat</h4>
                    <p className="text-sm text-green-800">
                      Pergi ke halaman Pengaturan → tab "Sistem" dan ikuti panduan Firebase Rules Setup
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 bg-yellow-50 rounded-lg">
                  <Badge variant="outline" className="text-xs mt-0.5">{errorType === 'auth' || errorType === 'network' ? '4' : '3'}</Badge>
                  <div>
                    <h4 className="font-medium text-yellow-900">Manual Steps</h4>
                    <p className="text-sm text-yellow-800">
                      Buka Firebase Console → Database → Rules, dan update rules untuk memberikan akses yang sesuai
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              {errorType === 'auth' && (
                <Button 
                  onClick={handleAuthRetry} 
                  disabled={authRetrying}
                  className="flex-1"
                >
                  <Shield className={`w-4 h-4 mr-2 ${authRetrying ? 'animate-spin' : ''}`} />
                  {authRetrying ? 'Mengautentikasi...' : 'Autentikasi Ulang'}
                </Button>
              )}
              
              <Button onClick={goToSettings} variant={errorType === 'auth' ? 'outline' : 'default'} className="flex-1">
                <Settings className="w-4 h-4 mr-2" />
                Buka Pengaturan
              </Button>
              
              <Button 
                onClick={handleRetry} 
                disabled={retrying || (!isOnline && errorType === 'network')}
                variant="outline" 
                className="flex-1"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${retrying ? 'animate-spin' : ''}`} />
                {retrying ? 'Mencoba...' : 'Coba Lagi'}
              </Button>
            </div>

            {!isOnline && (
              <Alert>
                <WifiOff className="h-4 w-4" />
                <AlertDescription>
                  Perangkat sedang offline. Beberapa fitur mungkin tidak tersedia sampai koneksi internet pulih.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
