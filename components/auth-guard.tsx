'use client'

import { useEffect, useState, useCallback } from 'react'
import { onAuthChange, ensureAuthenticated, forceReauth } from '@/lib/auth'
import { User } from 'firebase/auth'
import { Button } from '@/components/ui/button'
import { AlertCircle, RefreshCw } from 'lucide-react'

interface AuthGuardProps {
  children: React.ReactNode
  fallback?: React.ReactNode
  requireAuth?: boolean
}

export default function AuthGuard({ children, fallback, requireAuth = true }: AuthGuardProps) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)

  const handleRetry = useCallback(async () => {
    setLoading(true)
    setError(null)
    setRetryCount(prev => prev + 1)
    
    try {
      const user = await forceReauth()
      if (user) {
        setUser(user)
        setError(null)
      } else {
        setError("Authentication failed after retry")
      }
    } catch (err: any) {
      setError(err.message || "Authentication retry failed")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let mounted = true
    
    const initAuth = async () => {
      try {
        setLoading(true)
        
        // Set up auth state listener
        const unsubscribe = onAuthChange((user) => {
          if (!mounted) return
          
          console.log('🔐 Auth state changed in AuthGuard:', user?.uid || 'null')
          setUser(user)
          
          if (user) {
            setError(null)
          }
          
          setLoading(false)
        })

        // Ensure authentication on component mount
        if (requireAuth) {
          const authUser = await ensureAuthenticated(2)
          if (!mounted) return
          
          if (!authUser) {
            setError("Unable to authenticate user")
            setLoading(false)
          }
        } else {
          setLoading(false)
        }

        return () => {
          mounted = false
          unsubscribe()
        }
      } catch (err: any) {
        if (!mounted) return
        console.error('❌ AuthGuard initialization error:', err)
        setError(err.message || "Authentication initialization failed")
        setLoading(false)
      }
    }

    const cleanup = initAuth()
    
    return () => {
      cleanup.then(cleanupFn => cleanupFn?.())
    }
  }, [requireAuth, retryCount])

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Mengamankan koneksi...</p>
          {retryCount > 0 && (
            <p className="text-sm text-gray-500 mt-2">Percobaan ke-{retryCount + 1}</p>
          )}
        </div>
      </div>
    )
  }

  // Error state
  if (error && requireAuth) {
    return fallback || (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center max-w-md mx-auto p-6">
          <div className="mx-auto w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4">
            <AlertCircle className="w-6 h-6 text-red-600" />
          </div>
          <h2 className="text-xl font-semibold text-red-600 mb-2">Kesalahan Autentikasi</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <Button onClick={handleRetry} disabled={loading} className="w-full">
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Coba Lagi
          </Button>
          {retryCount > 2 && (
            <p className="text-sm text-gray-500 mt-4">
              Jika masalah berlanjut, silakan refresh halaman atau hubungi administrator.
            </p>
          )}
        </div>
      </div>
    )
  }

  // Authentication required but no user
  if (requireAuth && !user) {
    return fallback || (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-red-600 mb-2">Akses Ditolak</h2>
          <p className="text-gray-600 mb-4">Tidak dapat mengautentikasi pengguna.</p>
          <Button onClick={handleRetry}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Coba Lagi
          </Button>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
