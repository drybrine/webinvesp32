"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { authenticateUser, onAuthChange, getCurrentUser } from "@/lib/auth"
import { User } from "firebase/auth"

const SESSION_TIMEOUT = 30 * 60 * 1000 // 30 minutes in milliseconds
const ACTIVITY_CHECK_INTERVAL = 60 * 1000 // Check every minute
const LAST_ACTIVITY_KEY = "lastActivity"
const IS_ADMIN_KEY = "isAdmin"
const SESSION_START_KEY = "sessionStart"

export function useSession() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false)
  const [sessionTimeLeft, setSessionTimeLeft] = useState<number>(0)
  const [isLoading, setIsLoading] = useState(true)
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null)
  const router = useRouter()

  // Initialize Firebase Authentication
  useEffect(() => {
    // Force Firebase initialization if not already done
    if (typeof window !== "undefined") {
      try {
        import("@/lib/firebase").then(() => {
          // Firebase module loaded
        });
      } catch (e) {
        console.error("Firebase import error:", e);
      }
    }
    
    const unsubscribe = onAuthChange((user) => {
      setFirebaseUser(user)
      
      if (user) {
        // User is signed in to Firebase
        // Check if also has admin session
        const isAdmin = localStorage.getItem(IS_ADMIN_KEY) === "true"
        
        if (isAdmin) {
          setIsAuthenticated(true)
          const sessionStart = localStorage.getItem(SESSION_START_KEY)
          if (sessionStart) {
            const elapsed = Date.now() - parseInt(sessionStart)
            setSessionTimeLeft(Math.max(0, SESSION_TIMEOUT - elapsed))
          }
        } else {
          setIsAuthenticated(false)
        }
      } else {
        setIsAuthenticated(false)
        // Try to authenticate anonymously
        authenticateUser().then(user => {
          // Authentication completed
        }).catch(error => {
          console.warn("Failed to authenticate with Firebase:", error)
        })
      }
      setIsLoading(false)
    })

    // Set a timeout to stop loading state even if Firebase doesn't respond
    const timeoutId = setTimeout(() => {
      setIsLoading(false)
      
      // Try manual auth check if Firebase is taking too long
      const isAdmin = localStorage.getItem(IS_ADMIN_KEY) === "true"
      if (isAdmin) {
        setIsAuthenticated(true)
      }
    }, 10000)

    return () => {
      clearTimeout(timeoutId)
      unsubscribe()
    }
  }, [])

  // Listen for localStorage changes to update authentication state
  useEffect(() => {
    const handleStorageChange = () => {
      const isAdmin = localStorage.getItem(IS_ADMIN_KEY) === "true"
      if (isAdmin && !isAuthenticated) {
        setIsAuthenticated(true)
        const sessionStart = localStorage.getItem(SESSION_START_KEY)
        if (sessionStart) {
          const elapsed = Date.now() - parseInt(sessionStart)
          setSessionTimeLeft(Math.max(0, SESSION_TIMEOUT - elapsed))
        }
      } else if (!isAdmin && isAuthenticated) {
        setIsAuthenticated(false)
      }
    }

    // Listen for storage events (including manual triggers)
    window.addEventListener('storage', handleStorageChange)
    
    return () => {
      window.removeEventListener('storage', handleStorageChange)
    }
  }, [isAuthenticated])

  // Update last activity timestamp
  const updateActivity = useCallback(() => {
    if (typeof window !== "undefined") {
      const now = Date.now()
      localStorage.setItem(LAST_ACTIVITY_KEY, now.toString())
    }
  }, [])

  // Login function
  const login = useCallback(async (username: string, password: string) => {
    // Simple authentication - replace with real auth in production
    if (username === "admin" && password === "admin123") {
      try {
        // Ensure Firebase user is authenticated first
        let currentUser = firebaseUser;
        if (!currentUser) {
          currentUser = await authenticateUser()
        }

        const now = Date.now()
        localStorage.setItem(IS_ADMIN_KEY, "true")
        localStorage.setItem(SESSION_START_KEY, now.toString())
        localStorage.setItem(LAST_ACTIVITY_KEY, now.toString())
        
        // Force state update
        setIsAuthenticated(true)
        setSessionTimeLeft(SESSION_TIMEOUT)
        setIsLoading(false)
        
        // Trigger storage event for state refresh
        setTimeout(() => {
          window.dispatchEvent(new Event('storage'))
        }, 100)
        
        return true
      } catch (error) {
        console.error("Login process failed:", error)
        return false
      }
    }
    
    return false
  }, [firebaseUser])

  // Logout function
  const logout = useCallback((isAutoLogout = false) => {
    // Mark that user was logged in if it's an auto logout
    if (isAutoLogout) {
      localStorage.setItem("wasLoggedIn", "true")
    }
    
    // Clear all session data
    localStorage.removeItem(IS_ADMIN_KEY)
    localStorage.removeItem(SESSION_START_KEY)
    localStorage.removeItem(LAST_ACTIVITY_KEY)
    
    // Force state update
    setIsAuthenticated(false)
    setSessionTimeLeft(0)
    setIsLoading(false)
    
    // Force navigation to login with window.location
    window.location.href = "/login"
  }, [])

  // Check if session is still valid
  const checkSession = useCallback(() => {
    if (typeof window === "undefined") return false

    const isAdmin = localStorage.getItem(IS_ADMIN_KEY)
    const lastActivity = localStorage.getItem(LAST_ACTIVITY_KEY)
    
    if (!isAdmin || isAdmin !== "true" || !lastActivity) {
      return false
    }

    // Don't require Firebase user for session validation
    // Firebase auth and admin session are separate concerns
    const now = Date.now()
    const lastActivityTime = parseInt(lastActivity)
    const timeSinceActivity = now - lastActivityTime

    // Check if session has expired
    if (timeSinceActivity > SESSION_TIMEOUT) {
      return false
    }

    // Update session time left
    const timeLeft = SESSION_TIMEOUT - timeSinceActivity
    setSessionTimeLeft(timeLeft)
    
    return true
  }, [firebaseUser])

  // Add activity listeners
  useEffect(() => {
    if (typeof window === "undefined") return

    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click']
    
    const activityHandler = () => {
      if (isAuthenticated) {
        updateActivity()
      }
    }

    // Add event listeners for user activity
    events.forEach(event => {
      document.addEventListener(event, activityHandler, true)
    })

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, activityHandler, true)
      })
    }
  }, [isAuthenticated, updateActivity])

  // Session check interval
  useEffect(() => {
    if (typeof window === "undefined") return

    // Initial session check
    const sessionValid = checkSession()
    setIsAuthenticated(sessionValid)
    setIsLoading(false)

    if (!sessionValid && localStorage.getItem(IS_ADMIN_KEY)) {
      logout(true) // Auto logout
      return
    }

    // Set up interval to check session
    const interval = setInterval(() => {
      const sessionValid = checkSession()
      
      if (!sessionValid && isAuthenticated) {
        logout(true) // Auto logout due to session expiry
      }
    }, ACTIVITY_CHECK_INTERVAL)

    return () => clearInterval(interval)
  }, [checkSession, logout, isAuthenticated])

  // Format time left for display
  const formatTimeLeft = (milliseconds: number): string => {
    const minutes = Math.floor(milliseconds / (1000 * 60))
    const seconds = Math.floor((milliseconds % (1000 * 60)) / 1000)
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  return {
    isAuthenticated,
    isLoading,
    sessionTimeLeft,
    firebaseUser,
    formatTimeLeft: () => formatTimeLeft(sessionTimeLeft),
    login,
    logout,
    updateActivity
  }
}
