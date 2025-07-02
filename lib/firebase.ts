import { initializeApp, getApps, FirebaseApp } from "firebase/app"
import { getDatabase, ref, push, set, update, serverTimestamp, connectDatabaseEmulator, Database, DatabaseReference } from "firebase/database" // Added update
import { getAuth, Auth } from "firebase/auth"
import { authenticateUser } from "./auth"

// Firebase configuration - using environment variables for security
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL || "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || "",
}

// Validasi konfigurasi Firebase untuk keamanan
const validateFirebaseConfig = () => {
  const requiredFields: (keyof typeof firebaseConfig)[] = [
    'apiKey', 'authDomain', 'databaseURL', 'projectId', 
    'storageBucket', 'messagingSenderId', 'appId'
  ];
  
  const missingFields = requiredFields.filter(field => !firebaseConfig[field]);
  
  if (missingFields.length > 0) {
    console.error('❌ Firebase configuration incomplete. Missing fields:', missingFields);
    console.error('💡 Please check your environment variables (Netlify for production, .env.local for local development) and ensure all required variables are set.');
    return false;
  }
  
  // Validasi format API key
  if (!firebaseConfig.apiKey.startsWith('AIza')) {
    console.error('❌ Invalid Firebase API key format');
    return false;
  }
  
  // Validasi domain
  if (!firebaseConfig.authDomain.includes('firebaseapp.com')) {
    console.error('❌ Invalid Firebase auth domain');
    return false;
  }
  
  console.log('✅ Firebase configuration validated successfully');
  return true;
};

// Initialize Firebase with error handling
let app: FirebaseApp | null = null // Use FirebaseApp type
export let database: Database | null = null
export let auth: Auth | null = null // Use Auth type and export it
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


// Initialize Firebase immediately on client-side
if (typeof window !== "undefined") {
  // Initialize immediately when the module loads (moved to bottom after function declaration)
  console.log("🔥 Preparing to initialize Firebase...");
}

// Initialize Firebase immediately on client side
const initializeFirebase = () => {
  if (typeof window === "undefined") {
    return // Don't initialize on server side
  }

  // Skip if already initialized
  if (firebaseInitialized) {
    return;
  }

  // Validasi konfigurasi sebelum inisialisasi
  if (!validateFirebaseConfig()) {
    console.error('🔥 Firebase initialization aborted due to invalid configuration');
    return;
  }

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
        transactions: ref(database, "transactions"),
        attendance: ref(database, "attendance"),
      };
    }

    // Connect to emulator in development if needed
    if (process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === "true") {
      try {
        if (database) {
          connectDatabaseEmulator(database, "localhost", 9000)
        }
      } catch (emulatorError) {
        console.warn("Firebase emulator connection failed:", emulatorError)
      }
    }

    console.log("✅ Firebase initialized successfully")
  } catch (error) {
    console.error("❌ Firebase initialization failed:", error)
    firebaseInitialized = false
    database = null
    auth = null
    dbRefs = null
    throw error
  }
}

// Server-side Firebase initialization
const initializeFirebaseServer = () => {
  try {
    // Validate configuration before server-side initialization
    if (!validateFirebaseConfig()) {
      console.error('🔥 Server-side Firebase initialization aborted due to invalid configuration');
      return null;
    }

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
  // Initialize Firebase immediately
  try {
    initializeFirebase();
  } catch (error) {
    console.error("🔥 Failed to initialize Firebase:", error);
  }
  
  // Listen for online events to retry connection
  window.addEventListener('online', () => {
    console.log("🌐 Network came back online, reinitializing Firebase");
    if (!isFirebaseConfigured()) {
      try {
        initializeFirebase();
      } catch (error) {
        console.error("🔥 Failed to reinitialize Firebase:", error);
      }
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
    // But only if we have valid configuration
    const hasValidConfig = !!(
      firebaseConfig.apiKey && 
      firebaseConfig.authDomain && 
      firebaseConfig.databaseURL && 
      firebaseConfig.projectId
    );
    
    if (hasValidConfig) {
      return initializeFirebaseServer()
    } else {
      console.warn('🔥 Firebase configuration not available, skipping initialization');
      return null;
    }
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

    // Check authentication
    if (!auth?.currentUser) {
      console.error("User not authenticated for addInventoryItem");
      throw new Error("Authentication required");
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

    // Check authentication
    if (!auth?.currentUser) {
      console.error("User not authenticated for updateInventoryItem");
      throw new Error("Authentication required");
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

    // Check authentication
    if (!auth?.currentUser) {
      console.error("User not authenticated for addScanRecord");
      throw new Error("Authentication required");
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

    // Check authentication
    if (!auth?.currentUser) {
      console.error("User not authenticated for updateDeviceStatus");
      throw new Error("Authentication required");
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

    // Check authentication
    if (!auth?.currentUser) {
      console.error("User not authenticated for addAnalytics");
      throw new Error("Authentication required");
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

    // Check authentication
    if (!auth?.currentUser) {
      console.error("User not authenticated for addTransaction");
      throw new Error("Authentication required");
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
