'use client'

import { useEffect, useState } from 'react'
import { onAuthChange, authenticateUser } from '@/lib/auth'
import { User } from 'firebase/auth'

interface AuthGuardProps {
  children: React.ReactNode
  fallback?: React.ReactNode
}

export default function AuthGuard({ children, fallback }: AuthGuardProps) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsubscribe = onAuthChange((user) => {
      setUser(user)
      setLoading(false)
    })

    // Auto-authenticate on component mount
    if (!user) {
      authenticateUser().finally(() => setLoading(false))
    }

    return () => unsubscribe()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Mengamankan koneksi...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return fallback || (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-red-600 mb-2">Akses Ditolak</h2>
          <p className="text-gray-600">Tidak dapat mengautentikasi pengguna.</p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
