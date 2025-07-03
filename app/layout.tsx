import type React from "react"
import { SpeedInsights } from "@vercel/speed-insights/next"
import type { Metadata } from "next"
// Temporarily disable Google Fonts for build
// import { Inter } from "next/font/google"
import "./globals.css"
import Navigation from "@/components/navigation"
import { Toaster } from "@/components/ui/toaster"
import { RealtimeScanProvider } from "@/components/realtime-scan-provider"
import { RealtimeAttendanceProvider } from "@/components/realtime-attendance-provider"
import { AdminGuard } from "@/components/AdminGuard"
import { DeviceStatusMonitorProvider } from "@/components/device-status-monitor-provider"
import ServiceWorkerRegistration from "@/components/service-worker-registration"
import PerformanceMonitor from "@/components/performance-monitor"
import AutoAuth from "@/components/auto-auth"

// Temporarily use system fonts for build
// const inter = Inter({ 
//   subsets: ["latin"],
//   display: 'swap', // Better font loading performance
//   preload: true,
//   fallback: ['system-ui', 'arial'],
//   adjustFontFallback: false,
// })

export const metadata: Metadata = {
  title: "StokManager - Sistem Manajemen Inventaris",
  description: "Pemindai barcode real-time dengan integrasi ESP32",
  generator: "Next.js",
  keywords: ["inventory", "barcode", "esp32", "stock", "management"],
  authors: [{ name: "StokManager Team" }],
  creator: "StokManager",
  publisher: "StokManager",
  robots: "index, follow",
  openGraph: {
    title: "StokManager - Sistem Manajemen Inventaris",
    description: "Pemindai barcode real-time dengan integrasi ESP32",
    type: "website",
    locale: "id_ID",
  },
  twitter: {
    card: "summary_large_image",
    title: "StokManager - Sistem Manajemen Inventaris",
    description: "Pemindai barcode real-time dengan integrasi ESP32",
  },
  metadataBase: new URL('https://webinesp32.vercel.app'),
}

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: "#ffffff",
  colorScheme: "light",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="id" className="font-sans">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet" />
        <link rel="dns-prefetch" href="//fonts.googleapis.com" />
        <link rel="dns-prefetch" href="//fonts.gstatic.com" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/placeholder-logo.png" />
        <meta name="theme-color" content="#ffffff" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="StokManager" />
        <meta name="format-detection" content="telephone=no" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="msapplication-TileColor" content="#ffffff" />
        <meta name="msapplication-tap-highlight" content="no" />
      </head>
      <body>
        <AutoAuth>
          <ServiceWorkerRegistration />
          {process.env.NODE_ENV === 'development' && <PerformanceMonitor />}
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
        </AutoAuth>
        <SpeedInsights />
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
