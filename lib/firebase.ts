import { initializeApp, getApps, FirebaseApp } from "firebase/app"
import { getDatabase, ref, push, set, update, serverTimestamp, connectDatabaseEmulator, Database, DatabaseReference } from "firebase/database" // Added update
import { getAuth, Auth } from "firebase/auth"

// Firebase configuration - using environment variables
const firebaseConfig = {
  apiKey: "AIzaSyBDMTHkz_BwbqKfkVQYvKEI3yfrOLa_jLY",
  authDomain: "barcodescanesp32.firebaseapp.com",
  databaseURL:
    process.env.FIREBASE_DATABASE_URL || "https://barcodescanesp32-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "barcodescanesp32",
  storageBucket: "barcodescanesp32.firebasestorage.app",
  messagingSenderId: "330721800882",
  appId: "1:330721800882:web:ff7e05a769ab6cd32ccfab",
  measurementId: "G-C2L2NFF1C2",
}

// Initialize Firebase with error handling
let app: FirebaseApp | null = null // Use FirebaseApp type
export let database: Database | null = null
let auth: Auth | null = null // Use Auth type
let firebaseInitialized = false

// Define a type for dbRefs
interface DbRefs {
  inventory: DatabaseReference;
  scans: DatabaseReference;
  devices: DatabaseReference;
  settings: DatabaseReference;
  analytics: DatabaseReference;
  transactions: DatabaseReference; // Ditambahkan
  attendance: DatabaseReference; // Ditambahkan untuk absensi
}
export let dbRefs: DbRefs | null = null; // Initialize as null

// Network connectivity checker
const checkNetworkConnectivity = async (): Promise<boolean> => {
  if (typeof window === "undefined") return true; // Assume server has connectivity
  
  try {
    // Check if navigator.onLine is available and true
    if (!navigator.onLine) {
      console.log("🌐 Browser reports offline");
      return false;
    }
    
    // Try a simple fetch to verify actual connectivity
    const response = await fetch('https://www.google.com/favicon.ico', {
      mode: 'no-cors',
      cache: 'no-cache',
      signal: AbortSignal.timeout(5000), // 5 second timeout
    });
    return true;
  } catch (error) {
    console.log("🌐 Network connectivity check failed:", error);
    return false;
  }
};

// Delayed Firebase initialization with network checking
const initializeFirebaseWithRetry = async (retryCount = 0): Promise<void> => {
  const maxRetries = 3;
  
  if (retryCount > maxRetries) {
    console.warn("🔥 Max retries reached for Firebase initialization");
    return;
  }
  
  // Check network connectivity first
  const hasConnectivity = await checkNetworkConnectivity();
  if (!hasConnectivity && retryCount < maxRetries) {
    console.log(`🔥 No network connectivity, retrying in ${(retryCount + 1) * 2}s...`);
    setTimeout(() => initializeFirebaseWithRetry(retryCount + 1), (retryCount + 1) * 2000);
    return;
  }
  
  try {
    initializeFirebase();
    console.log("🔥 Firebase initialized successfully with network check");
  } catch (error) {
    console.error("🔥 Firebase initialization failed:", error);
    if (retryCount < maxRetries) {
      setTimeout(() => initializeFirebaseWithRetry(retryCount + 1), (retryCount + 1) * 2000);
    }
  }
};

// Only initialize Firebase on the client side
const initializeFirebase = () => {
  if (typeof window === "undefined") {
    return // Don't initialize on server side
  }

  // Check if Firebase apps have already been initialized
  if (getApps().length === 0) {
    // No apps initialized, so initialize Firebase
    app = initializeApp(firebaseConfig)
  } else {
    // Firebase app already initialized, use the existing app
    app = getApps()[0]
  }

  try {
    database = getDatabase(app)
    auth = getAuth(app)
    firebaseInitialized = true

    // Populate dbRefs now that database is initialized
    if (database) {
      dbRefs = {
        inventory: ref(database, "inventory"),
        scans: ref(database, "scans"),
        devices: ref(database, "devices"),
        settings: ref(database, "settings"),
        analytics: ref(database, "analytics"),
        transactions: ref(database, "transactions"), // Ditambahkan
        attendance: ref(database, "attendance"), // Ditambahkan untuk absensi
      };
    }

    // Connect to emulator in development if needed
    if (process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === "true") {
      try {
        // Ensure database is not null before connecting emulator
        if (database) {
          connectDatabaseEmulator(database, "localhost", 9000)
        }
      } catch (emulatorError) {
        console.warn("Firebase emulator connection failed:", emulatorError)
      }
    }

    console.log("✅ Firebase initialized successfully")
    
    // Add error handling for WebSocket connection issues
    if (typeof window !== 'undefined') {
      const originalConsoleError = console.error;
      console.error = function(...args) {
        // Filter out Firebase WebSocket DNS errors that are expected during initialization
        const message = args.join(' ');
        if (message.includes('ERR_NAME_NOT_RESOLVED') && 
            message.includes('firebasedatabase.app')) {
          console.warn('🔥 Firebase WebSocket connection issue (will retry):', args[0]);
          return;
        }
        // Call the original console.error for all other errors
        originalConsoleError.apply(console, args);
      };
    }
    
  } catch (dbError) {
    console.warn("⚠️ Firebase database service not available:", dbError)
    database = null
    auth = null
    dbRefs = null; // Reset dbRefs on error
    firebaseInitialized = false
  }
}

// Server-side Firebase initialization
const initializeFirebaseServer = () => {
  try {
    // Check if Firebase apps have already been initialized
    if (getApps().length === 0) {
      // No apps initialized, so initialize Firebase
      app = initializeApp(firebaseConfig)
    } else {
      // Firebase app already initialized, use the existing app
      app = getApps()[0]
    }

    database = getDatabase(app)
    firebaseInitialized = true

    // Populate dbRefs for server side
    if (database) {
      dbRefs = {
        inventory: ref(database, "inventory"),
        scans: ref(database, "scans"),
        devices: ref(database, "devices"),
        settings: ref(database, "settings"),
        analytics: ref(database, "analytics"),
        transactions: ref(database, "transactions"),
        attendance: ref(database, "attendance"),
      };
    }

    console.log("✅ Firebase initialized successfully (server-side)")
    return database
  } catch (error) {
    console.error("❌ Failed to initialize Firebase (server-side):", error)
    database = null
    dbRefs = null
    firebaseInitialized = false
    return null
  }
}

// Initialize Firebase with network checking and retry logic
if (typeof window !== "undefined") {
  // Use requestIdleCallback for better performance
  if ('requestIdleCallback' in window) {
    requestIdleCallback(() => {
      initializeFirebaseWithRetry();
    }, { timeout: 2000 });
  } else {
    // Fallback for browsers without requestIdleCallback
    setTimeout(() => {
      initializeFirebaseWithRetry();
    }, 100);
  }
  
  // Listen for online events to retry connection
  window.addEventListener('online', () => {
    console.log("🌐 Network came back online, reinitializing Firebase");
    if (!isFirebaseConfigured()) {
      initializeFirebaseWithRetry();
    }
  });
  
} else {
  // Initialize on server side for API routes
  initializeFirebaseServer()
}

// Export a function to ensure database is available
export const ensureFirebaseInitialized = () => {
  if (!database && typeof window === "undefined") {
    // If we're on server side and database is not initialized, try to initialize
    return initializeFirebaseServer()
  }
  return database
}

// Export initialization functions for explicit control
export { initializeFirebaseServer }

// Database references are initialized in the initializeFirebase function above

// Helper functions for common operations with error handling
export const firebaseHelpers = {
  // Add new inventory item
  addInventoryItem: async (item: any) => {
    if (!database || !dbRefs || !dbRefs.inventory) {
      console.error("Firebase not available or inventory ref not initialized for addInventoryItem");
      throw new Error("Firebase not available - using local storage or operation failed");
    }

    try {
      const newItemRef = push(dbRefs.inventory);
      await set(newItemRef, {
        ...item,
        id: newItemRef.key, // Store the generated key as id
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return newItemRef.key;
    } catch (error) {
      console.error("Error adding inventory item:", error);
      throw error;
    }
  },

  updateInventoryItem: async (id: string, updates: Partial<any>) => { // Menggunakan Partial<InventoryItem> jika interface InventoryItem tersedia di sini
    if (!database) {
      console.error("Firebase database not available for updateInventoryItem");
      throw new Error("Firebase not available - operation failed");
    }
    try {
      const itemRef = ref(database, `inventory/${id}`);
      await update(itemRef, { // Menggunakan update untuk partial update
        ...updates,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error("Error updating inventory item:", error);
      throw error;
    }
  },

  // Add scan record
  addScanRecord: async (scanData: any) => {
    if (!database || !dbRefs || !dbRefs.scans) {
      console.error("Firebase not available or scans ref not initialized for addScanRecord");
      throw new Error("Firebase not available - using local storage or operation failed");
    }

    try {
      const newScanRef = push(dbRefs.scans);
      await set(newScanRef, {
        ...scanData,
        id: newScanRef.key,
        timestamp: serverTimestamp(),
        processed: false, // Default value
      });
      return newScanRef.key;
    } catch (error) {
      console.error("Error adding scan record:", error);
      throw error;
    }
  },

  // Update device status
  updateDeviceStatus: async (deviceId: string, status: any) => {
    if (!database) { // dbRefs.devices might not be directly needed
      console.error("Firebase database not available for updateDeviceStatus");
      throw new Error("Firebase not available - using local storage or operation failed");
    }

    try {
      const deviceRef = ref(database, `devices/${deviceId}`);
      await set(deviceRef, {
        ...status,
        lastSeen: serverTimestamp(),
      }); // Firebase Realtime Database set() only accepts 2 arguments
    } catch (error) {
      console.error("Error updating device status:", error);
      throw error;
    }
  },

  // Add analytics data
  addAnalytics: async (type: string, data: any) => {
    if (!database || !dbRefs || !dbRefs.analytics) {
      console.error("Firebase not available or analytics ref not initialized for addAnalytics");
      throw new Error("Firebase not available - using local storage or operation failed");
    }

    try {
      const analyticsTypeRef = ref(database, `analytics/${type}`);
      const newEntryRef = push(analyticsTypeRef);
      await set(newEntryRef, {
        ...data,
        timestamp: serverTimestamp(),
      });
    } catch (error) {
      console.error("Error adding analytics data:", error);
      throw error;
    }
  },

  addTransaction: async (transactionData: any) => {
    if (!database || !dbRefs || !dbRefs.transactions) {
      console.error("Firebase not available or transactions ref not initialized for addTransaction");
      throw new Error("Firebase not available - operation failed");
    }
    try {
      const newTransactionRef = push(dbRefs.transactions);
      await set(newTransactionRef, {
        ...transactionData,
        id: newTransactionRef.key, // Simpan ID yang digenerate Firebase
        timestamp: serverTimestamp(),
      });
      return newTransactionRef.key;
    } catch (error) {
      console.error("Error adding transaction:", error);
      throw error;
    }
  },
}

// Firebase cleanup utility for proper listener cleanup
export class FirebaseCleanup {
  private listeners: Array<() => void> = [];
  
  addListener(unsubscribe: () => void) {
    this.listeners.push(unsubscribe);
  }
  
  cleanup() {
    console.log('🔥 Cleaning up Firebase listeners...', this.listeners.length);
    this.listeners.forEach(unsubscribe => {
      try {
        unsubscribe();
      } catch (error) {
        console.warn('Error cleaning up Firebase listener:', error);
      }
    });
    this.listeners = [];
  }
}

// Global cleanup instance
export const firebaseCleanup = new FirebaseCleanup();

// Auto-cleanup when page lifecycle events occur
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    console.log('🔥 Page hiding, cleaning up Firebase connections...');
    firebaseCleanup.cleanup();
  });
  
  window.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      console.log('🔥 Page hidden, cleaning up Firebase connections...');
      firebaseCleanup.cleanup();
    }
  });
}

// Check if Firebase is properly configured and available
export const isFirebaseConfigured = () => {
  // firebaseInitialized is key here, as it's set only after successful client-side init
  return (
    typeof window !== "undefined" &&
    firebaseInitialized &&
    !!app && // Check if app object exists
    !!database && // Check if database object exists
    firebaseConfig.apiKey &&
    firebaseConfig.authDomain &&
    firebaseConfig.databaseURL &&
    firebaseConfig.projectId
  );
}

// Get Firebase status
export const getFirebaseStatus = () => {
  const configured = !!(firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.databaseURL && firebaseConfig.projectId);
  return {
    initialized: firebaseInitialized,
    // available implies initialized and database object exists
    available: firebaseInitialized && !!database,
    configured: configured,
    hasValidConfig: !!firebaseConfig.databaseURL, // This check might be redundant if 'configured' is true
    databaseUrl: firebaseConfig.databaseURL,
  }
}
