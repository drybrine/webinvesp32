"use client"

import { useEffect } from 'react'
import { initializeFirebaseErrorHandling } from '@/lib/firebase-error-suppressor'

// Component to suppress Firebase deprecation warnings and WebSocket errors globally
export default function FirebaseDeprecationSuppressor() {
  useEffect(() => {
    if (typeof window === 'undefined') return

    // Initialize the enhanced Firebase error handling
    const cleanup = initializeFirebaseErrorHandling()

    // Return cleanup function
    return cleanup
  }, [])

  return null // This component doesn't render anything
}