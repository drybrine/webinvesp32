import type React from "react"
import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import Navigation from "@/components/navigation"
import { Toaster } from "@/components/ui/toaster"
import { RealtimeScanProvider } from "@/components/realtime-scan-provider"
import { DeviceStatusMonitorProvider } from "@/components/device-status-monitor-provider"
import ServiceWorkerRegistration from "@/components/service-worker-registration"
import PerformanceMonitor from "@/components/performance-monitor"
import FirebaseDeprecationSuppressor from "./firebase-deprecation-suppressor"
import CSSOptimizer from "@/components/css-optimizer"
import { criticalCSS } from "@/lib/critical-css"

// Optimized font loading
const inter = Inter({
  subsets: ["latin"],
  display: 'swap',
})

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
  metadataBase: new URL('https://stokmanager.netlify.app'),
}

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: "cover",
  themeColor: "#ffffff",
  colorScheme: "light",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="id" className={inter.className}>
      <head>
        {/* Critical CSS preload hints */}
        <link rel="preload" href="/_next/static/css/app/layout.css" as="style" />
        <link rel="preload" href="/_next/static/css/app/globals.css" as="style" />
        
        {/* Preconnect to critical origins for faster connections */}
        <link rel="preconnect" href="https://apis.google.com" />
        <link rel="preconnect" href="https://barcodescanesp32.firebaseapp.com" />
        <link rel="preconnect" href="https://barcodescanesp32-default-rtdb.asia-southeast1.firebasedatabase.app" />
        <link rel="preconnect" href="https://s-apse1c-nss-2204.asia-southeast1.firebasedatabase.app" />
        
        {/* DNS prefetch and preconnect for fonts and other resources */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="//www.googleapis.com" />
        <link rel="dns-prefetch" href="//firebasedatabase.app" />
        
        {/* Preload critical fonts */}
        <link
          rel="preload"
          href="https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hiA.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        
        {/* PWA and meta tags */}
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
        
        {/* Inline critical CSS to prevent render blocking */}
        <style dangerouslySetInnerHTML={{ __html: criticalCSS }} />
      </head>
      <body>
        <FirebaseDeprecationSuppressor />
        <CSSOptimizer />
        <ServiceWorkerRegistration />
        {process.env.NODE_ENV === 'production' && <PerformanceMonitor />}
        <DeviceStatusMonitorProvider>
          <RealtimeScanProvider>
            <Navigation />
            <main>{children}</main>
            <Toaster />
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
