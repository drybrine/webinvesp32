"use client"

import { usePathname } from "next/navigation"
import Navigation from "@/components/navigation"
import { RealtimeScanProvider } from "@/components/realtime-scan-provider"

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

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
