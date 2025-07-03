"use client"

import React, { useState, useEffect, useCallback } from 'react'
import { handleFirebaseError, startConnectionMonitoring, stopConnectionMonitoring } from '@/lib/firebase'
import { ensureAuthenticated, forceReauth } from '@/lib/auth'

interface FirebaseErrorState {
  error: string | null
  errorType: 'permission' | 'network' | 'auth' | 'rules' | 'unknown' | null
  isRetrying: boolean
  retryCount: number
  isOnline: boolean
}

interface UseFirebaseErrorHandlingOptions {
  enableConnectionMonitoring?: boolean
  maxRetries?: number
  retryDelay?: number
}

export function useFirebaseErrorHandling(options: UseFirebaseErrorHandlingOptions = {}) {
  const {
    enableConnectionMonitoring = true,
    maxRetries = 3,
    retryDelay = 1000
  } = options

  const [errorState, setErrorState] = useState<FirebaseErrorState>({
    error: null,
    errorType: null,
    isRetrying: false,
    retryCount: 0,
    isOnline: typeof window !== 'undefined' ? navigator.onLine : true
  })

  // Monitor online status
  useEffect(() => {
    if (typeof window === 'undefined') return

    const handleOnline = () => setErrorState(prev => ({ ...prev, isOnline: true }))
    const handleOffline = () => setErrorState(prev => ({ ...prev, isOnline: false }))

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Start connection monitoring
  useEffect(() => {
    if (enableConnectionMonitoring) {
      startConnectionMonitoring()
      return () => stopConnectionMonitoring()
    }
  }, [enableConnectionMonitoring])

  // Handle Firebase errors with recovery strategies
  const handleError = useCallback(async (error: any, operation: string): Promise<boolean> => {
    console.error(`Firebase error in ${operation}:`, error)

    const errorInfo = handleFirebaseError(error, operation)
    
    setErrorState(prev => ({
      ...prev,
      error: errorInfo.message,
      errorType: errorInfo.type as FirebaseErrorState['errorType'],
      isRetrying: false
    }))

    return errorInfo.recoverable
  }, [])

  // Retry with exponential backoff
  const retry = useCallback(async (operation: () => Promise<any>): Promise<boolean> => {
    if (errorState.retryCount >= maxRetries) {
      console.error('Max retries exceeded')
      return false
    }

    setErrorState(prev => ({
      ...prev,
      isRetrying: true,
      retryCount: prev.retryCount + 1
    }))

    try {
      // Handle auth-specific retries
      if (errorState.errorType === 'auth') {
        console.log('Attempting re-authentication...')
        await forceReauth()
      } else if (errorState.errorType === 'permission') {
        console.log('Ensuring authentication...')
        await ensureAuthenticated()
      }

      // Exponential backoff
      const delay = retryDelay * Math.pow(2, errorState.retryCount)
      await new Promise(resolve => setTimeout(resolve, delay))

      // Retry the operation
      await operation()

      // Success - clear error state
      setErrorState({
        error: null,
        errorType: null,
        isRetrying: false,
        retryCount: 0,
        isOnline: errorState.isOnline
      })

      return true
    } catch (retryError) {
      console.error('Retry failed:', retryError)
      
      const retryErrorInfo = handleFirebaseError(retryError, 'retry')
      
      setErrorState(prev => ({
        ...prev,
        error: retryErrorInfo.message,
        errorType: retryErrorInfo.type as FirebaseErrorState['errorType'],
        isRetrying: false
      }))

      return false
    }
  }, [errorState.retryCount, errorState.errorType, errorState.isOnline, maxRetries, retryDelay])

  // Clear error state
  const clearError = useCallback(() => {
    setErrorState({
      error: null,
      errorType: null,
      isRetrying: false,
      retryCount: 0,
      isOnline: errorState.isOnline
    })
  }, [errorState.isOnline])

  // Reset retry count
  const resetRetries = useCallback(() => {
    setErrorState(prev => ({
      ...prev,
      retryCount: 0
    }))
  }, [])

  return {
    error: errorState.error,
    errorType: errorState.errorType,
    isRetrying: errorState.isRetrying,
    retryCount: errorState.retryCount,
    isOnline: errorState.isOnline,
    hasError: !!errorState.error,
    canRetry: errorState.retryCount < maxRetries && errorState.isOnline,
    handleError,
    retry,
    clearError,
    resetRetries
  }
}

// Higher-order component for Firebase error handling
export function withFirebaseErrorHandling<T extends object>(
  WrappedComponent: React.ComponentType<T & { firebaseErrorHandling?: ReturnType<typeof useFirebaseErrorHandling> }>,
  errorHandlingOptions?: UseFirebaseErrorHandlingOptions
) {
  return function WithFirebaseErrorHandlingComponent(props: T) {
    const errorHandling = useFirebaseErrorHandling(errorHandlingOptions)
    
    return React.createElement(WrappedComponent, {
      ...props,
      firebaseErrorHandling: errorHandling
    } as T & { firebaseErrorHandling: ReturnType<typeof useFirebaseErrorHandling> })
  }
}
