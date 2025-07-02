'use client'

import { useEffect, useState } from 'react'
import { authenticateUser } from '@/lib/auth'
import { isFirebaseConfigured } from '@/lib/firebase'

export default function AutoAuth({ children }: { children: React.ReactNode }) {
  const [isInitialized, setIsInitialized] = useState(false)

  useEffect(() => {
    // Wait for Firebase to be initialized before attempting authentication
    const initAuth = async () => {
      try {
        // Check if Firebase is configured and ready
        let attempts = 0
        const maxAttempts = 10
        
        const waitForFirebase = () => {
          return new Promise<void>((resolve) => {
            const checkFirebase = () => {
              if (isFirebaseConfigured() || attempts >= maxAttempts) {
                resolve()
              } else {
                attempts++
                setTimeout(checkFirebase, 500) // Wait 500ms between checks
              }
            }
            checkFirebase()
          })
        }

        await waitForFirebase()

        if (isFirebaseConfigured()) {
          await authenticateUser()
          console.log("✅ Auto-authentication successful")
        } else {
          console.warn("⚠️ Firebase not configured, skipping authentication")
        }
      } catch (error) {
        console.warn("⚠️ Auto-authentication failed:", error)
      } finally {
        setIsInitialized(true)
      }
    }

    initAuth()
  }, [])

  // Don't show loading state, just render children
  // Authentication happens in background
  return <>{children}</>
}
