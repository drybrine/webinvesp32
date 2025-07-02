import { signInAnonymously, onAuthStateChanged, User } from "firebase/auth"
import { getAuth } from "firebase/auth"

// Simple anonymous authentication for Firebase security rules
export const authenticateUser = async (): Promise<User | null> => {
  try {
    const auth = getAuth()
    
    // Check if user is already signed in
    if (auth.currentUser) {
      return auth.currentUser
    }
    
    // Sign in anonymously
    const userCredential = await signInAnonymously(auth)
    console.log("✅ User authenticated anonymously")
    return userCredential.user
  } catch (error) {
    console.error("❌ Authentication failed:", error)
    return null
  }
}

// Listen for authentication state changes
export const onAuthChange = (callback: (user: User | null) => void) => {
  const auth = getAuth()
  return onAuthStateChanged(auth, callback)
}

// Check if user is authenticated
export const isAuthenticated = (): boolean => {
  const auth = getAuth()
  return !!auth.currentUser
}

// Get current user
export const getCurrentUser = (): User | null => {
  const auth = getAuth()
  return auth.currentUser
}
