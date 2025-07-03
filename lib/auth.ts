import { signInAnonymously, onAuthStateChanged, User } from "firebase/auth"
import { getAuth } from "firebase/auth"
import { isFirebaseConfigured } from "./firebase"

// Authentication state management
let authPromise: Promise<User | null> | null = null
let isAuthenticating = false

// Simple anonymous authentication for Firebase security rules with improved error handling
export const authenticateUser = async (force = false): Promise<User | null> => {
  try {
    // Check if Firebase is configured first
    if (!isFirebaseConfigured()) {
      console.warn("Firebase not configured, cannot authenticate")
      return null
    }

    const auth = getAuth()
    
    // Check if user is already signed in and not forcing re-auth
    if (auth.currentUser && !force) {
      console.log("User already authenticated:", auth.currentUser.uid)
      return auth.currentUser
    }

    // Prevent concurrent authentication attempts
    if (isAuthenticating && !force) {
      console.log("Authentication already in progress, waiting...")
      return authPromise
    }

    isAuthenticating = true
    
    // Create authentication promise
    authPromise = (async () => {
      // Sign in anonymously with exponential backoff retry logic
      let retries = 3
      let delay = 1000
      
      while (retries > 0) {
        try {
          console.log(`Attempting anonymous authentication (attempt ${4 - retries}/3)...`)
          const userCredential = await signInAnonymously(auth)
          console.log("✅ Anonymous authentication successful:", userCredential.user.uid)
          
          // Store auth state in localStorage for persistence
          if (typeof window !== 'undefined') {
            localStorage.setItem('firebase_auth_success', Date.now().toString())
          }
          
          return userCredential.user
        } catch (error: any) {
          retries--
          console.warn(`❌ Authentication attempt failed (${4 - retries}/3):`, error.code || error.message)
          
          // Handle specific Firebase auth errors
          if (error.code === 'auth/network-request-failed') {
            console.warn("Network error during authentication, will retry...")
          } else if (error.code === 'auth/app-deleted') {
            console.error("Firebase app has been deleted, cannot authenticate")
            break
          } else if (error.code === 'auth/invalid-api-key') {
            console.error("Invalid Firebase API key, cannot authenticate")
            break
          }
          
          if (retries > 0) {
            console.log(`Retrying in ${delay}ms...`)
            await new Promise(resolve => setTimeout(resolve, delay))
            delay *= 2 // Exponential backoff
          } else {
            throw error
          }
        }
      }
      
      return null
    })()

    const result = await authPromise
    isAuthenticating = false
    return result
    
  } catch (error: any) {
    isAuthenticating = false
    console.error("❌ Authentication failed:", error.code || error.message)
    
    // Clear any stored auth success flag on failure
    if (typeof window !== 'undefined') {
      localStorage.removeItem('firebase_auth_success')
    }
    
    return null
  }
}

// Listen for authentication state changes with improved error handling
export const onAuthChange = (callback: (user: User | null) => void) => {
  try {
    if (!isFirebaseConfigured()) {
      console.warn("Firebase not configured, cannot listen for auth changes")
      callback(null)
      return () => {} // Return empty unsubscribe function
    }

    const auth = getAuth()
    
    const unsubscribe = onAuthStateChanged(auth, 
      (user) => {
        if (user) {
          console.log("🔐 Auth state changed: User signed in", user.uid)
        } else {
          console.log("🔐 Auth state changed: User signed out")
        }
        callback(user)
      },
      (error) => {
        console.error("❌ Auth state change error:", error)
        callback(null)
      }
    )
    
    return unsubscribe
  } catch (error) {
    console.error("❌ Error setting up auth state listener:", error)
    callback(null)
    return () => {} // Return empty unsubscribe function
  }
}

// Check if user is authenticated with better error handling
export const isAuthenticated = (): boolean => {
  try {
    if (!isFirebaseConfigured()) {
      return false
    }

    const auth = getAuth()
    const isAuth = !!auth.currentUser
    
    // Also check localStorage for recent successful auth
    if (!isAuth && typeof window !== 'undefined') {
      const lastAuthSuccess = localStorage.getItem('firebase_auth_success')
      if (lastAuthSuccess) {
        const timeDiff = Date.now() - parseInt(lastAuthSuccess)
        // Consider auth valid for 1 hour
        if (timeDiff < 3600000) {
          console.log("Using cached auth state")
          return true
        } else {
          localStorage.removeItem('firebase_auth_success')
        }
      }
    }
    
    return isAuth
  } catch (error) {
    console.error("❌ Error checking authentication status:", error)
    return false
  }
}

// Get current user with error handling
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

// Force re-authentication (useful for error recovery)
export const forceReauth = async (): Promise<User | null> => {
  console.log("🔄 Forcing re-authentication...")
  
  // Clear cached auth state
  if (typeof window !== 'undefined') {
    localStorage.removeItem('firebase_auth_success')
  }
  
  return authenticateUser(true)
}

// Check authentication status with auto-retry
export const ensureAuthenticated = async (maxRetries = 2): Promise<User | null> => {
  let attempts = 0
  
  while (attempts <= maxRetries) {
    const user = getCurrentUser()
    if (user) {
      return user
    }
    
    console.log(`Attempting to authenticate (attempt ${attempts + 1}/${maxRetries + 1})...`)
    const authResult = await authenticateUser(attempts > 0)
    
    if (authResult) {
      return authResult
    }
    
    attempts++
    
    if (attempts <= maxRetries) {
      await new Promise(resolve => setTimeout(resolve, 1000 * attempts))
    }
  }
  
  console.error("❌ Failed to ensure authentication after", maxRetries + 1, "attempts")
  return null
}
