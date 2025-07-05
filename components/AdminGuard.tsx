"use client"

import { usePathname, useRouter } from "next/navigation"
import { useSession } from "@/hooks/use-session"
import { useEffect } from "react"

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { isAuthenticated, isLoading } = useSession()

  // Redirect to login if not authenticated and not loading
  useEffect(() => {
    if (!isLoading && !isAuthenticated && pathname !== "/login") {
      router.replace("/login")
    }
  }, [isAuthenticated, isLoading, pathname, router])

  // Redirect to dashboard if authenticated and on login page
  useEffect(() => {
    if (!isLoading && isAuthenticated && pathname === "/login") {
      // Force navigation with window.location to ensure clean redirect
      window.location.href = "/"
    }
  }, [isAuthenticated, isLoading, pathname])

  // Show loading spinner while checking session
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="mt-4 text-gray-600">Memeriksa sesi...</p>
        </div>
      </div>
    )
  }

  // Allow access to login page without authentication
  if (pathname === "/login") {
    // If user is authenticated, show redirecting message (useEffect will handle redirect)
    if (isAuthenticated) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="flex flex-col items-center">
            <div className="w-6 h-6 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="mt-2 text-gray-600">Mengarahkan ke dashboard...</p>
          </div>
        </div>
      )
    }
    return <>{children}</>
  }

  // Don't render anything if not authenticated (redirect will happen via useEffect)
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center">
          <div className="w-6 h-6 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="mt-2 text-gray-600">Mengarahkan ke login...</p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}