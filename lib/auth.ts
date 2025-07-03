import { signInAnonymously, onAuthStateChanged, User } from "firebase/auth"
import { getAuth } from "firebase/auth"
import { isFirebaseConfigured } from "./firebase"

// Simple anonymous authentication for Firebase security rules
export const authenticateUser = async (): Promise<User | null> => {
  try {
    // Check if Firebase is configured first
    if (!isFirebaseConfigured()) {
      console.warn("Firebase not configured, cannot authenticate")
      return null
    }

    const auth = getAuth()
    
    // Check if user is already signed in
    if (auth.currentUser) {
      console.log("User already authenticated:", auth.currentUser.uid)
      return auth.currentUser
    }
    
    // Sign in anonymously with exponential backoff retry logic
    let retries = 3
    let delay = 1000 // Start with 1 second delay
    
    while (retries > 0) {
      try {
        console.log("Attempting anonymous authentication...")
        const userCredential = await signInAnonymously(auth)
        console.log("Anonymous authentication successful:", userCredential.user.uid)
        return userCredential.user
      } catch (error: any) {
        retries--
        console.warn(`Authentication attempt failed (${3 - retries}/3):`, error.code || error.message)
        
        // Handle specific Firebase auth errors
        if (error.code === 'auth/network-request-failed') {
          console.warn("Network error detected, retrying with longer delay...")
          delay = delay * 2 // Exponential backoff for network issues
        }
        
        if (retries > 0) {
          // Wait before retrying with exponential backoff
          await new Promise(resolve => setTimeout(resolve, delay))
          delay = Math.min(delay * 1.5, 5000) // Cap delay at 5 seconds
        } else {
          // Final attempt failed, but don't throw - return null for graceful degradation
          console.error("All authentication attempts failed:", error.code || error.message)
          return null
        }
      }
    }
    
    return null
  } catch (error: any) {
    console.error("Authentication failed:", error.code || error.message)
    return null
  }
}

// Listen for authentication state changes
export const onAuthChange = (callback: (user: User | null) => void) => {
  try {
    if (!isFirebaseConfigured()) {
      console.warn("Firebase not configured, cannot listen for auth changes")
      return () => {} // Return empty unsubscribe function
    }

    const auth = getAuth()
    return onAuthStateChanged(auth, callback)
  } catch (error) {
    console.error("Error setting up auth state listener:", error)
    return () => {} // Return empty unsubscribe function
  }
}

// Check if user is authenticated
export const isAuthenticated = (): boolean => {
  try {
    if (!isFirebaseConfigured()) {
      return false
    }

    const auth = getAuth()
    return !!auth.currentUser
  } catch (error) {
    console.error("❌ Error checking authentication status:", error)
    return false
  }
}

// Get current user
export const getCurrentUser = (): User | null => {
  try {
    if (!isFirebaseConfigured()) {
      return null
    }

    const auth = getAuth()
    return auth.currentUser
  } catch (error) {
    console.error("❌ Error getting current user:", error)
    return null
  }
}

// Enhanced authentication state checker with persistence
export const ensureAuthentication = async (maxRetries = 3): Promise<User | null> => {
  try {
    // Quick check if already authenticated
    const currentUser = getCurrentUser()
    if (currentUser) {
      return currentUser
    }

    // Wait for auth state to be ready
    if (!isFirebaseConfigured()) {
      console.warn("Firebase not configured for authentication")
      return null
    }

    const auth = getAuth()
    
    // Wait for initial auth state to be resolved
    await new Promise<void>((resolve) => {
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        unsubscribe()
        resolve()
      })
    })

    // Check again after auth state is resolved
    if (auth.currentUser) {
      return auth.currentUser
    }

    // If not authenticated, attempt to authenticate
    return await authenticateUser()
    
  } catch (error) {
    console.error("❌ Error ensuring authentication:", error)
    return null
  }
}
