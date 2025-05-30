import { initializeApp } from "firebase/app"
import { getDatabase, ref, push, set, serverTimestamp, connectDatabaseEmulator } from "firebase/database"
import { getAuth } from "firebase/auth"

// Firebase configuration - using environment variables
const firebaseConfig = {
  apiKey: "AIzaSyBvmLgJ9X3X8X8X8X8X8X8X8X8X8X8X8X8", // Placeholder
  authDomain: "barcodescanesp32.firebaseapp.com",
  databaseURL:
    process.env.FIREBASE_DATABASE_URL || "https://barcodescanesp32-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "barcodescanesp32",
  storageBucket: "barcodescanesp32.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef123456789012345678",
  measurementId: "G-C2L2NFF1C2",
}

// Initialize Firebase with error handling
let app: any = null
let database: any = null
let auth: any = null
let firebaseInitialized = false

try {
  // Only try to initialize if we have a valid database URL
  if (firebaseConfig.databaseURL && firebaseConfig.databaseURL !== "undefined") {
    app = initializeApp(firebaseConfig)

    // Try to get database - this might fail if service is not available
    try {
      database = getDatabase(app)
      auth = getAuth(app)
      firebaseInitialized = true

      // Connect to emulator in development if needed
      if (process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === "true") {
        try {
          connectDatabaseEmulator(database, "localhost", 9000)
        } catch (emulatorError) {
          console.warn("Firebase emulator connection failed:", emulatorError)
        }
      }

      console.log("✅ Firebase initialized successfully")
    } catch (dbError) {
      console.warn("⚠️ Firebase database service not available:", dbError)
      database = null
      auth = null
      firebaseInitialized = false
    }
  } else {
    console.warn("⚠️ Firebase Database URL not configured")
  }
} catch (error) {
  console.warn("⚠️ Firebase initialization failed:", error)
  // Keep database as null for graceful degradation
  database = null
  auth = null
  firebaseInitialized = false
}

export { database, auth }

// Database references - only create if database exists
export const dbRefs = database
  ? {
      inventory: ref(database, "inventory"),
      scans: ref(database, "scans"),
      devices: ref(database, "devices"),
      settings: ref(database, "settings"),
      analytics: ref(database, "analytics"),
    }
  : null

// Helper functions for common operations with error handling
export const firebaseHelpers = {
  // Add new inventory item
  addInventoryItem: async (item: any) => {
    if (!database || !dbRefs) {
      throw new Error("Firebase not available - using local storage")
    }

    try {
      const newItemRef = push(dbRefs.inventory)
      await set(newItemRef, {
        ...item,
        id: newItemRef.key,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      return newItemRef.key
    } catch (error) {
      console.error("Error adding inventory item:", error)
      throw error
    }
  },

  // Update inventory item
  updateInventoryItem: async (id: string, updates: any) => {
    if (!database) {
      throw new Error("Firebase not available - using local storage")
    }

    try {
      const itemRef = ref(database, `inventory/${id}`)
      await set(itemRef, {
        ...updates,
        updatedAt: serverTimestamp(),
      })
    } catch (error) {
      console.error("Error updating inventory item:", error)
      throw error
    }
  },

  // Add scan record
  addScanRecord: async (scanData: any) => {
    if (!database || !dbRefs) {
      throw new Error("Firebase not available - using local storage")
    }

    try {
      const newScanRef = push(dbRefs.scans)
      await set(newScanRef, {
        ...scanData,
        id: newScanRef.key,
        timestamp: serverTimestamp(),
        processed: false,
      })
      return newScanRef.key
    } catch (error) {
      console.error("Error adding scan record:", error)
      throw error
    }
  },

  // Update device status
  updateDeviceStatus: async (deviceId: string, status: any) => {
    if (!database) {
      throw new Error("Firebase not available - using local storage")
    }

    try {
      const deviceRef = ref(database, `devices/${deviceId}`)
      await set(deviceRef, {
        ...status,
        lastSeen: serverTimestamp(),
      })
    } catch (error) {
      console.error("Error updating device status:", error)
      throw error
    }
  },

  // Add analytics data
  addAnalytics: async (type: string, data: any) => {
    if (!database) {
      throw new Error("Firebase not available - using local storage")
    }

    try {
      const analyticsRef = ref(database, `analytics/${type}`)
      const newEntryRef = push(analyticsRef)
      await set(newEntryRef, {
        ...data,
        timestamp: serverTimestamp(),
      })
    } catch (error) {
      console.error("Error adding analytics data:", error)
      throw error
    }
  },
}

// Check if Firebase is properly configured and available
export const isFirebaseConfigured = () => {
  return firebaseInitialized && database !== null
}

// Get Firebase status
export const getFirebaseStatus = () => {
  return {
    initialized: firebaseInitialized,
    databaseUrl: firebaseConfig.databaseURL,
    hasValidConfig: firebaseConfig.databaseURL && firebaseConfig.databaseURL !== "undefined",
    available: database !== null,
  }
}
