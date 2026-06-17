import type React from "react"
import type { Metadata } from "next"
import { Plus_Jakarta_Sans } from "next/font/google"
import "./globals.css"
import Navigation from "@/components/navigation"
import { Toaster } from "@/components/ui/toaster"
import { RealtimeScanProvider } from "@/components/realtime-scan-provider"
import ServiceWorkerRegistration from "@/components/service-worker-registration"
import PerformanceMonitor from "@/components/performance-monitor"
import { SpeedInsights } from "@vercel/speed-insights/next"
import FirebaseDeprecationSuppressor from "./firebase-deprecation-suppressor"
import { criticalCSS } from "@/lib/critical-css"

// Optimized font loading
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  display: 'swap',
})

export const metadata: Metadata = {
  title: "StokManager - Sistem Manajemen Inventory",
  description: "Pemindai barcode real-time dengan integrasi ESP32",
  generator: "Next.js",
  keywords: ["inventory", "barcode", "esp32", "stock", "management"],
  authors: [{ name: "StokManager Team" }],
  creator: "StokManager",
  publisher: "StokManager",
  robots: "index, follow",
  openGraph: {
    title: "StokManager - Sistem Manajemen Inventory",
    description: "Pemindai barcode real-time dengan integrasi ESP32",
    type: "website",
    locale: "id_ID",
  },
  twitter: {
    card: "summary_large_image",
    title: "StokManager - Sistem Manajemen Inventory",
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
  themeColor: "#faf8f5",
  colorScheme: "light",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="id" className={jakarta.className}>
      <head>
        {/* Preconnect to critical origins for faster connections */}
        <link rel="preconnect" href="https://apis.google.com" />
        <link rel="preconnect" href="https://barcodescanesp32.firebaseapp.com" />
        <link rel="preconnect" href="https://barcodescanesp32-default-rtdb.asia-southeast1.firebasedatabase.app" />
        <link rel="preconnect" href="https://s-apse1c-nss-2204.asia-southeast1.firebasedatabase.app" />

        {/* DNS prefetch for Firebase resources. next/font handles font preconnect/preload. */}
        <link rel="dns-prefetch" href="//www.googleapis.com" />
        <link rel="dns-prefetch" href="//firebasedatabase.app" />
        
        {/* PWA and meta tags */}
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/placeholder-logo.png" />
        <meta name="theme-color" content="#faf8f5" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="StokManager" />
        <meta name="format-detection" content="telephone=no" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="msapplication-TileColor" content="#faf8f5" />
        <meta name="msapplication-tap-highlight" content="no" />
        
        {/* Inline critical CSS to prevent render blocking */}
        <style dangerouslySetInnerHTML={{ __html: criticalCSS }} />
      </head>
      <body>
        <FirebaseDeprecationSuppressor />
        <ServiceWorkerRegistration />
        {process.env.NODE_ENV === 'production' && <PerformanceMonitor />}
        <RealtimeScanProvider>
            <Navigation />
            <main>{children}</main>
            <Toaster />
          </RealtimeScanProvider>
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
