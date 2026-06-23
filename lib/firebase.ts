import { initializeApp, getApps, FirebaseApp } from "firebase/app"
import { getDatabase, ref, push, set, update, serverTimestamp, connectDatabaseEmulator, Database, DatabaseReference, increment, get } from "firebase/database"
import { initializeFirebaseErrorHandling } from "./firebase-error-suppressor" // Use new enhanced error suppressor
import type { Auth } from "firebase/auth"
import type { InventoryItem, ScanRecord, DeviceStatus } from "@/hooks/use-firebase"
// Input types: omit fields generated server-side by the helper function itself.
export type AddInventoryInput = Omit<InventoryItem, "id" | "createdAt" | "updatedAt" | "lastUpdated" | "deleted">
export type UpdateInventoryInput = Partial<Omit<InventoryItem, "id" | "createdAt" | "updatedAt" | "lastUpdated" | "quantity">>
export type AddScanInput = Omit<ScanRecord, "id" | "timestamp" | "processed"> & {
  timestamp?: number | object
  processed?: boolean
  mode?: string
  type?: string
}
export type AddTransactionInput = {
  type: "in" | "out" | "adjustment"
  productName?: string
  productBarcode?: string
  quantity: number
  reason: string
  operator: string
  notes?: string
}
export type UpdateDeviceInput = Partial<Omit<DeviceStatus, "deviceId" | "lastSeen">>

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
let auth: Auth | null = null // Auth will be lazy loaded
let firebaseInitialized = false

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

// Network connectivity checker — uses navigator.onLine only.
// Firebase SDK handles reconnection internally; fetching google.com/favicon.ico
// added 1-5s latency on every cold start for no benefit.
const checkNetworkConnectivity = (): boolean => {
  if (typeof window === "undefined") return true
  return navigator.onLine !== false
}

// Synchronous Firebase initialization — no network fetch, no async delay.
// Firebase SDK handles offline/reconnect internally.
let initInProgress = false;
const initializeFirebaseSync = (): void => {
  if (firebaseInitialized) return
  if (initInProgress) return
  initInProgress = true

  if (!checkNetworkConnectivity()) {
    // offline
    initInProgress = false
    return
  }

  try {
    initializeFirebase()
    initInProgress = false
  } catch (error) {
    console.error("🔥 Firebase initialization failed:", error)
    initInProgress = false
  }
}

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
    
    // Firebase SDK handles reconnection internally.
    // No-op onValue subscriber was removed — leaked Unsubscribe.

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

    // initialized
    
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

    // initialized
    return database
  } catch (error) {
    console.error("❌ Failed to initialize Firebase (server-side):", error)
    database = null
    dbRefs = null
    firebaseInitialized = false
    return null
  }
}

// Initialize Firebase synchronously for instant startup
if (typeof window !== "undefined") {
  initializeFirebaseSync();

  // Listen for online events to retry connection
  window.addEventListener('online', () => {
    // online reinit;
    if (!isFirebaseConfigured()) {
      initializeFirebaseSync();
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

export const getFirebaseApp = (): FirebaseApp => {
  if (!app) {
    if (typeof window === "undefined") initializeFirebaseServer()
    else initializeFirebase()
  }
  if (!app) throw new Error("Firebase app not initialized")
  return app
}

// Database references are initialized in the initializeFirebase function above

const createOperationId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID()
  return `op_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`
}

const getMutationActor = async () => {
  const authInstance = await getFirebaseAuth()
  const user = authInstance.currentUser
  if (!user) throw new Error("Authentication required")
  const token = await user.getIdTokenResult()
  const role = token.claims.role
  if (role !== "admin" && role !== "operator") throw new Error("Insufficient role")
  return { uid: user.uid, role }
}

// Helper functions for common operations with error handling
export const firebaseHelpers = {
  createOperationId,
  getMutationActor,

  // Add new inventory item
  addInventoryItem: async (item: AddInventoryInput, source: "Dashboard" | "Scanner" = "Dashboard") => {
    if (!database || !dbRefs || !dbRefs.inventory) {
      console.error("Firebase not available or inventory ref not initialized for addInventoryItem");
      throw new Error("Firebase not available - using local storage or operation failed");
    }

    try {
      const actor = await getMutationActor()
      const operationId = createOperationId()
      const newItemRef = push(dbRefs.inventory);
      const updates: Record<string, unknown> = {}
      updates[`inventory/${newItemRef.key}`] = {
        ...item,
        id: newItemRef.key, // Store the generated key as id
        operationId,
        updatedByUid: actor.uid,
        lastUpdated: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }
      const initialQuantity = Math.max(0, Number(item.quantity) || 0)
      if (initialQuantity > 0) {
        const newTxRef = push(dbRefs.transactions)
        updates[`transactions/${newTxRef.key}`] = {
          id: newTxRef.key,
          type: "in",
          productName: item.name,
          productBarcode: item.barcode || "",
          quantity: initialQuantity,
          reason: "Stok awal produk baru",
          operator: source,
          operatorUid: actor.uid,
          operationId,
          timestamp: serverTimestamp(),
          notes: source === "Scanner" ? "Produk dibuat dari scan ESP32" : "Produk dibuat dari dashboard",
        }
      }
      await update(ref(database), updates)
      return newItemRef.key;
    } catch (error) {
      console.error("Error adding inventory item:", error);
      throw error;
    }
  },

  updateInventoryItem: async (
    id: string,
    updates: UpdateInventoryInput,
    operationId = createOperationId(),
  ) => {
    if (!database) {
      console.error("Firebase database not available for updateInventoryItem");
      throw new Error("Firebase not available - operation failed");
    }
    try {
      const actor = await getMutationActor()
      const itemRef = ref(database, `inventory/${id}`);
      await update(itemRef, {
        ...updates,
        operationId,
        updatedByUid: actor.uid,
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
    transactionData?: AddTransactionInput,
    suppliedOperationId?: string,
  ) => {
    if (!Number.isFinite(delta) || delta === 0) {
      throw new Error("Invalid stock adjustment delta");
    }
    if (!database || !dbRefs) {
      console.error("Firebase not available for adjustStock");
      throw new Error("Firebase not available - operation failed");
    }
    try {
      const actor = await getMutationActor()
      const operationId = suppliedOperationId || createOperationId()
      const updates: Record<string, unknown> = {
        [`inventory/${itemId}/quantity`]: increment(delta),
        [`inventory/${itemId}/operationId`]: operationId,
        [`inventory/${itemId}/updatedByUid`]: actor.uid,
        [`inventory/${itemId}/lastUpdated`]: Date.now(),
        [`inventory/${itemId}/updatedAt`]: serverTimestamp(),
      };

      if (transactionData) {
        const newTxRef = push(dbRefs.transactions);
        updates[`transactions/${newTxRef.key}`] = {
          ...transactionData,
          id: newTxRef.key,
          operationId,
          operatorUid: actor.uid,
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
  addScanRecord: async (scanData: AddScanInput) => {
    if (!database || !dbRefs || !dbRefs.scans) {
      console.error("Firebase not available or scans ref not initialized for addScanRecord");
      throw new Error("Firebase not available - using local storage or operation failed");
    }

    try {
      const actor = await getMutationActor()
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
        operatorUid: actor.uid,
      };
      
      await set(newScanRef, esp32CompatibleData);
      /* scan record */
      return newScanRef.key;
    } catch (error) {
      console.error("Error adding scan record:", error);
      throw error;
    }
  },

  markScanProcessed: async (scanId: string, processedData: Record<string, unknown> = {}) => {
    if (!database) throw new Error("Firebase not available - operation failed")
    const actor = await getMutationActor()
    await update(ref(database, `scans/${scanId}`), {
      ...processedData,
      processed: true,
      processedAt: serverTimestamp(),
      processedByUid: actor.uid,
      operationId: createOperationId(),
    })
  },

  // Tulis status lookup produk Honda ke /deviceLookupStatus/{deviceId} agar
  // firmware ESP32 bisa membaca hasil pencarian dan menampilkannya di OLED.
  updateDeviceLookupStatus: async (deviceId: string, payload: {
    scanId: string
    barcode: string
    status: "searching" | "found" | "not_found" | "failed"
    name?: string
    category?: string
    message?: string
  }) => {
    if (!database) return
    try {
      const authInstance = await getFirebaseAuth()
      const user = authInstance.currentUser
      if (!user) return
      await set(ref(database, `deviceLookupStatus/${deviceId}`), {
        ...payload,
        updatedByUid: user.uid,
        updatedAt: Date.now(),
      })
    } catch (e) {
      console.warn("[lookup] deviceLookupStatus write skipped:", e)
    }
  },

  // Update device status
  updateDeviceStatus: async (deviceId: string, status: UpdateDeviceInput) => {
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
  addAnalytics: async (type: string, data: Record<string, unknown>) => {
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

  // One-time fetch of all transactions — uses get() not onValue().
  // Prediction needs the full history; do NOT subscribe to everything.
  fetchAllTransactions: async () => {
    if (!database || !dbRefs || !dbRefs.transactions) throw new Error("Firebase not available")
    const allQuery = ref(database, "transactions") // orderByChild("timestamp") — skip ordering, faster
    const snapshot = await get(allQuery)
    const data = snapshot.val()
    if (!data) return []
    return Object.keys(data).map((key) => ({ ...data[key], id: key }))
  },

  addTransaction: async (transactionData: AddTransactionInput) => {
    if (!database || !dbRefs || !dbRefs.transactions) {
      console.error("Firebase not available or transactions ref not initialized for addTransaction");
      throw new Error("Firebase not available - operation failed");
    }
    try {
      const actor = await getMutationActor()
      const newTransactionRef = push(dbRefs.transactions);
      await set(newTransactionRef, {
        ...transactionData,
        id: newTransactionRef.key, // Simpan ID yang digenerate Firebase
        operationId: createOperationId(),
        operatorUid: actor.uid,
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
    // cleanup:, this.listeners.length);
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
    // page hide;
    firebaseCleanup.cleanup();
  });
}

// Function to check if Firebase is properly configured and initialized
export const isFirebaseConfigured = (): boolean => {
  return firebaseInitialized && database !== null && dbRefs !== null;
};

// Function to wait for Firebase to be ready
// With synchronous init, this resolves immediately if configured.
// Keeps the polling fallback for edge cases (e.g. online event re-init).
export const waitForFirebaseReady = (timeout: number = 5000): Promise<boolean> => {
  return new Promise((resolve) => {
    if (!validateFirebaseConfig(false)) {
      resolve(false);
      return;
    }

    // Try sync init if not yet done
    if (typeof window !== "undefined" && !isFirebaseConfigured()) {
      initializeFirebaseSync()
    }

    if (isFirebaseConfigured()) {
      resolve(true);
      return;
    }

    const checkInterval = 50; // ponytail: reduced from 100ms; upgrade to event-driven if needed
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

// Lazy load Firebase Auth only when needed (saves ~55KB on cold bundle),
// but prefetch it in parallel at module load so the dynamic import resolves
// before AuthProvider calls getFirebaseAuth(). Removes the ~200ms import
// latency from the critical auth-init path without bloating the main bundle.
export const getFirebaseAuth = async (): Promise<Auth> => {
  if (!app) initializeFirebase()
  if (!app) throw new Error("Firebase app not initialized")

  if (!auth) {
    const {
      browserLocalPersistence,
      getAuth: getAuthModule,
      setPersistence,
    } = await import("firebase/auth")
    auth = getAuthModule(app)
    await setPersistence(auth, browserLocalPersistence)
    // auth loaded
  }

  return auth;
};

// Prefetch auth module in parallel on the client — fire and forget.
// By the time any auth call runs, the import is already resolved.
if (typeof window !== "undefined" && validateFirebaseConfig(false)) {
  void getFirebaseAuth().catch(() => { /* surfaced by caller */ })
}

// Export auth functions that lazy-load the auth module
export const firebaseAuth = {
  signIn: async (email: string, password: string) => {
    const authInstance = await getFirebaseAuth();
    const { signInWithEmailAndPassword } = await import("firebase/auth");
    return signInWithEmailAndPassword(authInstance, email, password);
  },

  sendPasswordReset: async (email: string) => {
    const authInstance = await getFirebaseAuth()
    const { sendPasswordResetEmail } = await import("firebase/auth")
    return sendPasswordResetEmail(authInstance, email)
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
