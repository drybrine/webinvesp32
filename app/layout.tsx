import type React from "react"
import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import Navigation from "@/components/navigation"
import { Toaster } from "@/components/ui/toaster"
import { RealtimeScanProvider } from "@/components/realtime-scan-provider"
import { RealtimeAttendanceProvider } from "@/components/realtime-attendance-provider"
import { AdminGuard } from "@/components/AdminGuard"
import { DeviceStatusMonitorProvider } from "@/components/device-status-monitor-provider"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "StokManager - Sistem Manajemen Inventaris",
  description: "Pemindai barcode real-time dengan integrasi ESP32",
  generator: "v0.dev",
}

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <DeviceStatusMonitorProvider>
          <RealtimeScanProvider>
            <RealtimeAttendanceProvider>
              <AdminGuard>
                <Navigation />
                <main>{children}</main>
                <Toaster />
              </AdminGuard>
            </RealtimeAttendanceProvider>
          </RealtimeScanProvider>
        </DeviceStatusMonitorProvider>
      </body>
    </html>
  )
}

// Cari bagian navigation/menu yang berisi "Scan In/Out" dan ubah menjadi:
// {
//   name: "Riwayat", // Diubah dari "Scan In/Out"
//   href: "/scan",
//   icon: History // atau icon yang sesuai
// }
