"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"
import Navigation from "@/components/navigation"
import { RealtimeScanProvider } from "@/components/realtime-scan-provider"

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  // Reset scroll position on client-side page navigations
  useEffect(() => {
    if (typeof window === "undefined") return
    window.scrollTo(0, 0)
    document.documentElement.scrollTop = 0
    document.body.scrollTop = 0
    const main = document.getElementById("main-content")
    if (main) main.scrollTop = 0
  }, [pathname])

  if (pathname === "/login") return <main>{children}</main>

  return (
    <RealtimeScanProvider>
      <a href="#main-content" className="skip-link">
        Lewati ke konten utama
      </a>
      <Navigation />
      <main id="main-content" tabIndex={-1}>
        {children}
      </main>
    </RealtimeScanProvider>
  )
}
