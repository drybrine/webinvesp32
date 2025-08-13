"use client"

import { useEffect } from 'react'

export default function CSSOptimizer() {
  useEffect(() => {
    // Load non-critical CSS asynchronously
    const loadAsyncCSS = () => {
      // Find all link tags with rel="stylesheet"
      const stylesheets = document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')
      
      stylesheets.forEach((link) => {
        const href = link.getAttribute('href')
        
        // Skip critical CSS files
        if (href && !href.includes('globals.css') && !href.includes('layout.css')) {
          // Convert to preload
          link.setAttribute('rel', 'preload')
          link.setAttribute('as', 'style')
          
          // Add onload handler to apply styles after loading
          link.onload = () => {
            link.onload = null
            link.rel = 'stylesheet'
          }
          
          // Fallback for browsers that don't support preload
          const fallbackLink = document.createElement('link')
          fallbackLink.rel = 'stylesheet'
          fallbackLink.href = href
          
          // Insert fallback with a delay
          setTimeout(() => {
            if (link.getAttribute('rel') === 'preload') {
              document.head.appendChild(fallbackLink)
            }
          }, 3000)
        }
      })
    }
    
    // Run optimization after initial render
    if (document.readyState === 'complete') {
      loadAsyncCSS()
    } else {
      window.addEventListener('load', loadAsyncCSS)
      return () => window.removeEventListener('load', loadAsyncCSS)
    }
  }, [])
  
  return null
}