// Firebase Connection Monitor - Handle WebSocket connection issues
import { ref, onValue, Database } from "firebase/database"

export class FirebaseConnectionMonitor {
  private database: Database | null = null
  private connectionRef: any = null
  private isConnected = false
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 1000 // Start with 1 second

  constructor(database: Database | null) {
    this.database = database
    this.startMonitoring()
  }

  private startMonitoring() {
    if (!this.database) {
      console.warn("⚠️ Firebase database not available for monitoring")
      return
    }

    try {
      this.connectionRef = ref(this.database, '.info/connected')
      
      const unsubscribe = onValue(this.connectionRef, (snapshot) => {
        const connected = snapshot.val()
        
        if (connected) {
          this.isConnected = true
          this.reconnectAttempts = 0
          this.reconnectDelay = 1000
          console.log("✅ Firebase Realtime Database connected")
        } else {
          this.isConnected = false
          console.warn("⚠️ Firebase Realtime Database disconnected")
          this.handleDisconnection()
        }
      }, (error) => {
        console.error("❌ Firebase connection monitoring error:", error)
        this.handleConnectionError(error)
      })

      // Store unsubscribe function for cleanup
      this.connectionRef.unsubscribe = unsubscribe
      
    } catch (error) {
      console.error("❌ Failed to start Firebase connection monitoring:", error)
      this.handleConnectionError(error)
    }
  }

  private handleDisconnection() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++
      console.log(`🔄 Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`)
      
      setTimeout(() => {
        this.startMonitoring()
      }, this.reconnectDelay)
      
      // Exponential backoff
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000) // Max 30 seconds
    } else {
      console.error("❌ Max reconnection attempts reached. Please check your internet connection.")
    }
  }

  private handleConnectionError(error: any) {
    console.error("❌ Firebase connection error details:", {
      message: error?.message || 'Unknown error',
      code: error?.code || 'Unknown code',
      stack: error?.stack || 'No stack trace'
    })

    // Check if it's a network error
    if (error?.message?.includes('ERR_NAME_NOT_RESOLVED') || 
        error?.message?.includes('net::') ||
        error?.code === 'unavailable') {
      console.error("🌐 Network connectivity issue detected. Suggestions:")
      console.error("   1. Check your internet connection")
      console.error("   2. Verify Firebase project configuration")
      console.error("   3. Check if Firebase services are operational")
      console.error("   4. Try refreshing the page")
    }
  }

  public getConnectionStatus(): boolean {
    return this.isConnected
  }

  public forceReconnect() {
    this.reconnectAttempts = 0
    this.reconnectDelay = 1000
    this.startMonitoring()
  }

  public cleanup() {
    if (this.connectionRef?.unsubscribe) {
      this.connectionRef.unsubscribe()
    }
  }
}

// Global connection monitor instance
let connectionMonitor: FirebaseConnectionMonitor | null = null

export const initializeConnectionMonitor = (database: Database | null) => {
  if (connectionMonitor) {
    connectionMonitor.cleanup()
  }
  connectionMonitor = new FirebaseConnectionMonitor(database)
  return connectionMonitor
}

export const getConnectionMonitor = () => connectionMonitor