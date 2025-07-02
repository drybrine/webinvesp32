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
    
    // Sign in anonymously with retry logic for production
    let retries = 3
    while (retries > 0) {
      try {
        console.log("Attempting anonymous authentication...")
        const userCredential = await signInAnonymously(auth)
        console.log("Anonymous authentication successful:", userCredential.user.uid)
        return userCredential.user
      } catch (error: any) {
        retries--
        console.warn(`Authentication attempt failed (${3 - retries}/3):`, error.code || error.message)
        
        if (retries > 0) {
          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, 1000))
        } else {
          throw error
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
