"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { 
  Wifi, 
  WifiOff, 
  RefreshCw, 
  Circle,
  Zap,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Settings // Added Settings
} from "lucide-react"
import { cn } from "@/lib/utils"

interface ConnectionStatusProps {
  connectionStatus: 'connected' | 'disconnected' | 'connecting'
  lastUpdate: Date
  onRefresh?: () => void
  onlineDevices: number
  totalDevices: number
  isRefreshing?: boolean
}

export function ConnectionStatusIndicator({
  connectionStatus,
  lastUpdate,
  onRefresh,
  onlineDevices,
  totalDevices,
  isRefreshing = false
}: ConnectionStatusProps) {
  const router = useRouter()
  const [timeAgo, setTimeAgo] = useState("")
  const [refreshCount, setRefreshCount] = useState(0)

  // Update time ago every second with more detailed timing
  useEffect(() => {
    const updateTimeAgo = () => {
      const now = new Date()
      const diffMs = now.getTime() - lastUpdate.getTime()
      const diffSeconds = Math.floor(diffMs / 1000)
      const diffMinutes = Math.floor(diffSeconds / 60)
      
      if (diffSeconds < 10) {
        setTimeAgo("baru saja")
      } else if (diffSeconds < 60) {
        setTimeAgo(`${diffSeconds}d yang lalu`)
      } else if (diffMinutes < 60) {
        setTimeAgo(`${diffMinutes}m yang lalu`)
      } else {
        const diffHours = Math.floor(diffMinutes / 60)
        setTimeAgo(`${diffHours}j yang lalu`)
      }
    }

    updateTimeAgo()
    const interval = setInterval(updateTimeAgo, 1000)
    return () => clearInterval(interval)
  }, [lastUpdate])

  // Track refresh events for visual feedback
  useEffect(() => {
    if (isRefreshing) {
      setRefreshCount(prev => prev + 1)
    }
  }, [isRefreshing])

  const getStatusIcon = () => {
    switch (connectionStatus) {
      case 'connected':
        return onlineDevices > 0 ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
        ) : (
          <Wifi className="h-4 w-4 text-blue-500" />
        )
      case 'connecting':
        return <RefreshCw className="h-4 w-4 text-yellow-500 animate-spin" />
      case 'disconnected':
        return <AlertTriangle className="h-4 w-4 text-red-500 animate-pulse" />
      default:
        return <WifiOff className="h-4 w-4 text-gray-600 dark:text-gray-300" />
    }
  }

  const getStatusText = () => {
    switch (connectionStatus) {
      case 'connected':
        return onlineDevices > 0 ? "Real-time" : "Siaga"
      case 'connecting':
        return "Memeriksa..."
      case 'disconnected':
        return "Terputus"
      default:
        return "Unknown"
    }
  }

  const getStatusColor = () => {
    switch (connectionStatus) {
      case 'connected':
        return onlineDevices > 0 ? "bg-emerald-500" : "bg-blue-500"
      case 'connecting':
        return "bg-yellow-500 animate-pulse"
      case 'disconnected':
        return "bg-red-500 animate-pulse"
      default:
        return "bg-gray-400"
    }
  }

  const handleRefresh = () => {
    if (onRefresh && !isRefreshing && connectionStatus !== 'connecting') {
      onRefresh()
    }
  }

  const handleSettings = () => {
    router.push('/pengaturan?tab=devices')
  }

  const isNoDeviceRegistered = totalDevices === 0

  return (
    <div className="flex items-center justify-between bg-white/80 backdrop-blur-sm border border-gray-200/50 rounded-xl p-3 sm:p-4 shadow-sm hover:shadow-md transition-all duration-300">
      {/* Status Indicator */}
      <div className="flex items-center space-x-3">
        <div className="relative">
          {getStatusIcon()}
          <div className={cn(
            "absolute -top-1 -right-1 w-3 h-3 rounded-full",
            getStatusColor(),
            connectionStatus === 'connected' && onlineDevices > 0 && "animate-pulse"
          )}></div>
        </div>
        
        <div className="flex flex-col">
          <div className="flex items-center space-x-2">
            <span className="text-sm font-semibold text-gray-900">
              {getStatusText()}
            </span>
            {connectionStatus === 'connected' && (
              <Badge 
                variant={onlineDevices > 0 ? "default" : "secondary"} 
                className={cn(
                  "text-xs px-2 py-0.5",
                  onlineDevices > 0 ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-600"
                )}
              >
                {onlineDevices}/{totalDevices}
              </Badge>
            )}
          </div>
          <span className="text-xs text-gray-500 flex items-center space-x-1">
            <Clock className="h-3 w-3" />
            <span>{timeAgo}</span>
          </span>
        </div>
      </div>

      {/* Action Button: Settings or Refresh */}
      <div className="flex items-center space-x-2">
        <Button
          variant="outline"
          size="icon"
          onClick={isNoDeviceRegistered ? handleSettings : handleRefresh}
          disabled={isRefreshing || (connectionStatus === 'connecting' && !isNoDeviceRegistered)}
          className={cn(
            "h-8 w-8 p-0 rounded-lg transition-all duration-200 hover:scale-105",
            isNoDeviceRegistered 
              ? "hover:bg-gray-100 hover:border-gray-300" 
              : "hover:bg-emerald-50 hover:border-emerald-300",
            (isRefreshing || (connectionStatus === 'connecting' && !isNoDeviceRegistered)) && "cursor-not-allowed opacity-50"
          )}
          aria-label={isNoDeviceRegistered ? "Kelola Perangkat" : "Refresh Status"}
        >
          {isNoDeviceRegistered ? (
            <Settings className="h-4 w-4 text-gray-600" />
          ) : (
            <RefreshCw 
              key={refreshCount}
              className={cn(
                "h-4 w-4 transition-transform duration-200 text-emerald-700 dark:text-emerald-400",
                isRefreshing && "animate-spin-slow"
              )} 
            />
          )}
        </Button>
      </div>
    </div>
  )
}

// Enhanced device status badge with animations
interface DeviceStatusBadgeProps {
  status: 'online' | 'offline'
  deviceId: string
  ipAddress?: string
  lastSeen?: any
  isTransitioning?: boolean
}

export function DeviceStatusBadge({ 
  status, 
  deviceId, 
  ipAddress, 
  lastSeen, 
  isTransitioning = false 
}: DeviceStatusBadgeProps) {
  const isOnline = status === 'online'
  
  const getBadgeStyles = () => {
    if (isOnline) {
      return "bg-emerald-50 border-emerald-300 text-emerald-800"
    }
    return "bg-red-50 border-red-300 text-red-800"
  }

  return (
    <div className={cn(
      "flex items-center space-x-2 px-3 py-2 rounded-lg border transition-all duration-500",
      getBadgeStyles(),
      isTransitioning && "animate-pulse"
    )}>
      <div className="relative">
        {isOnline ? (
          <Wifi className="h-4 w-4" />
        ) : (
          <WifiOff className="h-4 w-4" />
        )}
        <div className={cn(
          "absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full",
          isOnline ? "bg-emerald-500 animate-pulse" : "bg-red-500"
        )}></div>
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center space-x-1">
          <span className="text-sm font-medium truncate">{deviceId}</span>
          <Circle className={cn(
            "h-2 w-2 fill-current",
            isOnline ? "text-emerald-500" : "text-red-500"
          )} />
        </div>
        {isOnline && ipAddress && (
          <div className="text-xs font-mono text-gray-700 dark:text-gray-300 truncate">
            {ipAddress}
          </div>
        )}
      </div>
      
      <Badge 
        variant={isOnline ? "default" : "destructive"}
        className={cn(
          "text-xs",
          isOnline && "bg-emerald-500 hover:bg-emerald-600",
          isTransitioning && "animate-bounce"
        )}
      >
        {isOnline ? 'Online' : 'Offline'}
      </Badge>
    </div>
  )
}
