import React from 'react'

export default function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-3">
        <div className="relative w-10 h-10 mx-auto">
          <div className="absolute inset-0 border-4 border-muted rounded-full"></div>
          <div className="absolute inset-0 border-4 border-transparent border-t-primary rounded-full animate-spin"></div>
        </div>
        <p className="text-sm text-muted-foreground">Memuat...</p>
      </div>
    </div>
  )
}
