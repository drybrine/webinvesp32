import React from 'react'

export default function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="text-center space-y-4">
        {/* Optimized spinner with CSS-only animation */}
        <div className="relative w-16 h-16 mx-auto">
          <div className="absolute inset-0 border-4 border-blue-200 rounded-full animate-pulse"></div>
          <div className="absolute inset-0 border-4 border-transparent border-t-blue-600 rounded-full animate-spin"></div>
        </div>
        
        {/* Loading text with subtle animation */}
        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-gray-800 animate-pulse">
            Memuat StokManager
          </h2>
          <p className="text-sm text-gray-600">
            Menyiapkan sistem manajemen inventaris...
          </p>
        </div>
        
        {/* Progress indicator */}
        <div className="w-48 h-1 bg-gray-200 rounded-full mx-auto overflow-hidden">
          <div className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full animate-pulse"></div>
        </div>
      </div>
    </div>
  )
}
