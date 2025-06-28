"use client"

import { useState, useEffect, useMemo } from "react"; // Add useMemo
import { ref, onValue, DataSnapshot, query, orderByChild, off, Unsubscribe, push, set } from "firebase/database"; // Added push, set
import { firebaseHelpers, isFirebaseConfigured, database, dbRefs } from "@/lib/firebase"; // Ensure all are imported

export interface InventoryItem {
  id: string
  name: string
  category: string
  quantity: number
  minStock: number
  price: number
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
  unitPrice: number;
  totalAmount: number; // quantity * unitPrice, bisa negatif
  reason: string;
  operator: string;
  timestamp: any; // Sebaiknya number (epoch) atau string ISO
  notes?: string;
}

// Local storage keys
const STORAGE_KEYS = {
  INVENTORY: "inventory_items",
  SCANS: "scan_records",
  DEVICES: "device_status",
  TRANSACTIONS: "transaction_records", // Ditambahkan
}

// Helper functions for local storage
const getFromStorage = (key: string) => {
  if (typeof window === "undefined") return null
  try {
    const item = localStorage.getItem(key)
    return item ? JSON.parse(item) : null
  } catch (error) {
    console.error("Error reading from localStorage:", error)
    return null
  }
}

const saveToStorage = (key: string, data: any) => {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(key, JSON.stringify(data))
  } catch (error) {
    console.error("Error saving to localStorage:", error)
  }
}

export function useFirebaseInventory() {
  const [itemsData, setItemsData] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let unsubscribe: Unsubscribe | undefined;

    if (typeof window === "undefined") {
      setLoading(false);
      return;
    }

    if (!isFirebaseConfigured() || !database) {
      console.log("Firebase not available, using local storage for inventory");
      const storedItems = getFromStorage(STORAGE_KEYS.INVENTORY);
      setItemsData(storedItems && storedItems.length > 0 ? storedItems : []);
      setError(null);
      setLoading(false);
      return;
    }

    const inventoryRef = ref(database, "inventory");
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

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);

  const addItem = async (item: Omit<InventoryItem, "id" | "createdAt" | "updatedAt">): Promise<string | undefined> => {
    if (!isFirebaseConfigured()) {
      const newItem: InventoryItem = {
        ...item,
        id: `local_${Date.now()}`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      const updatedItems = [...itemsData, newItem];
      setItemsData(updatedItems);
      saveToStorage(STORAGE_KEYS.INVENTORY, updatedItems);
      return newItem.id;
    }

    try {
      return await firebaseHelpers.addInventoryItem(item);
    } catch (err) {
      console.error("Error adding item:", err);
      const message = err instanceof Error ? err.message : "Failed to add item";
      throw new Error(message);
    }
  };

  const updateItem = async (id: string, updates: Partial<InventoryItem>) => {
    if (!isFirebaseConfigured()) {
      const updatedItems = itemsData.map((itemData) =>
        itemData.id === id ? { ...itemData, ...updates, updatedAt: Date.now() } : itemData
      );
      setItemsData(updatedItems);
      saveToStorage(STORAGE_KEYS.INVENTORY, updatedItems);
      return;
    }

    try {
      await firebaseHelpers.updateInventoryItem(id, updates);
    } catch (err) {
      console.error("Error updating item:", err);
      const message = err instanceof Error ? err.message : "Failed to update item";
      throw new Error(message);
    }
  };

  const deleteItem = async (id: string) => {
    if (!isFirebaseConfigured()) {
      const updatedItems = itemsData.map(itemData =>
        itemData.id === id ? { ...itemData, deleted: true, updatedAt: Date.now() } : itemData
      );
      setItemsData(updatedItems); // Keep deleted items in local state but filter in activeItems
      saveToStorage(STORAGE_KEYS.INVENTORY, updatedItems.filter(i => !i.deleted)); // Save only non-deleted to localStorage
      return;
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
    if (!isFirebaseConfigured() || !database) {
      console.log("Firebase not available, using local storage for scans");
      // Load from local storage or use mock data
      const storedScans = getFromStorage(STORAGE_KEYS.SCANS)

      if (storedScans && storedScans.length > 0) {
        setScans(storedScans)
      } else {
        // Mock data for development
        const mockScans: ScanRecord[] = [
          {
            id: "scan_1",
            barcode: "1234567890123",
            deviceId: "ESP32_001",
            timestamp: Date.now() - 120000, // 2 minutes ago
            processed: true,
            itemFound: true,
            itemId: "mock_1",
          },
          {
            id: "scan_2",
            barcode: "9876543210987",
            deviceId: "ESP32_001",
            timestamp: Date.now() - 300000, // 5 minutes ago
            processed: true,
            itemFound: true,
            itemId: "mock_2",
          },
        ]
        setScans(mockScans)
        saveToStorage(STORAGE_KEYS.SCANS, mockScans)
      }

      setError(null)
      setLoading(false)
      return
    }

    const scansRef = ref(database, "scans");
    unsubscribe = onValue(
      scansRef,
      (snapshot: DataSnapshot) => {
        const data = snapshot.val();
        const loadedScans: ScanRecord[] = data
          ? Object.keys(data).map((key) => ({ ...data[key], id: key }))
          : [];
        setScans(loadedScans.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)));
        setError(null);
        setLoading(false);
      },
      (err) => {
        console.error("Firebase scans error:", err);
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

  const addScan = async (scanData: Omit<ScanRecord, "id" | "timestamp" | "processed">) => {
    if (!isFirebaseConfigured()) {
      // Local storage implementation
      const newScan: ScanRecord = {
        ...scanData,
        id: `scan_${Date.now()}`,
        timestamp: Date.now(),
        processed: false
      }
      const updatedScans = [newScan, ...scans.slice(0, 99)]
      setScans(updatedScans)
      saveToStorage(STORAGE_KEYS.SCANS, updatedScans)
      return newScan.id
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
      // Load from local storage or use mock data
      const storedDevices = getFromStorage(STORAGE_KEYS.DEVICES)

      if (storedDevices && storedDevices.length > 0) {
        setDevices(storedDevices)
      } else {
        // Mock data for development
        const mockDevices: DeviceStatus[] = [
          {
            deviceId: "ESP32_001",
            status: "online",
            ipAddress: "192.168.1.100",
            lastSeen: Date.now(),
            scanCount: 45,
            freeHeap: 245760,
          },
        ]
        setDevices(mockDevices)
        saveToStorage(STORAGE_KEYS.DEVICES, mockDevices)
      }

      setError(null)
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
        
        // Debug: Log loaded device data
        console.log('🔍 Firebase devices loaded:', loadedDevices);
        loadedDevices.forEach(device => {
          console.log(`📱 Device ${device.deviceId}:`, {
            firstSeen: (device as any).firstSeen,
            status: device.status,
            lastSeen: device.lastSeen
          });
        });
        
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
      // Local storage implementation
      const updatedDevices = devices.map((device) => (device.deviceId === deviceId ? { ...device, ...status } : device))
      setDevices(updatedDevices)
      saveToStorage(STORAGE_KEYS.DEVICES, updatedDevices)
      return
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

export function useFirebaseTransactions() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let unsubscribe: Unsubscribe | undefined;
    if (typeof window === "undefined") {
      setLoading(false);
      return;
    }

    if (!isFirebaseConfigured() || !database || !dbRefs || !dbRefs.transactions) {
      console.warn("Firebase not configured or transactions ref not available for useFirebaseTransactions.");
      const storedTransactions = getFromStorage(STORAGE_KEYS.TRANSACTIONS);
      if (storedTransactions && storedTransactions.length > 0) {
        setTransactions(storedTransactions.map((t: any) => ({ ...t, timestamp: t.timestamp || Date.now() })));
      } else {
        setTransactions([]);
      }
      setLoading(false);
      return;
    }

    const transactionsQuery = query(dbRefs.transactions, orderByChild('timestamp'));
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

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []); // dbRefs might be a dependency if it can change, but typically it's stable after init.

  // addTransaction is usually done via firebaseHelpers, not part of this read-hook.

  return {
    transactions,
    loading,
    error,
    isConfigured: isFirebaseConfigured(),
  };
}

export interface AttendanceRecord {
  id: string
  nim: string
  nama?: string
  timestamp: any
  deviceId?: string
  sessionId?: string
  eventName?: string
  location?: string
  scanned: boolean
}

export function useFirebaseAttendance() {
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let unsubscribe: Unsubscribe | undefined;
    if (typeof window === "undefined") {
      setLoading(false);
      return;
    }

    if (!isFirebaseConfigured() || !database) {
      console.warn("Firebase not configured for attendance");
      setLoading(false);
      return;
    }

    const attendanceRef = ref(database, 'attendance');
    const attendanceQuery = query(attendanceRef, orderByChild('timestamp'));
    
    unsubscribe = onValue(
      attendanceQuery,
      (snapshot: DataSnapshot) => {
        const data = snapshot.val();
        const loadedAttendance: AttendanceRecord[] = data
          ? Object.keys(data).map((key) => ({ ...data[key], id: key }))
          : [];
        // Sort by timestamp, newest first
        setAttendance(loadedAttendance.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)));
        setError(null);
        setLoading(false);
      },
      (errorObject: Error) => {
        console.error("Firebase attendance error:", errorObject);
        setError(errorObject.message);
        setLoading(false);
      }
    );

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);

  const addAttendance = async (nim: string, nama?: string, deviceId?: string) => {
    if (!isFirebaseConfigured() || !database) {
      throw new Error("Firebase not configured");
    }

    try {
      const attendanceRef = ref(database, 'attendance');
      const newAttendanceRef = push(attendanceRef);
      const newAttendance: Omit<AttendanceRecord, 'id'> = {
        nim,
        nama: nama || '',
        timestamp: Date.now(),
        deviceId: deviceId || 'web',
        sessionId: 'seminar-2025',
        eventName: 'Seminar Teknologi 2025',
        location: 'Auditorium Utama',
        scanned: true
      };

      await set(newAttendanceRef, {
        ...newAttendance,
        id: newAttendanceRef.key
      });
      return newAttendance;
    } catch (error) {
      console.error("Error adding attendance:", error);
      throw error;
    }
  };

  return {
    attendance,
    loading,
    error,
    addAttendance,
    isConfigured: isFirebaseConfigured(),
  };
}
