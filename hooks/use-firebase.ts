"use client"

import { useState, useEffect } from "react"
import { database, isFirebaseConfigured } from "@/lib/firebase"
import { ref, onValue, push, set, off } from "firebase/database"

// Types
export interface InventoryItem {
  id: string
  barcode: string | null
  name: string
  description: string
  category: string
  quantity: number
  minStock: number
  price: number
  supplier: string | null
  location: string
  lastUpdated?: number
  createdAt?: number
  updatedAt?: number
}

export interface ScanRecord {
  id: string
  barcode: string
  timestamp: number
  deviceId?: string
  itemId?: string
  itemFound?: boolean
  productName?: string
  location?: string
}

export interface AttendanceRecord {
  id: string
  nim: string
  nama: string
  timestamp: number
  deviceId: string
  sessionId: string
  eventName: string
  location: string
  scanned: boolean
}

export interface DeviceStatus {
  deviceId: string
  status: "online" | "offline"
  lastSeen: number
  ipAddress?: string
  scanCount?: number
  uptime?: number
  version?: string
  firstSeen?: number
}

export interface TransactionRecord {
  id: string
  type: "in" | "out" | "adjustment"
  itemId: string
  itemName: string
  quantity: number
  timestamp: number
  deviceId?: string
  notes?: string
}

// Local storage helpers
const getFromStorage = (key: string) => {
  try {
    if (typeof window === "undefined") return null
    const item = localStorage.getItem(key)
    return item ? JSON.parse(item) : null
  } catch (error) {
    console.error("Error reading from localStorage:", error)
    return null
  }
}

const saveToStorage = (key: string, data: unknown) => {
  try {
    if (typeof window === "undefined") return
    localStorage.setItem(key, JSON.stringify(data))
  } catch (error) {
    console.error("Error saving to localStorage:", error)
  }
}

// Firebase Inventory Hook
export function useFirebaseInventory() {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Load from localStorage first
    const storedItems = getFromStorage("inventory")
    if (storedItems) {
      setItems(storedItems)
    }

    if (!isFirebaseConfigured() || !database) {
      setLoading(false)
      return
    }

    const inventoryRef = ref(database, "inventory")
    
    const unsubscribe = onValue(
      inventoryRef,
      (snapshot) => {
        try {
          setError(null)
          const data = snapshot.val()
          if (data) {
            const itemsArray = Object.entries(data).map(([key, value]: [string, any]) => ({
              id: key,
              ...value,
            }))
            setItems(itemsArray)
            saveToStorage("inventory", itemsArray)
          } else {
            setItems([])
          }
          setError(null)
        } catch (err: unknown) {
          console.error("Error processing inventory snapshot:", err)
          setError(err instanceof Error ? err.message : "Failed to parse inventory data")
        } finally {
          setLoading(false)
        }
      },
      (err) => {
        console.error("Firebase inventory error:", err)
        setError(err.message)
        setLoading(false)
      }
    )

    return () => {
      if (unsubscribe) {
        off(inventoryRef, "value", unsubscribe)
      }
    }
  }, [])

  const addItem = async (item: Omit<InventoryItem, "id">) => {
    if (!isFirebaseConfigured() || !database) {
      throw new Error("Firebase not configured")
    }

    try {
      const inventoryRef = ref(database, "inventory")
      const newItemRef = push(inventoryRef)
      const newItem = {
        ...item,
        id: newItemRef.key,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      await set(newItemRef, newItem)
      return newItem
    } catch (err) {
      console.error("Error adding item:", err)
      const message = err instanceof Error ? err.message : "Failed to add item"
      throw new Error(message)
    }
  }

  const updateItem = async (id: string, updates: Partial<InventoryItem>) => {
    if (!isFirebaseConfigured() || !database) {
      throw new Error("Firebase not configured")
    }

    try {
      const itemRef = ref(database, `inventory/${id}`)
      const updatedItem = {
        ...updates,
        updatedAt: Date.now(),
      }
      await set(itemRef, updatedItem)
      return updatedItem
    } catch (err) {
      console.error("Error updating item:", err)
      const message = err instanceof Error ? err.message : "Failed to update item"
      throw new Error(message)
    }
  }

  const deleteItem = async (id: string) => {
    if (!isFirebaseConfigured() || !database) {
      throw new Error("Firebase not configured")
    }

    try {
      const itemRef = ref(database, `inventory/${id}`)
      await set(itemRef, null)
    } catch (err) {
      console.error("Error deleting item:", err)
      const message = err instanceof Error ? err.message : "Failed to delete item"
      throw new Error(message)
    }
  }

  return {
    items,
    loading,
    error,
    addItem,
    updateItem,
    deleteItem,
    isConfigured: isFirebaseConfigured(),
  }
}

// Firebase Scans Hook
export function useFirebaseScans() {
  const [scans, setScans] = useState<ScanRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Load from localStorage first
    const storedScans = getFromStorage("scans")
    if (storedScans) {
      setScans(storedScans)
    }

    if (!isFirebaseConfigured() || !database) {
      setLoading(false)
      return
    }

    const scansRef = ref(database, "scans")
    
    const unsubscribe = onValue(
      scansRef,
      (snapshot) => {
        try {
          const data = snapshot.val()
          if (data) {
            const scansArray = Object.entries(data).map(([key, value]: [string, any]) => ({
              id: key,
              ...value,
            }))
            // Sort by timestamp descending (newest first)
            scansArray.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
            setScans(scansArray)
            saveToStorage("scans", scansArray)
          } else {
            setScans([])
          }
          setError(null)
        } catch (err) {
          console.error("Error processing scans snapshot:", err)
          setError("Failed to parse scans data")
        } finally {
          setLoading(false)
        }
      },
      (err) => {
        console.error("Firebase scans error:", err)
        setError(err.message)
        setLoading(false)
      }
    )

    return () => {
      if (unsubscribe) {
        off(scansRef, "value", unsubscribe)
      }
    }
  }, [])

  const addScan = async (scanData: Omit<ScanRecord, "id">) => {
    if (!isFirebaseConfigured() || !database) {
      throw new Error("Firebase not configured")
    }

    try {
      const scansRef = ref(database, "scans")
      const newScanRef = push(scansRef)
      const newScan = {
        ...scanData,
        id: newScanRef.key,
        timestamp: Date.now(),
      }
      await set(newScanRef, newScan)
      return newScan
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

// Firebase Devices Hook
export function useFirebaseDevices() {
  const [devices, setDevices] = useState<DeviceStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Load from localStorage first
    const storedDevices = getFromStorage("devices")
    if (storedDevices) {
      setDevices(storedDevices)
    }

    if (!isFirebaseConfigured() || !database) {
      setLoading(false)
      return
    }

    const devicesRef = ref(database, "devices")
    
    const unsubscribe = onValue(
      devicesRef,
      (snapshot) => {
        try {
          const data = snapshot.val()
          if (data) {
            const devicesArray = Object.entries(data).map(([key, value]: [string, any]) => ({
              deviceId: key,
              ...value,
            }))
            setDevices(devicesArray)
            saveToStorage("devices", devicesArray)
          } else {
            setDevices([])
          }
          setError(null)
        } catch (err) {
          console.error("Error processing devices snapshot:", err)
          setError("Failed to parse devices data")
        } finally {
          setLoading(false)
        }
      },
      (err) => {
        console.error("Firebase devices error:", err)
        setError(err.message)
        setLoading(false)
      }
    )

    return () => {
      if (unsubscribe) {
        off(devicesRef, "value", unsubscribe)
      }
    }
  }, [])

  const updateDeviceStatus = async (deviceId: string, status: Partial<DeviceStatus>) => {
    if (!isFirebaseConfigured() || !database) {
      throw new Error("Firebase not configured")
    }

    try {
      const deviceRef = ref(database, `devices/${deviceId}`)
      await set(deviceRef, { ...status, deviceId, lastSeen: Date.now() })
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

// Firebase Transactions Hook
export function useFirebaseTransactions() {
  const [transactions, setTransactions] = useState<TransactionRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Load from localStorage first
    const storedTransactions = getFromStorage("transactions")
    if (storedTransactions) {
      setTransactions(storedTransactions.map((t: any) => ({ ...t, timestamp: t.timestamp || Date.now() })))
    }

    if (!isFirebaseConfigured() || !database) {
      setLoading(false)
      return
    }

    const transactionsRef = ref(database, "transactions")
    
    const unsubscribe = onValue(
      transactionsRef,
      (snapshot) => {
        try {
          const data = snapshot.val()
          if (data) {
            const transactionsArray = Object.entries(data).map(([key, value]: [string, any]) => ({
              id: key,
              ...value,
            }))
            // Sort by timestamp descending
            transactionsArray.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
            setTransactions(transactionsArray)
            saveToStorage("transactions", transactionsArray)
          } else {
            setTransactions([])
          }
          setError(null)
        } catch (err) {
          console.error("Error processing transactions snapshot:", err)
          setError("Failed to parse transactions data")
        } finally {
          setLoading(false)
        }
      },
      (errorObject: Error) => {
        console.error("Firebase transactions error:", errorObject)
        setError(errorObject.message)
        setLoading(false)
      }
    )

    return () => {
      if (unsubscribe) {
        off(transactionsRef, "value", unsubscribe)
      }
    }
  }, [])

  const addTransaction = async (transactionData: Omit<TransactionRecord, "id">) => {
    if (!isFirebaseConfigured() || !database) {
      throw new Error("Firebase not configured")
    }

    try {
      const transactionsRef = ref(database, "transactions")
      const newTransactionRef = push(transactionsRef)
      const newTransaction = {
        ...transactionData,
        id: newTransactionRef.key,
        timestamp: Date.now(),
      }
      await set(newTransactionRef, newTransaction)
      return newTransaction
    } catch (err) {
      console.error("Error adding transaction:", err)
      throw new Error("Failed to add transaction")
    }
  }

  return {
    transactions,
    loading,
    error,
    addTransaction,
    isConfigured: isFirebaseConfigured(),
  }
}

// Firebase Attendance Hook
export function useFirebaseAttendance() {
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Load from localStorage first
    const storedAttendance = getFromStorage("attendance")
    if (storedAttendance) {
      setAttendance(storedAttendance)
    }

    if (!isFirebaseConfigured() || !database) {
      setLoading(false)
      return
    }

    const attendanceRef = ref(database, "attendance")
    
    const unsubscribe = onValue(
      attendanceRef,
      (snapshot) => {
        try {
          const data = snapshot.val()
          if (data) {
            const attendanceArray = Object.entries(data).map(([key, value]: [string, any]) => ({
              id: key,
              ...value,
            }))
            // Sort by timestamp descending
            attendanceArray.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
            setAttendance(attendanceArray)
            saveToStorage("attendance", attendanceArray)
          } else {
            setAttendance([])
          }
          setError(null)
        } catch (err) {
          console.error("Error processing attendance snapshot:", err)
          setError("Failed to parse attendance data")
        } finally {
          setLoading(false)
        }
      },
      (errorObject: Error) => {
        console.error("Firebase attendance error:", errorObject)
        setError(errorObject.message)
        setLoading(false)
      }
    )

    return () => {
      if (unsubscribe) {
        off(attendanceRef, "value", unsubscribe)
      }
    }
  }, [])

  const addAttendance = async (nim: string, nama?: string, deviceId?: string) => {
    if (!isFirebaseConfigured() || !database) {
      throw new Error("Firebase not configured")
    }

    try {
      const attendanceRef = ref(database, "attendance")
      const newAttendanceRef = push(attendanceRef)
      const newAttendance: Omit<AttendanceRecord, "id"> = {
        nim,
        nama: nama || "",
        timestamp: Date.now(),
        deviceId: deviceId || "web",
        sessionId: "seminar-2025",
        eventName: "Seminar Teknologi 2025",
        location: "Auditorium Utama",
        scanned: true,
      }

      await set(newAttendanceRef, {
        ...newAttendance,
        id: newAttendanceRef.key,
      })
      return newAttendance
    } catch (error) {
      console.error("Error adding attendance:", error)
      throw error
    }
  }

  return {
    attendance,
    loading,
    error,
    addAttendance,
    isConfigured: isFirebaseConfigured(),
  }
}