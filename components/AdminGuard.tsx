"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  useEffect(() => {
    if (typeof window !== "undefined" && localStorage.getItem("isAdmin") !== "true") {
      router.replace("/login")
    }
  }, [router])
  return <>{children}</>
}