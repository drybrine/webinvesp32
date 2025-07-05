"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"

const SESSION_TIMEOUT = 30 * 60 * 1000 // 30 minutes in milliseconds
const ACTIVITY_CHECK_INTERVAL = 60 * 1000 // Check every minute
const LAST_ACTIVITY_KEY = "lastActivity"
const IS_ADMIN_KEY = "isAdmin"
const SESSION_START_KEY = "sessionStart"

export function useSession() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false)
  const [sessionTimeLeft, setSessionTimeLeft] = useState<number>(0)
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()

  // Update last activity timestamp
  const updateActivity = useCallback(() => {
    if (typeof window !== "undefined") {
      const now = Date.now()
      localStorage.setItem(LAST_ACTIVITY_KEY, now.toString())
    }
  }, [])

  // Login function
  const login = useCallback((username: string, password: string) => {
    // Simple authentication - replace with real auth in production
    if (username === "admin" && password === "admin123") {
      const now = Date.now()
      localStorage.setItem(IS_ADMIN_KEY, "true")
      localStorage.setItem(SESSION_START_KEY, now.toString())
      localStorage.setItem(LAST_ACTIVITY_KEY, now.toString())
      
      // Force state update
      setIsAuthenticated(true)
      setSessionTimeLeft(SESSION_TIMEOUT)
      setIsLoading(false)
      
      // Force redirect to dashboard after successful login
      setTimeout(() => {
        window.location.href = "/"
      }, 100)
      
      return true
    }
    return false
  }, [])

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
  }, [])

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
    formatTimeLeft: () => formatTimeLeft(sessionTimeLeft),
    login,
    logout,
    updateActivity
  }
}
