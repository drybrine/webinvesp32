"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { toast } from "@/hooks/use-toast"

interface DeviceStatus {
  deviceId: string
  status: "online" | "offline"
  ipAddress: string
  lastSeen: any
  scanCount: number
  freeHeap?: number
  version?: string
  name?: string
  batteryLevel?: number
  lastHeartbeat?: any
}

interface DeviceStatusUpdate {
  deviceId: string
  previousStatus: string
  newStatus: string
  timestamp: number
  ipAddress?: string
}

export function useRealtimeDeviceStatus() {
  const [devices, setDevices] = useState<DeviceStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date())
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'connecting'>('connecting')
  
  // Keep track of previous device statuses for change detection
  const previousStatusRef = useRef<Map<string, string>>(new Map())
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const retryCountRef = useRef<number>(0)
  const maxRetries = 3
  
  // Enhanced status checking with immediate feedback and retry logic
  const checkDeviceStatus = useCallback(async (showToast = false) => {
    let abortController: AbortController | null = null
    
    try {
      setConnectionStatus('connecting')
      
      // Create AbortController for manual timeout handling
      abortController = new AbortController()
      
      // Set up timeout that doesn't throw abort error
      const timeoutId = setTimeout(() => {
        if (abortController) {
          abortController.abort()
        }
      }, 3000) // 3 second timeout
      
      const response = await fetch('/api/check-device-status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Call': 'true',
        },
        signal: abortController.signal,
      })
      
      // Clear timeout on successful response
      clearTimeout(timeoutId)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const result = await response.json()
      setConnectionStatus('connected')
      setError(null)
      setLastUpdate(new Date())
      
      // Reset retry count on success
      retryCountRef.current = 0

      // Update device data using the response we already have
      if (result.deviceDetails) {
        // Fetch complete device data from Firebase to get IP addresses
        try {
          const devicesResponse = await fetch('/api/devices-status')
          if (devicesResponse.ok) {
            const devicesData = await devicesResponse.json()
            const deviceList = devicesData.devices || []
            
            // Merge with check-device-status response to ensure status is current
            const updatedDeviceList = deviceList.map((device: any) => {
              const statusDetail = result.deviceDetails.find((d: any) => d.deviceId === device.deviceId)
              return {
                ...device,
                status: statusDetail ? statusDetail.currentStatus : device.status,
                lastSeen: statusDetail ? statusDetail.mostRecentTimestamp : device.lastSeen,
              }
            })
            
            // Detect status changes and show notifications
            const statusChanges: DeviceStatusUpdate[] = []
            updatedDeviceList.forEach((device: DeviceStatus) => {
              const previousStatus = previousStatusRef.current.get(device.deviceId)
              if (previousStatus && previousStatus !== device.status) {
                statusChanges.push({
                  deviceId: device.deviceId,
                  previousStatus,
                  newStatus: device.status,
                  timestamp: Date.now(),
                  ipAddress: device.ipAddress,
                })
              }
              previousStatusRef.current.set(device.deviceId, device.status)
            })

            // Show notifications for status changes
            statusChanges.forEach((change) => {
              const isNowOnline = change.newStatus === 'online'
              toast({
                title: isNowOnline ? "Perangkat Terhubung" : "Perangkat Terputus",
                description: `${change.deviceId} ${isNowOnline ? 'online' : 'offline'}`,
                variant: isNowOnline ? "default" : "destructive",
              })
            })
            
            setDevices(updatedDeviceList)
          } else {
            // Fallback to basic device info from check-device-status
            const deviceList = result.deviceDetails.map((detail: any) => ({
              deviceId: detail.deviceId,
              status: detail.currentStatus,
              ipAddress: '', // Not available in check-device-status response
              lastSeen: detail.mostRecentTimestamp,
              scanCount: 0, // Not available in check-device-status response
              lastHeartbeat: detail.lastHeartbeat,
              name: detail.deviceId, // Use deviceId as name for now
            }))
            setDevices(deviceList)
          }
        } catch (fetchError) {
          console.warn('Failed to fetch complete device data, using basic status info:', fetchError)
          // Fallback to basic device info from check-device-status
          const deviceList = result.deviceDetails.map((detail: any) => ({
            deviceId: detail.deviceId,
            status: detail.currentStatus,
            ipAddress: '', // Not available in check-device-status response
            lastSeen: detail.mostRecentTimestamp,
            scanCount: 0, // Not available in check-device-status response
            lastHeartbeat: detail.lastHeartbeat,
            name: detail.deviceId, // Use deviceId as name for now
          }))
          setDevices(deviceList)
        }
      }

      if (showToast && result.updatedDevices > 0) {
        toast({
          title: "Status Diperbarui",
          description: `${result.updatedDevices} perangkat diperbarui (${result.onlineDevices} online, ${result.offlineDevices} offline)`,
        })
      }

      return result
    } catch (error) {
      // Handle AbortError differently to avoid console spam
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('Request timeout - device status check aborted after 3 seconds')
        setConnectionStatus('disconnected')
        setError('Connection timeout')
        
        if (showToast) {
          toast({
            title: "Koneksi Timeout",
            description: "Pemeriksaan status perangkat melebihi batas waktu",
            variant: "destructive",
          })
        }
      } else {
        console.error('Device status check failed:', error)
        setConnectionStatus('disconnected')
        setError(error instanceof Error ? error.message : 'Failed to check device status')
        
        // Increment retry count
        retryCountRef.current++
        
        if (showToast) {
          toast({
            title: "Koneksi Terputus",
            description: `Gagal memeriksa status perangkat (percobaan ${retryCountRef.current}/${maxRetries})`,
            variant: "destructive",
          })
        }
      }
      
      throw error
    }
  }, [])

  // Fetch device data from Firebase or check-device-status API
  const fetchDeviceData = useCallback(async () => {
    let abortController: AbortController | null = null
    
    try {
      // First try to get device data from check-device-status API
      // which already has the device information
      abortController = new AbortController()
      
      // Set up timeout
      const timeoutId = setTimeout(() => {
        if (abortController) {
          abortController.abort()
        }
      }, 3000)
      
      const response = await fetch('/api/check-device-status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Call': 'true',
        },
        signal: abortController.signal,
      })
      
      clearTimeout(timeoutId)

      if (!response.ok) {
        throw new Error(`Failed to fetch devices: ${response.statusText}`)
      }

      const data = await response.json()
      
      if (!data.success || !data.deviceDetails) {
        throw new Error('Invalid device data received')
      }

      // Transform device details to match expected format
      const deviceList = data.deviceDetails.map((detail: any) => ({
        deviceId: detail.deviceId,
        status: detail.currentStatus,
        ipAddress: '', // Not available in check-device-status response
        lastSeen: detail.mostRecentTimestamp,
        scanCount: 0, // Not available in check-device-status response
        lastHeartbeat: detail.lastHeartbeat,
        name: detail.deviceId, // Use deviceId as name for now
      }))
      
      // Detect status changes and show notifications
      const statusChanges: DeviceStatusUpdate[] = []
      deviceList.forEach((device: DeviceStatus) => {
        const previousStatus = previousStatusRef.current.get(device.deviceId)
        if (previousStatus && previousStatus !== device.status) {
          statusChanges.push({
            deviceId: device.deviceId,
            previousStatus,
            newStatus: device.status,
            timestamp: Date.now(),
            ipAddress: device.ipAddress,
          })
        }
        previousStatusRef.current.set(device.deviceId, device.status)
      })

      // Show notifications for status changes
      statusChanges.forEach((change) => {
        const isNowOnline = change.newStatus === 'online'
        toast({
          title: isNowOnline ? "Perangkat Terhubung" : "Perangkat Terputus",
          description: `${change.deviceId} ${isNowOnline ? 'online' : 'offline'}${change.ipAddress ? ` (${change.ipAddress})` : ''}`,
          variant: isNowOnline ? "default" : "destructive",
        })
      })

      setDevices(deviceList)
      setError(null)
      
      return deviceList
    } catch (error) {
      // Handle AbortError differently
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('Device data fetch timeout - request aborted after 3 seconds')
        setError('Connection timeout')
      } else {
        console.error('Failed to fetch device data:', error)
        setError(error instanceof Error ? error.message : 'Failed to fetch device data')
      }
      
      // Fallback: try firebase-test API as secondary option
      try {
        const fallbackResponse = await fetch('/api/firebase-test', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        })

        if (fallbackResponse.ok) {
          const fallbackData = await fallbackResponse.json()
          const deviceList = fallbackData.devices || []
          setDevices(deviceList)
          setError(null)
          return deviceList
        }
      } catch (fallbackError) {
        console.warn('Fallback firebase-test also failed:', fallbackError)
      }
      
      throw error
    }
  }, [])

  // Enhanced polling with adaptive intervals and retry logic
  const startPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
    }

    // Start with immediate check
    checkDeviceStatus()

    // Use shorter interval for more responsive detection
    pollIntervalRef.current = setInterval(async () => {
      // Only poll when page is visible for better performance
      if (document.visibilityState === 'visible') {
        try {
          await checkDeviceStatus()
        } catch (error) {
          // Implement exponential backoff on error
          if (retryCountRef.current < maxRetries) {
            const backoffDelay = Math.min(1000 * Math.pow(2, retryCountRef.current), 10000) // Max 10s
            console.warn(`Polling failed, retrying in ${backoffDelay}ms...`)
            
            // Clear current interval and set retry timeout
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current)
              pollIntervalRef.current = null
            }
            
            retryTimeoutRef.current = setTimeout(() => {
              startPolling() // Restart polling
            }, backoffDelay)
          } else {
            console.error('Max retries reached, stopping polling temporarily')
            // Stop polling for 30 seconds before trying again
            setTimeout(() => {
              retryCountRef.current = 0
              startPolling()
            }, 30000)
          }
        }
      }
    }, 5000) // 5 seconds - more responsive than 8s

  }, [checkDeviceStatus])

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current)
      retryTimeoutRef.current = null
    }
  }, [])

  // Initialize on mount
  useEffect(() => {
    let mounted = true

    const initialize = async () => {
      setLoading(true)
      try {
        // Use checkDeviceStatus instead of fetchDeviceData to avoid duplication
        await checkDeviceStatus()
        if (mounted) {
          startPolling()
        }
      } catch (error) {
        console.error('Failed to initialize device status:', error)
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    initialize()

    // Handle page visibility changes with immediate check
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && mounted) {
        // Immediately check when page becomes visible
        checkDeviceStatus()
        // Also restart polling to ensure consistent intervals
        if (!pollIntervalRef.current) {
          startPolling()
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    // Handle network status changes with debounce
    let networkEventTimeout: NodeJS.Timeout | null = null
    
    const handleOnline = () => {
      if (mounted) {
        // Clear any pending network event
        if (networkEventTimeout) {
          clearTimeout(networkEventTimeout)
        }
        
        // Debounce network events
        networkEventTimeout = setTimeout(() => {
          toast({
            title: "Koneksi Pulih",
            description: "Memeriksa status perangkat...",
          })
          retryCountRef.current = 0 // Reset retry count
          checkDeviceStatus(true)
          // Restart polling if it was stopped
          if (!pollIntervalRef.current) {
            startPolling()
          }
        }, 1000) // 1 second debounce
      }
    }

    const handleOffline = () => {
      if (mounted) {
        // Clear any pending network event
        if (networkEventTimeout) {
          clearTimeout(networkEventTimeout)
        }
        
        // Debounce network events
        networkEventTimeout = setTimeout(() => {
          setConnectionStatus('disconnected')
          stopPolling() // Stop polling when offline
          toast({
            title: "Koneksi Terputus",
            description: "Tidak dapat memperbarui status perangkat",
            variant: "destructive",
          })
        }, 500) // 0.5 second debounce for offline (faster feedback)
      }
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      mounted = false
      stopPolling()
      if (networkEventTimeout) {
        clearTimeout(networkEventTimeout)
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [checkDeviceStatus, fetchDeviceData, startPolling, stopPolling])

  // Manual refresh function
  const refresh = useCallback(async () => {
    try {
      await checkDeviceStatus(true)
      await fetchDeviceData()
    } catch (error) {
      // Error already handled in checkDeviceStatus
    }
  }, [checkDeviceStatus, fetchDeviceData])

  return {
    devices,
    loading,
    error,
    lastUpdate,
    connectionStatus,
    refresh,
    // Utility functions
    onlineDevices: devices.filter(d => d.status === 'online').length,
    offlineDevices: devices.filter(d => d.status === 'offline').length,
    totalDevices: devices.length,
  }
}
