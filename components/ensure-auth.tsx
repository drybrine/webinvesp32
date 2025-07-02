'use client'

import { useEffect, useState } from 'react'
import { authenticateUser, isAuthenticated } from '@/lib/auth'
import { isFirebaseConfigured } from '@/lib/firebase'

interface EnsureAuthProps {
  children: React.ReactNode
  fallback?: React.ReactNode
}

export default function EnsureAuth({ children, fallback }: EnsureAuthProps) {
  const [isAuthenticating, setIsAuthenticating] = useState(true)
  const [authError, setAuthError] = useState<string | null>(null)

  useEffect(() => {
    const ensureAuthentication = async () => {
      if (!isFirebaseConfigured()) {
        console.warn("Firebase not configured")
        setAuthError("Firebase not configured")
        setIsAuthenticating(false)
        return
      }

      try {
        // Check if already authenticated
        if (isAuthenticated()) {
          console.log("Already authenticated")
          setIsAuthenticating(false)
          return
        }

        // Force authentication
        console.log("Forcing authentication...")
        const user = await authenticateUser()
        
        if (user) {
          console.log("Authentication successful:", user.uid)
          setAuthError(null)
        } else {
          throw new Error("Authentication failed")
        }
      } catch (error) {
        console.error("Authentication error:", error)
        setAuthError(error instanceof Error ? error.message : "Authentication failed")
      } finally {
        setIsAuthenticating(false)
      }
    }

    ensureAuthentication()
  }, [])

  if (isAuthenticating) {
    return (
      <div className="flex items-center justify-center p-4">
        <div className="text-sm text-muted-foreground">Authenticating...</div>
      </div>
    )
  }

  if (authError) {
    return fallback || (
      <div className="flex items-center justify-center p-4">
        <div className="text-sm text-red-600">Authentication Error: {authError}</div>
      </div>
    )
  }

  return <>{children}</>
}
