"use client"

import { useState, useEffect, useMemo } from "react"; // Add useMemo
import { ref, onValue, DataSnapshot, query, orderByChild, limitToLast, Unsubscribe } from "firebase/database";
import { firebaseHelpers, isFirebaseConfigured, database, dbRefs, firebaseCleanup, waitForFirebaseReady } from "@/lib/firebase"; // Ensure all are imported

export interface InventoryItem {
  id: string
  name: string
  category: string
  quantity: number
  minStock: number
  description: string
  location: string
  barcode?: string
  supplier?: string
  createdAt: any
  updatedAt: any
  lastUpdated: any
  deleted?: boolean
}

export interface ScanRecord {
  id: string
  barcode: string
  deviceId: string
  timestamp: any
  processed: boolean
  itemFound?: boolean
  itemId?: string
  location?: string
}

export interface DeviceStatus {
  deviceId: string
  status: "online" | "offline"
  ipAddress: string
  lastSeen: any
  scanCount: number
  freeHeap?: number
}

// Definisikan interface Transaction jika belum ada secara global
// (Struktur disesuaikan dengan yang ada di app/transaksi/page.tsx)
interface Transaction {
  id: string;
  type: "in" | "out" | "adjustment";
  productName: string;
  productBarcode: string;
  quantity: number; // Bisa positif (in) atau negatif (out)
  reason: string;
  operator: string;
  timestamp: any; // Sebaiknya number (epoch) atau string ISO
  notes?: string;
}

export function useFirebaseInventory() {
  const [itemsData, setItemsData] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let unsubscribe: Unsubscribe | undefined;
    let cancelled = false;

    if (typeof window === "undefined") {
      setLoading(false);
      return;
    }

    const initializeInventory = async () => {
      // Wait for Firebase to be ready before proceeding
      const firebaseReady = await waitForFirebaseReady(5000);

      if (cancelled) return;

      if (!firebaseReady || !isFirebaseConfigured() || !database) {
        setItemsData([]);
        setError("Firebase tidak tersedia. Data cache lokal dinonaktifkan untuk keamanan.");
        setLoading(false);
        return;
      }

      try {
        const inventoryRef = query(ref(database, "inventory"), orderByChild("lastUpdated"));
        unsubscribe = onValue(
          inventoryRef,
          (snapshot: DataSnapshot) => {
            try {
              const data = snapshot.val();
              const loadedItems: InventoryItem[] = data
                ? Object.keys(data).map((key) => ({ ...data[key], id: key }))
                : [];
              setItemsData(loadedItems);
              setError(null);
            } catch (err: any) {
              console.error("Error processing inventory snapshot:", err);
              setError(err.message || "Failed to parse inventory data");
            }
            setLoading(false);
          },
          (err) => {
            console.error("Firebase inventory error:", err);
            setError(err.message);
            setLoading(false);
          }
        );

        // If the effect was cleaned up while we awaited, unsubscribe immediately
        if (cancelled && unsubscribe) {
          unsubscribe();
          return;
        }

        // Register listener for global cleanup
        if (unsubscribe) {
          firebaseCleanup.addListener(unsubscribe);
        }
      } catch (err: any) {
        console.error("Error setting up inventory listener:", err);
        setError(err.message || "Failed to setup inventory listener");
        setLoading(false);
      }
    };

    initializeInventory();

    return () => {
      cancelled = true;
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);

  const addItem = async (
    item: Omit<InventoryItem, "id" | "createdAt" | "updatedAt">,
    source: "Dashboard" | "Scanner" = "Dashboard",
  ): Promise<string | undefined> => {
    if (!isFirebaseConfigured()) {
      throw new Error("Firebase tidak tersedia")
    }

    try {
      return await firebaseHelpers.addInventoryItem(item, source);
    } catch (err) {
      console.error("Error adding item:", err);
      const message = err instanceof Error ? err.message : "Failed to add item";
      throw new Error(message);
    }
  };

  const updateItem = async (id: string, updates: Partial<InventoryItem>, operationId?: string) => {
    if (!isFirebaseConfigured()) {
      throw new Error("Firebase tidak tersedia")
    }

    try {
      await firebaseHelpers.updateInventoryItem(id, updates, operationId);
    } catch (err) {
      console.error("Error updating item:", err);
      const message = err instanceof Error ? err.message : "Failed to update item";
      throw new Error(message);
    }
  };

  const deleteItem = async (id: string) => {
    if (!isFirebaseConfigured()) {
      throw new Error("Firebase tidak tersedia")
    }

    try {
      await firebaseHelpers.updateInventoryItem(id, { deleted: true });
    } catch (err) {
      console.error("Error deleting item:", err);
      const message = err instanceof Error ? err.message : "Failed to delete item";
      throw new Error(message);
    }
  };

  const activeItems = useMemo(() => itemsData.filter((item) => !item.deleted), [itemsData]);

  return {
    items: activeItems,
    loading,
    error,
    addItem,
    updateItem,
    deleteItem,
    isConfigured: isFirebaseConfigured(),
  }
}

export function useFirebaseScans() {
  const [scans, setScans] = useState<ScanRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let unsubscribe: Unsubscribe | undefined;
    let cancelled = false;

    if (typeof window === "undefined") {
      setLoading(false);
      return;
    }

    const initializeScans = async () => {
      // Wait for Firebase to be ready before proceeding
      const firebaseReady = await waitForFirebaseReady(5000);

      if (cancelled) return;
      
      if (!firebaseReady || !isFirebaseConfigured() || !database) {
        setScans([])
        setError("Firebase tidak tersedia. Riwayat lokal dinonaktifkan.")
        setLoading(false);
        return;
      }

      try {
        const scansRef = ref(database, "scans");
        const scansQuery = query(scansRef, orderByChild("timestamp"), limitToLast(50));
        
        unsubscribe = onValue(
          scansQuery,
          (snapshot: DataSnapshot) => {
            try {
              const data = snapshot.val();
              const loadedScans: ScanRecord[] = data
                ? Object.keys(data)
                    .map((key) => ({ ...data[key], id: key }))
                    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
                : [];
              setScans(loadedScans);
              setError(null);
            } catch (err: any) {
              console.error("Error processing scans snapshot:", err);
              setError(err.message || "Failed to parse scans data");
            }
            setLoading(false);
          },
          (err) => {
            console.error("Firebase scans error:", err);
            setError(err.message);
            setLoading(false);
          }
        );

        // If the effect was cleaned up while we awaited, unsubscribe immediately
        if (cancelled && unsubscribe) {
          unsubscribe();
          return;
        }

        // Register listener for global cleanup
        if (unsubscribe) {
          firebaseCleanup.addListener(unsubscribe);
        }
      } catch (err: any) {
        console.error("Error setting up scans listener:", err);
        setError(err.message || "Failed to setup scans listener");
        setLoading(false);
      }
    };

    initializeScans();

    return () => {
      cancelled = true;
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);

  const addScan = async (scanData: Omit<ScanRecord, "id" | "timestamp" | "processed">) => {
    if (!isFirebaseConfigured()) {
      throw new Error("Firebase tidak tersedia")
    }

    try {
      return await firebaseHelpers.addScanRecord(scanData)
    } catch (err) {
      console.error("Error adding scan:", err)
      throw new Error("Failed to add scan record")
    }
  }

  return {
    scans,
    loading,
    error,
    addScan,
    isConfigured: isFirebaseConfigured(),
  }
}


export function useFirebaseDevices() {
  const [devices, setDevices] = useState<DeviceStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let unsubscribe: Unsubscribe | undefined;
    if (!isFirebaseConfigured() || !database) {
      setDevices([])
      setError("Firebase tidak tersedia.")
      setLoading(false)
      return
    }

    const devicesRef = ref(database, "devices");
    unsubscribe = onValue(
      devicesRef,
      (snapshot: DataSnapshot) => {
        const data = snapshot.val();
        const loadedDevices: DeviceStatus[] = data
          ? Object.keys(data).map((key) => ({ ...data[key], deviceId: key })) // Assuming deviceId is the key
          : [];
        
        setDevices(loadedDevices);
        setError(null);
        setLoading(false);
      },
      (err) => {
        console.error("Firebase devices error:", err);
        setError(err.message);
        setLoading(false);
      }
    );
    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);

  const updateDeviceStatus = async (deviceId: string, status: Partial<DeviceStatus>) => {
    if (!isFirebaseConfigured()) {
      throw new Error("Firebase tidak tersedia")
    }

    try {
      await firebaseHelpers.updateDeviceStatus(deviceId, status)
    } catch (err) {
      console.error("Error updating device status:", err)
      throw new Error("Failed to update device status")
    }
  }

  return {
    devices,
    loading,
    error,
    updateDeviceStatus,
    isConfigured: isFirebaseConfigured(),
  }
}

export function useFirebaseTransactions(limit: number | null = 5000) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let unsubscribe: Unsubscribe | undefined;
    let cancelled = false;

    if (typeof window === "undefined") {
      setLoading(false);
      return;
    }

    const initializeTransactions = async () => {
      const firebaseReady = await waitForFirebaseReady(5000);

      if (cancelled) return;

      if (!firebaseReady || !isFirebaseConfigured() || !database || !dbRefs || !dbRefs.transactions) {
        console.warn("Firebase not configured or transactions ref not available for useFirebaseTransactions.");
        setTransactions([]);
        setError("Firebase tidak tersedia. Cache transaksi lokal dinonaktifkan.");
        setLoading(false);
        return;
      }

      const transactionsQuery =
        limit && limit > 0
          ? query(dbRefs.transactions, orderByChild('timestamp'), limitToLast(limit))
          : query(dbRefs.transactions, orderByChild('timestamp'));
      unsubscribe = onValue(
        transactionsQuery,
        (snapshot: DataSnapshot) => {
          const data = snapshot.val();
          const loadedTransactions: Transaction[] = data
            ? Object.keys(data).map((key) => ({ ...data[key], id: key }))
            : [];
          // Reverse sort to show newest first, or sort as needed
          setTransactions(loadedTransactions.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)));
          setError(null);
          setLoading(false);
        },
        (errorObject: Error) => {
          console.error("Firebase transactions error:", errorObject);
          setError(errorObject.message);
          setLoading(false);
        }
      );

      if (cancelled && unsubscribe) {
        unsubscribe();
        return;
      }

      if (unsubscribe) {
        firebaseCleanup.addListener(unsubscribe);
      }
    };

    initializeTransactions();

    return () => {
      cancelled = true;
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [limit]);

  // addTransaction is usually done via firebaseHelpers, not part of this read-hook.

  return {
    transactions,
    loading,
    error,
    isConfigured: isFirebaseConfigured(),
  };
}
