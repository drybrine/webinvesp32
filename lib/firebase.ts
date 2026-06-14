import { initializeApp, getApps, FirebaseApp } from "firebase/app"
import { getDatabase, ref, push, set, update, serverTimestamp, connectDatabaseEmulator, Database, DatabaseReference, onValue, increment } from "firebase/database" // Added update, onValue, increment
import { initializeConnectionMonitor } from "./firebase-connection-monitor"
import { initializeFirebaseErrorHandling } from "./firebase-error-suppressor" // Use new enhanced error suppressor

// Firebase configuration from environment variables
// These values are loaded from .env file for security
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

let firebaseConfigWarningShown = false

// Validasi konfigurasi Firebase untuk keamanan
const validateFirebaseConfig = (logIssues = true) => {
  const requiredFields: (keyof typeof firebaseConfig)[] = [
    'apiKey', 'authDomain', 'databaseURL', 'projectId', 
    'storageBucket', 'messagingSenderId', 'appId'
  ];
  
  const missingFields = requiredFields.filter(field => !firebaseConfig[field]);
  
  if (missingFields.length > 0) {
    if (logIssues && !firebaseConfigWarningShown) {
      firebaseConfigWarningShown = true
      console.error('❌ Firebase configuration incomplete. Missing fields:', missingFields);
      console.error('💡 Please check your .env file and ensure all required environment variables are set.');
      console.error('💡 Required environment variables:');
      console.error('   - NEXT_PUBLIC_FIREBASE_API_KEY');
      console.error('   - NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN');
      console.error('   - NEXT_PUBLIC_FIREBASE_DATABASE_URL');
      console.error('   - NEXT_PUBLIC_FIREBASE_PROJECT_ID');
      console.error('   - NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET');
      console.error('   - NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID');
      console.error('   - NEXT_PUBLIC_FIREBASE_APP_ID');
    }
    return false;
  }
  
  // Validasi format API key
  if (firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith('AIza')) {
    if (logIssues && !firebaseConfigWarningShown) {
      firebaseConfigWarningShown = true
      console.error('❌ Invalid Firebase API key format');
    }
    return false;
  }
  
  // Validasi domain
  if (firebaseConfig.authDomain && !firebaseConfig.authDomain.includes('firebaseapp.com')) {
    if (logIssues && !firebaseConfigWarningShown) {
      firebaseConfigWarningShown = true
      console.error('❌ Invalid Firebase auth domain');
    }
    return false;
  }
  
  return true;
};

// Initialize Firebase with error handling
let app: FirebaseApp | null = null // Use FirebaseApp type
export let database: Database | null = null
let auth: any = null // Auth will be lazy loaded
let firebaseInitialized = false
let connectionListenerRegistered = false
let connectionMonitorRegistered = false

// Define a type for dbRefs
interface DbRefs {
  inventory: DatabaseReference;
  scans: DatabaseReference;
  devices: DatabaseReference;
  settings: DatabaseReference;
  analytics: DatabaseReference;
  transactions: DatabaseReference; // Ditambahkan
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
let initInProgress = false;
const initializeFirebaseWithRetry = async (retryCount = 0): Promise<void> => {
  const maxRetries = 3;

  // Guard against concurrent retry chains (initial load + 'online' event).
  // Already initialized → nothing to do.
  if (firebaseInitialized) {
    return;
  }
  // Another chain is mid-flight → don't start a second one.
  if (initInProgress && retryCount === 0) {
    return;
  }

  if (retryCount > maxRetries) {
    console.warn("🔥 Max retries reached for Firebase initialization");
    initInProgress = false;
    return;
  }

  initInProgress = true;

  // Check network connectivity first
  const hasConnectivity = await checkNetworkConnectivity();
  if (!hasConnectivity && retryCount < maxRetries) {
    console.log(`🔥 No network connectivity, retrying in ${(retryCount + 1) * 2}s...`);
    setTimeout(() => initializeFirebaseWithRetry(retryCount + 1), (retryCount + 1) * 2000);
    return;
  }

  try {
    initializeFirebase();
    initInProgress = false;
    console.log("🔥 Firebase initialized successfully with network check");
  } catch (error) {
    console.error("🔥 Firebase initialization failed:", error);
    if (retryCount < maxRetries) {
      setTimeout(() => initializeFirebaseWithRetry(retryCount + 1), (retryCount + 1) * 2000);
    } else {
      initInProgress = false;
    }
  }
};

// Only initialize Firebase on the client side
const initializeFirebase = () => {
  if (typeof window === "undefined") {
    return // Don't initialize on server side
  }

  // Validasi konfigurasi sebelum inisialisasi
  if (!validateFirebaseConfig()) {
    console.error('🔥 Firebase initialization aborted due to invalid configuration');
    return;
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
    // Initialize database with connection retry mechanism
    database = getDatabase(app)
    // Don't initialize auth unless explicitly needed - saves ~55KB
    // auth = getAuth(app)
    
    // Add connection monitoring for WebSocket issues (register only once)
    if (database && !connectionListenerRegistered) {
      connectionListenerRegistered = true
      const connectedRef = ref(database, '.info/connected')
      onValue(connectedRef, (snapshot) => {
        const connected = snapshot.val()
        if (connected) {
          console.log('🔥 Firebase WebSocket connected successfully')
        } else {
          console.info('🔄 Firebase WebSocket disconnected, will retry automatically')
        }
      }, (error) => {
        // Silently handle connection monitoring errors
        console.info('🔄 Firebase connection monitoring: will retry automatically')
      })
    }
    
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

    // Initialize connection monitoring for WebSocket issues (register only once)
    if (typeof window !== "undefined" && database && !connectionMonitorRegistered) {
      connectionMonitorRegistered = true
      try {
        initializeConnectionMonitor(database)
        console.log("🔍 Firebase connection monitoring initialized")
      } catch (monitorError) {
        console.warn("⚠️ Could not initialize connection monitoring:", monitorError)
      }
    }

    console.log("✅ Firebase initialized successfully")
    
    // Initialize enhanced error handling for WebSocket and deprecated APIs
    if (typeof window !== 'undefined') {
      initializeFirebaseErrorHandling();
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
    if (!validateFirebaseConfig(false)) {
      database = null
      dbRefs = null
      firebaseInitialized = false
      return null
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
  // Initialize immediately for better UX on dashboard
  initializeFirebaseWithRetry();
  
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
      await update(itemRef, {
        ...updates,
        lastUpdated: Date.now(),  // rules check lastUpdated, not updatedAt
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error("Error updating inventory item:", error);
      throw error;
    }
  },

  // Atomic stock adjustment — uses server-side increment to avoid lost updates
  // from concurrent read-modify-write (dashboard + scanner + multiple tabs).
  // Optionally records a transaction in the SAME atomic multi-path update so
  // stock and ledger can never diverge. Pass delta (negative for stock out).
  adjustStock: async (
    itemId: string,
    delta: number,
    transactionData?: Record<string, any>,
  ) => {
    if (!Number.isFinite(delta) || delta === 0) {
      throw new Error("Invalid stock adjustment delta");
    }
    if (!database || !dbRefs) {
      console.error("Firebase not available for adjustStock");
      throw new Error("Firebase not available - operation failed");
    }
    try {
      const updates: Record<string, any> = {
        [`inventory/${itemId}/quantity`]: increment(delta),
        [`inventory/${itemId}/lastUpdated`]: Date.now(),
        [`inventory/${itemId}/updatedAt`]: serverTimestamp(),
      };

      if (transactionData) {
        const newTxRef = push(dbRefs.transactions);
        updates[`transactions/${newTxRef.key}`] = {
          ...transactionData,
          id: newTxRef.key,
          timestamp: serverTimestamp(),
        };
      }

      // Single atomic multi-path update at the root
      await update(ref(database), updates);
    } catch (error) {
      console.error("Error adjusting stock:", error);
      throw error;
    }
  },

  // Add scan record (matching ESP32 .ino structure exactly)
  addScanRecord: async (scanData: any) => {
    if (!database || !dbRefs || !dbRefs.scans) {
      console.error("Firebase not available or scans ref not initialized for addScanRecord");
      throw new Error("Firebase not available - using local storage or operation failed");
    }

    try {
      const newScanRef = push(dbRefs.scans);
      
      // Create data structure matching ESP32 .ino exactly
      const esp32CompatibleData = {
        ...scanData,
        id: newScanRef.key,
        timestamp: scanData.timestamp || serverTimestamp(),
        processed: scanData.processed !== undefined ? scanData.processed : false, // Match ESP32 default
        location: scanData.location || "Warehouse-Scanner", // Match ESP32 default location
        mode: scanData.mode || "inventory", // Match ESP32 default mode
        type: scanData.type || "inventory_scan", // Match ESP32 default type
      };
      
      await set(newScanRef, esp32CompatibleData);
      console.log("✅ Scan record added with ESP32 compatible structure:", esp32CompatibleData);
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
      // Use update() not set() — set() replaces the entire node and would wipe
      // fields written concurrently by the ESP32 (scanCount, batteryLevel, rssi).
      await update(deviceRef, {
        ...status,
        lastSeen: serverTimestamp(),
      });
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
}

// Function to check if Firebase is properly configured and initialized
export const isFirebaseConfigured = (): boolean => {
  return firebaseInitialized && database !== null && dbRefs !== null;
};

// Function to wait for Firebase to be ready
export const waitForFirebaseReady = (timeout: number = 5000): Promise<boolean> => {
  return new Promise((resolve) => {
    if (!validateFirebaseConfig(false)) {
      resolve(false);
      return;
    }

    if (isFirebaseConfigured()) {
      resolve(true);
      return;
    }
    
    const checkInterval = 100;
    let elapsed = 0;
    
    const interval = setInterval(() => {
      elapsed += checkInterval;
      
      if (isFirebaseConfigured()) {
        clearInterval(interval);
        resolve(true);
      } else if (elapsed >= timeout) {
        clearInterval(interval);
        resolve(false);
      }
    }, checkInterval);
  });
};

// Firebase connection status
export const getFirebaseStatus = () => {
  return {
    initialized: firebaseInitialized,
    hasDatabase: database !== null,
    hasRefs: dbRefs !== null,
    isConfigured: isFirebaseConfigured(),
    hasValidConfig: validateFirebaseConfig(false),
    databaseUrl: firebaseConfig.databaseURL,
  };
};

// Lazy load Firebase Auth only when needed (saves ~55KB)
export const getFirebaseAuth = async () => {
  if (!app) {
    throw new Error("Firebase app not initialized");
  }
  
  if (!auth) {
    // Dynamically import Firebase Auth only when needed
    const { getAuth: getAuthModule } = await import("firebase/auth");
    auth = getAuthModule(app);
    console.log("🔐 Firebase Auth loaded on demand");
  }
  
  return auth;
};

// Export auth functions that lazy-load the auth module
export const firebaseAuth = {
  // Sign in function (example)
  signIn: async (email: string, password: string) => {
    const authInstance = await getFirebaseAuth();
    const { signInWithEmailAndPassword } = await import("firebase/auth");
    return signInWithEmailAndPassword(authInstance, email, password);
  },
  
  // Sign out function (example)
  signOut: async () => {
    const authInstance = await getFirebaseAuth();
    const { signOut } = await import("firebase/auth");
    return signOut(authInstance);
  },
  
  // Get current user
  getCurrentUser: async () => {
    const authInstance = await getFirebaseAuth();
    return authInstance.currentUser;
  },
  
  // Auth state observer
  onAuthStateChanged: async (callback: (user: any) => void) => {
    const authInstance = await getFirebaseAuth();
    const { onAuthStateChanged } = await import("firebase/auth");
    return onAuthStateChanged(authInstance, callback);
  }
};
