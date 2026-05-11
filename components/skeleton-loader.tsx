"use client"

import { Skeleton } from "@/components/ui/skeleton"

export function StatsCardSkeleton() {
  return (
    <div className="glass-card shadow-medium" style={{ minHeight: '140px' }}>
      <div className="p-4 sm:p-6">
        <div className="flex items-center justify-between mb-3">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-8 w-8 rounded-lg" />
        </div>
        <Skeleton className="h-8 w-24 mb-2" />
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-1 w-full mt-3" />
      </div>
    </div>
  )
}

export function HeaderSkeleton() {
  return (
    <div style={{ minHeight: '120px' }} className="animate-pulse">
      <div className="flex items-center justify-center md:justify-start mb-4">
        <Skeleton className="w-10 h-10 sm:w-12 sm:h-12 md:w-16 md:h-16 rounded-full" />
        <div className="ml-3 sm:ml-4">
          <Skeleton className="h-8 sm:h-10 md:h-12 w-64 sm:w-80 md:w-96 mb-2" />
          <Skeleton className="h-4 sm:h-5 w-48 sm:w-64" />
        </div>
      </div>
      <div className="flex items-center justify-center md:justify-start space-x-2">
        <Skeleton className="h-1 w-12 sm:w-16" />
        <Skeleton className="h-1 w-6 sm:w-8" />
        <Skeleton className="h-1 w-3 sm:w-4" />
      </div>
    </div>
  )
}

export function TableSkeleton() {
  return (
    <div className="space-y-3">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="flex items-center space-x-4 p-4 border rounded-lg">
          <Skeleton className="h-12 w-12 rounded" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-8 w-20" />
        </div>
      ))}
    </div>
  )
}