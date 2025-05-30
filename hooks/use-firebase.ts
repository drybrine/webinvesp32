"use client"

import { useState, useEffect } from "react"
import { onValue, off, ref, remove, type DataSnapshot } from "firebase/database"
import { database, firebaseHelpers, isFirebaseConfigured } from "@/lib/firebase"

interface InventoryItem {
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
  deleted?: boolean
}

interface ScanRecord {
  id: string
  barcode: string
  deviceId: string
  timestamp: any
  processed: boolean
  itemFound?: boolean
  itemId?: string
  location?: string
}

interface DeviceStatus {
  deviceId: string
  status: "online" | "offline"
  ipAddress: string
  lastSeen: any
  scanCount: number
  uptime: number
  freeHeap?: number
}

// Local storage keys
const STORAGE_KEYS = {
  INVENTORY: "inventory_items",
  SCANS: "scan_records",
  DEVICES: "device_status",
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
  const [items, setItems] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Check if Firebase is configured and available
    if (!isFirebaseConfigured() || !database) {
      console.log("Firebase not available, using local storage")

      // Load from local storage or use mock data
      const storedItems = getFromStorage(STORAGE_KEYS.INVENTORY)

      if (storedItems && storedItems.length > 0) {
        setItems(storedItems)
      } else {
        // Create initial mock data
        const mockItems: InventoryItem[] = [
          {
            id: "mock_1",
            name: "Laptop ASUS ROG",
            barcode: "1234567890123",
            category: "Elektronik",
            quantity: 15,
            minStock: 5,
            price: 18000000,
            description: "Laptop gaming ASUS ROG Strix dengan RTX 4060",
            location: "Gudang A-1",
            supplier: "ASUS Indonesia",
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
          {
            id: "mock_2",
            name: "Mouse Gaming Logitech",
            barcode: "9876543210987",
            category: "Elektronik",
            quantity: 3,
            minStock: 5,
            price: 850000,
            description: "Mouse gaming wireless dengan sensor presisi tinggi",
            location: "Gudang A-2",
            supplier: "Logitech",
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
          {
            id: "mock_3",
            name: "Kursi Kantor Ergonomis",
            barcode: "5555666677778",
            category: "Furnitur",
            quantity: 8,
            minStock: 3,
            price: 2500000,
            description: "Kursi kantor dengan penyangga lumbar dan armrest adjustable",
            location: "Gudang B-1",
            supplier: "Herman Miller",
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        ]
        setItems(mockItems)
        saveToStorage(STORAGE_KEYS.INVENTORY, mockItems)
      }

      setError(null)
      setLoading(false)
      return
    }

    // Firebase is available, use real-time data
    const inventoryRef = ref(database, "inventory")

    const unsubscribe = onValue(
      inventoryRef,
      (snapshot: DataSnapshot) => {
        try {
          const data = snapshot.val()
          if (data) {
            const itemsArray = Object.keys(data).map((key) => ({
              id: key,
              ...data[key],
            }))
            setItems(itemsArray)
            // Also save to local storage as backup
            saveToStorage(STORAGE_KEYS.INVENTORY, itemsArray)
          } else {
            setItems([])
          }
          setError(null)
          setLoading(false)
        } catch (err) {
          console.error("Error processing inventory data:", err)
          setError("Failed to load inventory data")
          setLoading(false)
        }
      },
      (error) => {
        console.error("Firebase inventory error:", error)
        setError(error.message)
        setLoading(false)
      },
    )

    return () => {
      if (inventoryRef && unsubscribe) {
        off(inventoryRef, "value", unsubscribe)
      }
    }
  }, [])

  const addItem = async (item: Omit<InventoryItem, "id" | "createdAt" | "updatedAt">) => {
    if (!isFirebaseConfigured()) {
      // Local storage implementation
      const newItem: InventoryItem = {
        ...item,
        id: `local_${Date.now()}`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      const updatedItems = [...items, newItem]
      setItems(updatedItems)
      saveToStorage(STORAGE_KEYS.INVENTORY, updatedItems)
      return
    }

    try {
      await firebaseHelpers.addInventoryItem(item)
    } catch (err) {
      console.error("Error adding item:", err)
      throw new Error("Failed to add item")
    }
  }

  const updateItem = async (id: string, updates: Partial<InventoryItem>) => {
    if (!isFirebaseConfigured()) {
      // Local storage implementation
      const updatedItems = items.map((item) => (item.id === id ? { ...item, ...updates, updatedAt: Date.now() } : item))
      setItems(updatedItems)
      saveToStorage(STORAGE_KEYS.INVENTORY, updatedItems)
      return
    }

    try {
      const currentItem = items.find((item) => item.id === id)
      if (!currentItem) {
        throw new Error("Item not found")
      }

      const updatedItem = { ...currentItem, ...updates }
      await firebaseHelpers.updateInventoryItem(id, updatedItem)
    } catch (err) {
      console.error("Error updating item:", err)
      throw new Error("Failed to update item")
    }
  }

  const deleteItem = async (id: string) => {
    if (!isFirebaseConfigured()) {
      // Local storage implementation
      const updatedItems = items.filter((item) => item.id !== id)
      setItems(updatedItems)
      saveToStorage(STORAGE_KEYS.INVENTORY, updatedItems)
      return
    }

    try {
      const itemRef = ref(database, `inventory/${id}`)
      await remove(itemRef)
    } catch (err) {
      console.error("Error deleting item:", err)
      throw new Error("Failed to delete item")
    }
  }

  return {
    items: items.filter((item) => !item.deleted),
    loading,
    error,
    addItem,
    updateItem,
    deleteItem,
    isConfigured: isFirebaseConfigured(),
  }
}

export function useFirebaseScans() {
  const [scans, setScans] = useState<ScanRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isFirebaseConfigured() || !database) {
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

    const scansRef = ref(database, "scans")

    const unsubscribe = onValue(
      scansRef,
      (snapshot: DataSnapshot) => {
        try {
          const data = snapshot.val()
          if (data) {
            const scansArray = Object.keys(data)
              .map((key) => ({
                id: key,
                ...data[key],
              }))
              .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
              .slice(0, 100)
            setScans(scansArray)
            saveToStorage(STORAGE_KEYS.SCANS, scansArray)
          } else {
            setScans([])
          }
          setError(null)
          setLoading(false)
        } catch (err) {
          console.error("Error processing scans data:", err)
          setError("Failed to load scans data")
          setLoading(false)
        }
      },
      (error) => {
        console.error("Firebase scans error:", error)
        setError(error.message)
        setLoading(false)
      },
    )

    return () => {
      if (scansRef && unsubscribe) {
        off(scansRef, "value", unsubscribe)
      }
    }
  }, [])

  const addScan = async (scanData: Omit<ScanRecord, "id" | "timestamp">) => {
    if (!isFirebaseConfigured()) {
      // Local storage implementation
      const newScan: ScanRecord = {
        ...scanData,
        id: `scan_${Date.now()}`,
        timestamp: Date.now(),
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
  const [devices, setDevices] = useState<DeviceStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
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
            uptime: 3600, // 1 hour
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

    const devicesRef = ref(database, "devices")

    const unsubscribe = onValue(
      devicesRef,
      (snapshot: DataSnapshot) => {
        try {
          const data = snapshot.val()
          if (data) {
            const devicesArray = Object.keys(data).map((key) => ({
              deviceId: key,
              ...data[key],
            }))
            setDevices(devicesArray)
            saveToStorage(STORAGE_KEYS.DEVICES, devicesArray)
          } else {
            setDevices([])
          }
          setError(null)
          setLoading(false)
        } catch (err) {
          console.error("Error processing devices data:", err)
          setError("Failed to load devices data")
          setLoading(false)
        }
      },
      (error) => {
        console.error("Firebase devices error:", error)
        setError(error.message)
        setLoading(false)
      },
    )

    return () => {
      if (devicesRef && unsubscribe) {
        off(devicesRef, "value", unsubscribe)
      }
    }
  }, [])

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
