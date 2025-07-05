'use client'

import { useEffect } from 'react'

export default function PerformanceMonitor() {
  useEffect(() => {
    if (typeof window !== 'undefined' && 'performance' in window) {
      // Monitor Core Web Vitals
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.entryType === 'largest-contentful-paint') {
            console.log('LCP:', entry.startTime)
          }
          if (entry.entryType === 'first-input') {
            const fidEntry = entry as any
            console.log('FID:', fidEntry.processingStart - fidEntry.startTime)
          }
          if (entry.entryType === 'layout-shift') {
            const clsEntry = entry as any
            if (!clsEntry.hadRecentInput) {
              console.log('CLS:', clsEntry.value)
            }
          }
        }
      })

      // Observe different entry types
      try {
        observer.observe({ entryTypes: ['largest-contentful-paint', 'first-input', 'layout-shift'] })
      } catch (e) {
        // Fallback for browsers that don't support all entry types
        console.log('Performance Observer not fully supported')
      }

      // Monitor page load time
      window.addEventListener('load', () => {
        setTimeout(() => {
          const perfData = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming
          if (perfData) {
            console.log('Page Load Time:', perfData.loadEventEnd - perfData.fetchStart)
            console.log('DOM Content Loaded:', perfData.domContentLoadedEventEnd - perfData.fetchStart)
          }
        }, 0)
      })

      return () => {
        observer.disconnect()
      }
    }
  }, [])

  return null
}
