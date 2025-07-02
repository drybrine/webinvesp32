'use client'

import { useEffect, useState } from 'react'
import { authenticateUser, onAuthChange } from '@/lib/auth'
import { isFirebaseConfigured } from '@/lib/firebase'

export default function AutoAuth({ children }: { children: React.ReactNode }) {
  const [isInitialized, setIsInitialized] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)

  useEffect(() => {
    // Wait for Firebase to be initialized before attempting authentication
    const initAuth = async () => {
      try {
        // Check if Firebase is configured and ready
        let attempts = 0
        const maxAttempts = 20 // Increased attempts for production
        
        const waitForFirebase = () => {
          return new Promise<void>((resolve) => {
            const checkFirebase = () => {
              if (isFirebaseConfigured() || attempts >= maxAttempts) {
                resolve()
              } else {
                attempts++
                setTimeout(checkFirebase, 250) // Reduced wait time for faster response
              }
            }
            checkFirebase()
          })
        }

        await waitForFirebase()

        if (isFirebaseConfigured()) {
          // Set up auth state listener first
          const unsubscribe = onAuthChange((user) => {
            if (user) {
              console.log("✅ User authenticated:", user.uid)
              setAuthError(null)
            } else {
              console.log("⚠️ User not authenticated")
            }
            setIsInitialized(true)
          })

          // Attempt authentication
          const user = await authenticateUser()
          if (user) {
            console.log("✅ Auto-authentication successful")
            setAuthError(null)
          } else {
            throw new Error("Authentication failed")
          }

          // Clean up listener when component unmounts
          return () => unsubscribe()
        } else {
          console.warn("⚠️ Firebase not configured, skipping authentication")
          setAuthError("Firebase not configured")
          setIsInitialized(true)
        }
      } catch (error) {
        console.error("❌ Auto-authentication failed:", error)
        setAuthError(error instanceof Error ? error.message : "Authentication failed")
        setIsInitialized(true)
      }
    }

    const cleanup = initAuth()
    
    // Clean up on component unmount
    return () => {
      if (cleanup instanceof Promise) {
        cleanup.then(cleanupFn => cleanupFn && cleanupFn())
      }
    }
  }, [])

  // Don't show loading state, just render children
  // Authentication happens in background
  return <>{children}</>
}
