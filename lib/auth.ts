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
      return auth.currentUser
    }
    
    // Sign in anonymously
    const userCredential = await signInAnonymously(auth)
    return userCredential.user
  } catch (error) {
    console.error("Authentication failed:", error)
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
