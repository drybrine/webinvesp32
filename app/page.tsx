"use client"

import { useState, useEffect, useMemo, useRef } from "react" // Added useRef
import { useRouter } from "next/navigation"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Package,
  DollarSign,
  AlertCircle,
  Scan,
  Plus,
  Search,
  Eye,
  Edit,
  Trash2,
  Minus,
  Filter,
  Download,
  ChevronDown,
  ChevronUp,
  Barcode as BarcodeIcon,
  Wifi,
  WifiOff,
  Settings,
  Smartphone,
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import {
  useFirebaseInventory,
  useFirebaseScans,
  useFirebaseDevices,
  InventoryItem,
  // ScanRecord, // Not used directly in this component's state/props
  // DeviceStatus as FirebaseDeviceStatus, // Not used directly
} from "@/hooks/use-firebase"
import { getFirebaseStatus, firebaseHelpers } from "@/lib/firebase"
// import { ScanHistory } from "@/components/scan-history" // Not used in this file
import BarcodeComponent from "react-barcode"

// Interface InventoryItem is already defined in use-firebase, re-declaring here might be redundant
// interface InventoryItem {
//   id: string
//   barcode: string | null // Allow null
//   name: string
//   description: string
//   category: string
//   quantity: number
//   minStock: number
//   price: number
//   supplier: string | null // Allow null
//   location: string
//   lastUpdated?: number // Optional: timestamp of last update
// }

interface StockAdjustment {
  itemId: string
  itemName: string
  currentQuantity: number
  type: "add" | "subtract"
  amount: number
}

export default function TransaksiPage() {
  const router = useRouter()
  const {
    items: inventory,
    loading: inventoryLoading,
    error: inventoryError,
    addItem,
    updateItem,
    deleteItem,
  } = useFirebaseInventory()
  const { scans, loading: scansLoading, error: scansError } = useFirebaseScans()
  const { devices, loading: devicesLoading, error: devicesError } = useFirebaseDevices()

  const [isAddItemOpen, setIsAddItemOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null)
  const [viewingItem, setViewingItem] = useState<InventoryItem | null>(null)
  const [stockAdjustment, setStockAdjustment] = useState<StockAdjustment | null>(null)
  const [searchTerm, setSearchTerm] = useState("")
  const [filterCategory, setFilterCategory] = useState("all")
  const [sortOrder, setSortOrder] = useState("name-asc")
  // const [showBarcodeScanner, setShowBarcodeScanner] = useState(false) // Not used
  // const [scannedBarcode, setScannedBarcode] = useState<string | null>(null) // Not used

  const { toast } = useToast()

  const [newItem, setNewItem] = useState<Omit<InventoryItem, "id" | "createdAt" | "updatedAt">>({
    barcode: "",
    name: "",
    description: "",
    category: "",
    quantity: 0,
    minStock: 5,
    price: 0,
    supplier: "",
    location: "",
    lastUpdated: Date.now(),
  })

  const categories = useMemo(() => {
    if (inventoryLoading || !inventory) {
      return ["all"];
    }
    return ["all", ...new Set(inventory.map((item) => item.category).filter(cat => typeof cat === 'string' && cat.trim() !== ''))]
  }, [inventory, inventoryLoading]);

  const firebaseStatus = getFirebaseStatus()

  const onlineDevices = useMemo(() => {
    if (devicesLoading || !devices) return 0;
    return devices.filter(
      (d) => d.lastSeen && Date.now() - new Date(d.lastSeen).getTime() < 15 * 1000 // Match API timeout: 15 seconds
    ).length;
  }, [devices, devicesLoading]);

  const prevOnlineDevicesRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!devicesLoading) { // Only show toasts after initial device load
      const currentOnlineDevices = onlineDevices;
      const prevOnlineDevices = prevOnlineDevicesRef.current;

      if (prevOnlineDevices !== undefined) { // Avoid toast on initial render
        if (currentOnlineDevices > 0 && prevOnlineDevices === 0) {
          toast({
            title: "Pemindai Terhubung",
            description: "Satu atau lebih pemindai ESP32 kini aktif.",
            variant: "default",
          });
        } else if (currentOnlineDevices === 0 && prevOnlineDevices > 0) {
          toast({
            title: "Pemindai Terputus",
            description: "Semua pemindai ESP32 kini tidak aktif.",
            variant: "destructive",
          });
        } else if (currentOnlineDevices > prevOnlineDevices) {
           toast({
            title: "Pemindai Baru Terhubung",
            description: `Jumlah pemindai aktif bertambah menjadi ${currentOnlineDevices}.`,
            variant: "default",
          });
        } else if (currentOnlineDevices < prevOnlineDevices && currentOnlineDevices > 0) {
           toast({
            title: "Satu Pemindai Terputus",
            description: `Jumlah pemindai aktif berkurang menjadi ${currentOnlineDevices}.`,
            variant: "default", // Or "destructive" if preferred
          });
        }
      }
      prevOnlineDevicesRef.current = currentOnlineDevices;
    }
  }, [onlineDevices, devicesLoading, toast]);

  // Auto-refresh device status every 10 seconds to match fast offline detection
  useEffect(() => {
    const intervalId = setInterval(async () => {
      // Force refresh of device data by calling the Firebase hook refresh
      if (window.location.pathname === '/' && document.visibilityState === 'visible') {
        try {
          // Trigger a device status check
          const fetchOptions: RequestInit = {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Internal-Call': 'true'
            }
          };
          
          // Add timeout if AbortSignal.timeout is available
          if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) {
            fetchOptions.signal = AbortSignal.timeout(5000); // 5 second timeout
          }
          
          const response = await fetch('/api/check-device-status', fetchOptions);
          
          if (!response.ok) {
            console.warn('🔄 Dashboard auto-refresh failed:', response.status, response.statusText);
          }
        } catch (error) {
          // Only log significant errors, not every network glitch
          if (error instanceof Error && !error.message.includes('timeout')) {
            console.log('🔄 Dashboard auto-refresh error:', error.message);
          }
        }
      }
    }, 10000); // 10 seconds to match fast detection

    return () => clearInterval(intervalId);
  }, []);

  // Listen for device status updates from background monitor
  useEffect(() => {
    const handleDeviceStatusUpdate = (event: CustomEvent) => {
      console.log('📡 Dashboard received device status update:', event.detail);
      // The Firebase hook will automatically refresh when the database changes
    };

    window.addEventListener('deviceStatusUpdated', handleDeviceStatusUpdate as EventListener);
    
    return () => {
      window.removeEventListener('deviceStatusUpdated', handleDeviceStatusUpdate as EventListener);
    };
  }, []);

  // Debug: Log device status changes for dashboard
  useEffect(() => {
    console.log('📱 Dashboard devices update:', {
      devicesCount: devices?.length || 0,
      onlineDevices,
      devices: devices?.map(d => ({
        deviceId: d.deviceId,
        status: d.status,
        lastSeen: d.lastSeen,
        timeDiff: d.lastSeen ? Math.floor((Date.now() - new Date(d.lastSeen).getTime()) / 1000) : 'never'
      }))
    });
  }, [devices, onlineDevices]);

  if (inventoryLoading || scansLoading || devicesLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Memuat sistem inventaris...</p>
        </div>
      </div>
    )
  }

  const addInventoryItem = async () => {
    if (!newItem.name || !newItem.barcode) {
      toast({
        title: "Kesalahan Validasi",
        description: "Nama dan barcode wajib diisi",
        variant: "destructive",
      })
      return
    }

    const existingItemByBarcode = inventory.find((item) => item.barcode && item.barcode === newItem.barcode && newItem.barcode !== "");
    if (existingItemByBarcode) {
      toast({
        title: "Barcode Sudah Ada",
        description: `Barcode ${newItem.barcode} sudah digunakan untuk ${existingItemByBarcode.name}`,
        variant: "destructive",
      })
      return
    }
    
    const existingItemByName = inventory.find((item) => item.name.toLowerCase() === newItem.name.toLowerCase());
    if (existingItemByName) {
      toast({
        title: "Nama Item Sudah Ada",
        description: `Item dengan nama ${newItem.name} sudah ada.`,
        variant: "destructive",
      })
      return
    }


    try {
      await addItem(newItem)
      setNewItem({
        barcode: "",
        name: "",
        description: "",
        category: "",
        quantity: 0,
        minStock: 5,
        price: 0,
        supplier: "",
        location: "",
        lastUpdated: Date.now(),
      })
      setIsAddItemOpen(false)
      toast({
        title: "Berhasil",
        description: "Item berhasil ditambahkan",
      })
    } catch (error) {
      toast({
        title: "Error",
        description: "Gagal menambahkan item",
        variant: "destructive",
      })
    }
  }

  const updateInventoryItem = async () => {
    if (!editingItem) return

    // Check if barcode is being changed to one that already exists (excluding itself)
    if (editingItem.barcode) {
      const otherItemWithSameBarcode = inventory.find(
        (item) => item.id !== editingItem.id && item.barcode === editingItem.barcode
      );
      if (otherItemWithSameBarcode) {
        toast({
          title: "Barcode Sudah Ada",
          description: `Barcode ${editingItem.barcode} sudah digunakan untuk item ${otherItemWithSameBarcode.name}.`,
          variant: "destructive",
        });
        return;
      }
    }
    // Check if name is being changed to one that already exists (excluding itself)
    const otherItemWithSameName = inventory.find(
        (item) => item.id !== editingItem.id && item.name.toLowerCase() === editingItem.name.toLowerCase()
    );
    if (otherItemWithSameName) {
        toast({
            title: "Nama Item Sudah Ada",
            description: `Item dengan nama ${editingItem.name} sudah ada.`,
            variant: "destructive",
        });
        return;
    }


    try {
      await updateItem(editingItem.id, editingItem)
      setEditingItem(null)
      toast({
        title: "Berhasil",
        description: "Item berhasil diperbarui",
      })
    } catch (error) {
      toast({
        title: "Error",
        description: "Gagal memperbarui item",
        variant: "destructive",
      })
    }
  }

  const deleteInventoryItem = async (id: string, name: string) => {
    if (!confirm(`Apakah Anda yakin ingin menghapus "${name}"?`)) {
      return
    }

    try {
      await deleteItem(id)
      toast({
        title: "Berhasil",
        description: "Item berhasil dihapus",
      })
    } catch (error) {
      toast({
        title: "Error",
        description: "Gagal menghapus item",
        variant: "destructive",
      })
    }
  }

  const handleStockAdjustment = async () => {
    if (!stockAdjustment) return

    const { itemId, amount, type, currentQuantity, itemName } = stockAdjustment
    const newQuantity = type === "add" ? currentQuantity + amount : currentQuantity - amount

    if (newQuantity < 0) {
      toast({
        title: "Error",
        description: "Stok tidak boleh kurang dari nol.",
        variant: "destructive",
      })
      return
    }

    try {
      await updateItem(itemId, { quantity: newQuantity } as Partial<InventoryItem>)
      
      // Record transaction
      const transactionData = {
        type: type === "add" ? "in" : "out", // Or 'adjustment'
        productBarcode: inventory.find(i => i.id === itemId)?.barcode || "N/A",
        productName: itemName,
        quantity: type === "add" ? amount : -amount,
        unitPrice: inventory.find(i => i.id === itemId)?.price || 0, // Assuming price is needed
        totalAmount: (type === "add" ? amount : -amount) * (inventory.find(i => i.id === itemId)?.price || 0),
        reason: "Penyesuaian Stok dari Dashboard Inventaris",
        operator: "Admin", // Replace with actual user if available
        // timestamp will be added by firebaseHelpers.addTransaction
      };
      await firebaseHelpers.addTransaction(transactionData);

      setStockAdjustment(null)
      toast({
        title: "Berhasil",
        description: `Stok ${itemName} ${type === "add" ? "ditambah" : "dikurangi"} sebanyak ${amount}. Transaksi dicatat.`,
      })
    } catch (error) {
      console.error("Error adjusting stock or recording transaction:", error);
      toast({
        title: "Error",
        description: "Gagal mengubah stok atau mencatat transaksi.",
        variant: "destructive",
      })
    }
  }

  const filteredInventory = inventory.filter((item) => {
    const matchesSearch =
      item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.barcode ?? "").includes(searchTerm) ||
      item.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.supplier ?? "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.location.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesCategory = filterCategory === "all" || item.category === filterCategory

    return matchesSearch && matchesCategory
  }).sort((a, b) => {
    const [key, order] = sortOrder.split("-")
    let comparison = 0
    
    const valA = key === 'name' ? a.name.toLowerCase() : key === 'quantity' ? a.quantity : key === 'price' ? a.price : key === 'category' ? a.category.toLowerCase() : 0;
    const valB = key === 'name' ? b.name.toLowerCase() : key === 'quantity' ? b.quantity : key === 'price' ? b.price : key === 'category' ? b.category.toLowerCase() : 0;

    if (valA > valB) {
      comparison = 1
    } else if (valA < valB) {
      comparison = -1
    }
    return order === "asc" ? comparison : comparison * -1
  })

  const totalItems = inventory.length
  const totalValue = inventory.reduce((sum, item) => sum + item.quantity * item.price, 0)
  const lowStockItems = inventory.filter((item) => item.quantity <= item.minStock)
  // onlineDevices is now a useMemo hook above

  const exportToCSV = () => {
    const csvRows = [];
    const headers = ["ID", "Barcode", "Nama", "Deskripsi", "Kategori", "Kuantitas", "Stok Min", "Harga", "Pemasok", "Lokasi", "Update Terakhir"];
    csvRows.push(headers.join(','));

    for (const item of filteredInventory) {
        const values = [
            item.id,
            item.barcode || "",
            `"${item.name.replace(/"/g, '""')}"`,
            `"${item.description.replace(/"/g, '""')}"`,
            item.category,
            item.quantity,
            item.minStock,
            item.price,
            `"${(item.supplier || "").replace(/"/g, '""')}"`,
            `"${item.location.replace(/"/g, '""')}"`,
            item.lastUpdated ? new Date(item.lastUpdated).toLocaleString() : ""
        ];
        csvRows.push(values.join(','));
    }

    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const fileName = `inventaris_${new Date().toISOString().split('T')[0]}.csv`;
    
    const link = document.createElement("a");
    if (link.download !== undefined) { 
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", fileName);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
    toast({ title: "Export Berhasil", description: `${filteredInventory.length} item diexport ke ${fileName}` });
  };

  // Add this function near your other utility functions (at the top of your component)
  interface DeviceStatus {
    deviceId?: string;
    lastHeartbeat?: number | string | Date;
    lastSeen?: number | string | Date;
    ipAddress?: string;
  }
  
  const checkDeviceStatus = (device: DeviceStatus) => {
    const lastSeen = device.lastHeartbeat || device.lastSeen;
    const now = Date.now();
    return lastSeen && (now - new Date(lastSeen).getTime() < 60000) ? "online" : "offline";
  };

  return (
    <div className="min-h-screen gradient-surface p-3 sm:p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Enhanced Header with modern design */}
        <div className="mb-8 sm:mb-10 md:mb-12 text-center md:text-left animate-fade-in-up">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between">
            <div className="mb-6 md:mb-0">
              <div className="flex items-center justify-center md:justify-start mb-4">
                <div className="relative">
                  <div className="absolute -inset-1 gradient-primary rounded-full blur opacity-30 animate-pulse"></div>
                  <div className="relative w-12 h-12 sm:w-16 sm:h-16 gradient-primary rounded-full flex items-center justify-center shadow-colored">
                    <Package className="w-6 h-6 sm:w-8 sm:h-8 text-white animate-float" />
                  </div>
                </div>
                <div className="ml-4">
                  <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold gradient-text tracking-tight">
                    Dashboard Inventaris
                  </h1>
                  <p className="text-sm sm:text-base lg:text-lg text-muted-foreground font-medium mt-2">
                    Kelola stok barang dengan teknologi terdepan
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-center md:justify-start space-x-4">
                <div className="h-1 w-16 gradient-primary rounded-full animate-pulse"></div>
                <div className="h-1 w-8 gradient-secondary rounded-full animate-pulse animation-delay-200"></div>
                <div className="h-1 w-4 gradient-accent rounded-full animate-pulse animation-delay-400"></div>
              </div>
            </div>
            
            {/* Quick Actions */}
            <div className="flex items-center space-x-3">
              <Button
                onClick={() => setIsAddItemOpen(true)}
                className="btn-modern gradient-primary text-white shadow-colored hover:shadow-extra-large px-6 py-3 rounded-2xl font-semibold"
              >
                <Plus className="w-4 h-4 mr-2" />
                Tambah Item
              </Button>
              <Button
                onClick={exportToCSV}
                variant="outline"
                className="glass-card px-6 py-3 rounded-2xl font-semibold hover:shadow-medium"
              >
                <Download className="w-4 h-4 mr-2" />
                Export
              </Button>
            </div>
          </div>
        </div>

        {/* Enhanced Status Alerts */}
        <div className="mb-8 space-y-4 animate-fade-in-up animation-delay-200">
          {/* Firebase Status Alert */}
          <Alert className={`glass-card shadow-medium border-l-4 transition-all duration-300 ${
            firebaseStatus.available 
              ? "border-l-emerald-500 hover:shadow-large" 
              : "border-l-amber-500 hover:shadow-large"
          }`}>
            <div className="flex items-center">
              {firebaseStatus.available ? (
                <div className="relative">
                  <Wifi className="h-5 w-5 text-emerald-600" />
                  <div className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full animate-ping"></div>
                </div>
              ) : (
                <WifiOff className="h-5 w-5 text-amber-600 animate-pulse" />
              )}
              <AlertDescription className="ml-3 text-sm font-medium">
                <strong className="text-foreground">Status Backend:</strong>{" "}
                {firebaseStatus.available ? (
                  <span className="text-emerald-700 font-semibold">Terhubung - Real-time sync aktif</span>
                ) : (
                  <span className="text-amber-700 font-semibold">Tidak terhubung ke Firebase</span>
                )}
              </AlertDescription>
            </div>
          </Alert>

          {/* Error Alerts */}
          {(inventoryError || scansError || devicesError) && (
            <Alert className="glass-card shadow-medium border-l-4 border-l-red-500 hover:shadow-large transition-all duration-300">
              <AlertCircle className="h-5 w-5 text-red-600 animate-pulse" />
              <AlertDescription className="ml-3 text-sm font-medium">
                <strong className="text-foreground">Error:</strong>{" "}
                <span className="text-red-700">{inventoryError || scansError || devicesError || "Gagal memuat data."}</span>
              </AlertDescription>
            </Alert>
          )}
        </div>

        {/* Enhanced Stats Cards with modern design */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-6 mb-6 sm:mb-8 animate-fade-in-up animation-delay-400">
          {/* Total Items Card */}
          <Card className="glass-card card-hover shadow-medium hover:shadow-colored transition-all duration-500 group">
            <div className="absolute inset-0 gradient-primary opacity-5 rounded-xl"></div>
            <div className="absolute top-2 right-2 w-8 h-8 sm:w-12 sm:h-12 gradient-primary rounded-full opacity-10 group-hover:opacity-20 transition-opacity duration-300"></div>
            <CardHeader className="relative z-10 pb-2 sm:pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs sm:text-sm font-semibold text-muted-foreground">Total Item</CardTitle>
                <div className="p-1.5 sm:p-2 gradient-primary rounded-lg shadow-sm">
                  <Package className="h-3 w-3 sm:h-4 sm:w-4 text-white" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="relative z-10 pt-0">
              <div className="space-y-1 sm:space-y-2">
                <div className="text-lg sm:text-2xl md:text-3xl font-bold gradient-text">{totalItems}</div>
                <p className="text-xs text-muted-foreground font-medium">Jenis barang unik</p>
                <div className="w-full bg-muted/50 rounded-full h-1">
                  <div className="gradient-primary h-1 rounded-full w-3/4 animate-pulse"></div>
                </div>
              </div>
            </CardContent>
          </Card>
          
          {/* Total Value Card */}
          <Card className="glass-card card-hover shadow-medium hover:shadow-colored transition-all duration-500 group">
            <div className="absolute inset-0 gradient-secondary opacity-5 rounded-xl"></div>
            <div className="absolute top-2 right-2 w-8 h-8 sm:w-12 sm:h-12 gradient-secondary rounded-full opacity-10 group-hover:opacity-20 transition-opacity duration-300"></div>
            <CardHeader className="relative z-10 pb-2 sm:pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs sm:text-sm font-semibold text-muted-foreground">Total Nilai</CardTitle>
                <div className="p-1.5 sm:p-2 gradient-secondary rounded-lg shadow-sm">
                  <DollarSign className="h-3 w-3 sm:h-4 sm:w-4 text-white" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="relative z-10 pt-0">
              <div className="space-y-1 sm:space-y-2">
                <div className="text-lg sm:text-2xl md:text-3xl font-bold gradient-text">
                  Rp {totalValue.toLocaleString('id-ID')}
                </div>
                <p className="text-xs text-muted-foreground font-medium">Nilai inventaris total</p>
                <div className="w-full bg-muted/50 rounded-full h-1">
                  <div className="gradient-secondary h-1 rounded-full w-4/5 animate-pulse"></div>
                </div>
              </div>
            </CardContent>
          </Card>
          
          {/* Low Stock Card */}
          <Card className="glass-card card-hover shadow-medium hover:shadow-colored transition-all duration-500 group">
            <div className="absolute inset-0 gradient-accent opacity-5 rounded-xl"></div>
            <div className="absolute top-2 right-2 w-8 h-8 sm:w-12 sm:h-12 gradient-accent rounded-full opacity-10 group-hover:opacity-20 transition-opacity duration-300"></div>
            <CardHeader className="relative z-10 pb-2 sm:pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs sm:text-sm font-semibold text-muted-foreground">Stok Rendah</CardTitle>
                <div className="p-1.5 sm:p-2 gradient-accent rounded-lg shadow-sm">
                  <AlertCircle className="h-3 w-3 sm:h-4 sm:w-4 text-white" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="relative z-10 pt-0">
              <div className="space-y-1 sm:space-y-2">
                <div className="text-lg sm:text-2xl md:text-3xl font-bold gradient-text">{lowStockItems.length}</div>
                <p className="text-xs text-muted-foreground font-medium">Item perlu diisi ulang</p>
                <div className="w-full bg-muted/50 rounded-full h-1">
                  <div className={`h-1 rounded-full ${lowStockItems.length > 0 ? 'gradient-accent animate-pulse' : 'bg-emerald-500'} transition-all duration-300`} 
                       style={{ width: lowStockItems.length > 0 ? '60%' : '100%' }}></div>
                </div>
              </div>
            </CardContent>
          </Card>
          
          {/* ESP32 Status Card - Mobile optimized */}
          <Card className="glass-card card-hover shadow-medium hover:shadow-colored transition-all duration-500 group col-span-2 lg:col-span-1">
            <div className={`absolute inset-0 ${onlineDevices > 0 ? 'bg-emerald-500' : 'bg-red-500'} opacity-5 rounded-xl`}></div>
            <CardHeader className="relative z-10 pb-2 sm:pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs sm:text-sm font-semibold text-muted-foreground">ESP32 Scanner</CardTitle>
                <div className={`p-1.5 sm:p-2 rounded-lg shadow-sm ${onlineDevices > 0 ? 'bg-emerald-500' : 'bg-red-500'}`}>
                  {onlineDevices > 0 ? (
                    <Wifi className="h-3 w-3 sm:h-4 sm:w-4 text-white" />
                  ) : (
                    <WifiOff className="h-3 w-3 sm:h-4 sm:w-4 text-white" />
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="relative z-10 pt-0">
              <div className="space-y-2 sm:space-y-3">
                <div className={`text-lg sm:text-xl md:text-2xl font-bold ${onlineDevices > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {onlineDevices > 0 ? "Terhubung" : "Terputus"}
                </div>
                <p className="text-xs text-muted-foreground font-medium">
                  {devices && devices.length > 0 
                    ? `${onlineDevices} dari ${devices.length} perangkat aktif` 
                    : "Tidak ada perangkat terdaftar"
                  }
                </p>
                
                {/* Enhanced Device Status - Mobile responsive */}
                {devices && devices.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2 text-xs font-semibold text-muted-foreground">
                      <Smartphone className="h-3 w-3" />
                      <span className="hidden sm:inline">Status Perangkat</span>
                      <span className="sm:hidden">Perangkat</span>
                    </div>
                    <div className="space-y-1">
                      {devices
                        .slice(0, 2) // Show only 2 devices on mobile
                        .map((device, index) => {
                          const timeDiff = device.lastSeen ? Date.now() - new Date(device.lastSeen).getTime() : Infinity;
                          const isOnlineByTime = timeDiff < 30 * 1000;
                          const isOnlineByStatus = device.status === "online";
                          const isActuallyOnline = isOnlineByStatus && isOnlineByTime;
                          
                          return (
                            <div key={device.deviceId || index} className="flex items-center justify-between glass-card p-2 rounded-lg">
                              <div className="flex flex-col min-w-0 flex-1">
                                <span className="font-mono text-xs text-foreground/80 truncate">
                                  {device.deviceId || `Device-${index + 1}`}
                                </span>
                                {isActuallyOnline && device.ipAddress && (
                                  <span className="font-mono text-xs text-muted-foreground truncate">
                                    {device.ipAddress}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center space-x-1 flex-shrink-0">
                                <div className={`w-2 h-2 rounded-full ${isActuallyOnline ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}></div>
                                <span className={`text-xs font-semibold ${isActuallyOnline ? 'text-emerald-600' : 'text-red-600'}`}>
                                  {isActuallyOnline ? 'Online' : 'Offline'}
                                </span>
                              </div>
                            </div>
                          );
                        })
                      }
                    </div>
                  </div>
                )}
                
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="flex-1 glass-card hover:shadow-medium btn-modern font-semibold text-xs sm:text-sm px-2 py-1" 
                    onClick={async () => {
                      try {
                        await fetch('/api/check-device-status', {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                            'X-Internal-Call': 'true'
                          }
                        });
                        toast({
                          title: "Status Diperbarui",
                          description: "Status perangkat telah direfresh",
                        });
                      } catch (error) {
                        toast({
                          title: "Error",
                          description: "Gagal memperbarui status perangkat",
                          variant: "destructive",
                        });
                      }
                    }}
                  >
                    <WifiOff className="mr-1 h-3 w-3" />
                    <span className="hidden sm:inline">Refresh</span>
                    <span className="sm:hidden">↻</span>
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="flex-1 glass-card hover:shadow-medium btn-modern font-semibold text-xs sm:text-sm px-2 py-1" 
                    onClick={() => router.push('/pengaturan?tab=devices')}
                  >
                    <Settings className="mr-1 h-3 w-3" />
                    <span className="hidden sm:inline">Kelola</span>
                    <span className="sm:hidden">⚙</span>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Low Stock Alert - Enhanced styling */}
        {lowStockItems.length > 0 && (
          <Alert variant="destructive" className="mb-6 sm:mb-8 shadow-lg border-0 bg-gradient-to-r from-red-50 to-pink-50 border-l-4 border-l-red-500">
            <AlertCircle className="h-5 w-5" />
            <AlertDescription className="text-sm font-medium">
              <strong>⚠️ Perhatian Stok Rendah:</strong> {lowStockItems.length} item perlu segera diisi ulang.
              <div className="mt-3 max-h-24 overflow-y-auto bg-white/50 rounded-lg p-3">
                <ul className="list-disc list-inside text-xs space-y-1">
                  {lowStockItems.slice(0, 3).map(item => 
                    <li key={item.id} className="text-red-700">
                      <span className="font-medium">{item.name}</span> 
                      <span className="text-red-600"> (Sisa: {item.quantity})</span>
                    </li>
                  )}
                  {lowStockItems.length > 3 && (
                    <li className="text-red-600 font-medium">...dan {lowStockItems.length - 3} item lainnya</li>
                  )}
                </ul>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Inventory Table and Controls - Enhanced */}
        <Card className="shadow-xl border-0 bg-white/80 backdrop-blur-sm">
          <CardHeader className="bg-gradient-to-r from-slate-50 to-gray-50 border-b border-gray-100">
            <div className="flex flex-col space-y-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
              <div>
                <CardTitle className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-gray-700 to-gray-900 bg-clip-text text-transparent">
                  📦 Inventaris ({filteredInventory.length})
                </CardTitle>
                <CardDescription className="text-sm text-gray-600 font-medium mt-1">
                  Kelola dan pantau stok barang Anda
                </CardDescription>
              </div>
              
              <div className="flex flex-col space-y-2 sm:flex-row sm:space-y-0 sm:space-x-3">
                <Button 
                  onClick={() => setIsAddItemOpen(true)} 
                  size="sm" 
                  className="w-full sm:w-auto bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105 text-sm px-4 py-2"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  <span className="sm:hidden">Tambah</span>
                  <span className="hidden sm:inline">Tambah Item</span>
                </Button>
                <Button 
                  variant="outline" 
                  onClick={exportToCSV} 
                  size="sm" 
                  className="w-full sm:w-auto glass-card hover:shadow-lg transition-all duration-300 text-sm px-4 py-2"
                >
                  <Download className="w-4 h-4 mr-2" />
                  <span className="sm:hidden">Export</span>
                  <span className="hidden sm:inline">Export CSV</span>
                </Button>
              </div>
            </div>

            {/* Filters - Enhanced styling and mobile responsive */}
            <div className="flex flex-col space-y-3 sm:flex-row sm:space-y-0 sm:space-x-4 bg-gradient-to-r from-blue-50/50 to-indigo-50/50 p-3 sm:p-4 rounded-lg border border-blue-100/50">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-3 h-4 w-4 text-gray-500" />
                <Input
                  placeholder="🔍 Cari item..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 bg-white/80 backdrop-blur-sm border-gray-200 focus:border-blue-400 focus:ring-blue-400 transition-all duration-200 text-sm"
                />
              </div>
              
              <div className="flex flex-col space-y-2 sm:flex-row sm:space-y-0 sm:space-x-2">
                <Select value={filterCategory} onValueChange={setFilterCategory}>
                  <SelectTrigger className="w-full sm:w-[150px] bg-white/80 backdrop-blur-sm border-gray-200 hover:border-blue-300 transition-all duration-200 text-sm">
                    <Filter className="h-4 w-4 mr-2 text-gray-500" />
                    <SelectValue placeholder="Kategori" />
                  </SelectTrigger>
                  <SelectContent className="bg-white/95 backdrop-blur-sm">
                    {categories.map((category) => (
                      <SelectItem key={category} value={category} className="text-sm">
                        {category === "all" ? "Semua Kategori" : category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={sortOrder} onValueChange={setSortOrder}>
                  <SelectTrigger className="w-full sm:w-[150px] bg-white/80 backdrop-blur-sm border-gray-200 hover:border-blue-300 transition-all duration-200 text-sm">
                    <SelectValue placeholder="Urutan" />
                  </SelectTrigger>
                  <SelectContent className="bg-white/95 backdrop-blur-sm">
                    <SelectItem value="name-asc" className="text-sm">Nama A-Z</SelectItem>
                    <SelectItem value="name-desc" className="text-sm">Nama Z-A</SelectItem>
                    <SelectItem value="quantity-asc" className="text-sm">Stok ↗</SelectItem>
                    <SelectItem value="quantity-desc" className="text-sm">Stok ↘</SelectItem>
                    <SelectItem value="price-asc" className="text-sm">Harga ↗</SelectItem>
                    <SelectItem value="price-desc" className="text-sm">Harga ↘</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          
          <CardContent>
            {/* Mobile Card Layout - Enhanced */}
            <div className="block sm:hidden space-y-3">
              {filteredInventory.length === 0 ? (
                <div className="text-center py-12">
                  <Package className="h-16 w-16 mx-auto text-gray-300 mb-4" />
                  <p className="text-gray-500 font-medium">Tidak ada item yang ditemukan</p>
                  <p className="text-sm text-gray-400 mt-1">Coba ubah filter atau tambah item baru</p>
                </div>
              ) : (
                filteredInventory.map((item) => (
                  <div key={item.id} className="border rounded-xl p-4 bg-white shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-gray-900 truncate text-sm">{item.name}</h3>
                        <p className="text-xs text-gray-500 truncate">{item.category}</p>
                        {item.barcode && (
                          <p className="text-xs font-mono text-gray-400 mt-1">{item.barcode}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 ml-2">
                        <Badge 
                          variant={item.quantity <= item.minStock ? "destructive" : "default"} 
                          className="text-xs px-2 py-1"
                        >
                          {item.quantity}
                        </Badge>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3 text-xs mb-3">
                      <div>
                        <span className="text-gray-500 block">Harga:</span>
                        <p className="font-semibold text-emerald-600">Rp {item.price.toLocaleString()}</p>
                      </div>
                      <div>
                        <span className="text-gray-500 block">Lokasi:</span>
                        <p className="font-medium truncate">{item.location || "-"}</p>
                      </div>
                    </div>
                    
                    <div className="flex justify-between items-center">
                      <div className="flex space-x-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="px-2 py-1 h-8 text-xs"
                          onClick={() => setViewingItem({
                            ...item,
                            barcode: item.barcode ?? "",
                            supplier: item.supplier ?? "",
                          })}
                        >
                          <Eye className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="px-2 py-1 h-8 text-xs"
                          onClick={() => setEditingItem({
                            ...item,
                            barcode: item.barcode ?? "",
                            supplier: item.supplier ?? "",
                          })}
                        >
                          <Edit className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          className="px-2 py-1 h-8 text-xs"
                          onClick={() => deleteInventoryItem(item.id, item.name)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                      
                      <div className="flex space-x-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="px-2 py-1 h-8 text-xs bg-emerald-50 hover:bg-emerald-100 border-emerald-200"
                          onClick={() => setStockAdjustment({
                            itemId: item.id,
                            itemName: item.name,
                            currentQuantity: item.quantity,
                            type: "add",
                            amount: 1,
                          })}
                        >
                          <Plus className="h-3 w-3 text-emerald-600" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="px-2 py-1 h-8 text-xs bg-red-50 hover:bg-red-100 border-red-200"
                          onClick={() => setStockAdjustment({
                            itemId: item.id,
                            itemName: item.name,
                            currentQuantity: item.quantity,
                            type: "subtract",
                            amount: 1,
                          })}
                          disabled={item.quantity <= 0}
                        >
                          <Minus className="h-3 w-3 text-red-600" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Desktop Table Layout */}
            <div className="hidden sm:block">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[200px]">Item</TableHead>
                      <TableHead className="min-w-[100px]">Kategori</TableHead>
                      <TableHead className="text-center min-w-[80px]">Stok</TableHead>
                      <TableHead className="text-right min-w-[120px]">Harga</TableHead>
                      <TableHead className="min-w-[120px]">Lokasi</TableHead>
                      <TableHead className="text-right min-w-[150px]">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredInventory.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8">
                          <Package className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                          <p className="text-gray-500">Tidak ada item yang ditemukan</p>
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredInventory.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>
                            <div>
                              <div className="font-medium">{item.name}</div>
                              <div className="text-sm text-gray-500 truncate max-w-[200px]" title={item.description}>
                                {item.description || "Tidak ada deskripsi"}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>{item.category}</TableCell>
                          <TableCell className="text-center">
                            <Badge variant={item.quantity <= item.minStock ? "destructive" : "default"}>
                              {item.quantity}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            Rp {item.price.toLocaleString()}
                          </TableCell>
                          <TableCell>{item.location}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end space-x-1">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setViewingItem({
                                  ...item,
                                  barcode: item.barcode ?? "",
                                  supplier: item.supplier ?? "",
                                })}
                                title="Lihat Detail"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setEditingItem({
                                  ...item,
                                  barcode: item.barcode ?? "",
                                  supplier: item.supplier ?? "",
                                })}
                                title="Edit Item"
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setStockAdjustment({
                                  itemId: item.id,
                                  itemName: item.name,
                                  currentQuantity: item.quantity,
                                  type: "add",
                                  amount: 1,
                                })}
                                title="Tambah Stok"
                              >
                                <Plus className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setStockAdjustment({
                                  itemId: item.id,
                                  itemName: item.name,
                                  currentQuantity: item.quantity,
                                  type: "subtract",
                                  amount: 1,
                                })}
                                title="Kurangi Stok"
                                disabled={item.quantity <= 0}
                              >
                                <Minus className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => deleteInventoryItem(item.id, item.name)}
                                title="Hapus Item"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Add Item Dialog */}
        <Dialog open={isAddItemOpen} onOpenChange={setIsAddItemOpen}>
          <DialogContent className="sm:max-w-[600px] max-h-[90vh] flex flex-col">
            <DialogHeader className="flex-shrink-0">
              <DialogTitle>Tambah Item Baru</DialogTitle>
              <DialogDescription>Masukkan detail item inventaris baru.</DialogDescription>
            </DialogHeader>
            
            {/* Scrollable form content */}
            <div className="flex-1 overflow-y-auto px-1">
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-2 sm:gap-4">
                  <Label htmlFor="barcode" className="sm:text-right">Barcode</Label>
                  <Input 
                    id="barcode" 
                    value={newItem.barcode} 
                    onChange={(e) => setNewItem({ ...newItem, barcode: e.target.value })} 
                    className="sm:col-span-3" 
                    placeholder="Scan atau ketik barcode"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-2 sm:gap-4">
                  <Label htmlFor="name" className="sm:text-right">Nama *</Label>
                  <Input 
                    id="name" 
                    value={newItem.name} 
                    onChange={(e) => setNewItem({ ...newItem, name: e.target.value })} 
                    className="sm:col-span-3" 
                    placeholder="Contoh: Coca Cola 330ml"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-2 sm:gap-4">
                  <Label htmlFor="description" className="sm:text-right">Deskripsi</Label>
                  <Input 
                    id="description" 
                    value={newItem.description} 
                    onChange={(e) => setNewItem({ ...newItem, description: e.target.value })} 
                    className="sm:col-span-3" 
                    placeholder="Detail singkat mengenai item"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-2 sm:gap-4">
                  <Label htmlFor="category" className="sm:text-right">Kategori</Label>
                  <Input 
                    id="category" 
                    value={newItem.category} 
                    onChange={(e) => setNewItem({ ...newItem, category: e.target.value })} 
                    className="sm:col-span-3" 
                    placeholder="Contoh: Minuman"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-2 sm:gap-4">
                  <Label htmlFor="quantity" className="sm:text-right">Kuantitas</Label>
                  <Input 
                    id="quantity" 
                    type="number" 
                    value={newItem.quantity} 
                    onChange={(e) => setNewItem({ ...newItem, quantity: parseInt(e.target.value) || 0 })} 
                    className="sm:col-span-3" 
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-2 sm:gap-4">
                  <Label htmlFor="minStock" className="sm:text-right">Stok Min.</Label>
                  <Input 
                    id="minStock" 
                    type="number" 
                    value={newItem.minStock} 
                    onChange={(e) => setNewItem({ ...newItem, minStock: parseInt(e.target.value) || 0 })} 
                    className="sm:col-span-3" 
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-2 sm:gap-4">
                  <Label htmlFor="price" className="sm:text-right">Harga (Rp)</Label>
                  <Input 
                    id="price" 
                    type="number" 
                    value={newItem.price} 
                    onChange={(e) => setNewItem({ ...newItem, price: parseFloat(e.target.value) || 0 })} 
                    className="sm:col-span-3"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-2 sm:gap-4">
                  <Label htmlFor="supplier" className="sm:text-right">Pemasok</Label>
                  <Input 
                    id="supplier" 
                    value={newItem.supplier} 
                    onChange={(e) => setNewItem({ ...newItem, supplier: e.target.value })} 
                    className="sm:col-span-3" 
                    placeholder="Nama pemasok"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-2 sm:gap-4">
                  <Label htmlFor="location" className="sm:text-right">Lokasi</Label>
                  <Input 
                    id="location" 
                    value={newItem.location} 
                    onChange={(e) => setNewItem({ ...newItem, location: e.target.value })} 
                    className="sm:col-span-3" 
                    placeholder="Contoh: Rak A1"
                  />
                </div>
              </div>
            </div>
            
            {/* Fixed footer with buttons */}
            <DialogFooter className="flex-shrink-0 bg-white border-t pt-4 mt-4">
              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-2 w-full">
                <Button 
                  variant="outline" 
                  onClick={() => setIsAddItemOpen(false)}
                  className="w-full sm:w-auto"
                >
                  Batal
                </Button>
                <Button 
                  onClick={addInventoryItem}
                  className="w-full sm:w-auto"
                >
                  Simpan Item
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Item Dialog */}
        <Dialog open={!!editingItem} onOpenChange={() => setEditingItem(null)}>
          <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Item</DialogTitle>
              <DialogDescription>Perbarui informasi item inventaris.</DialogDescription>
            </DialogHeader>
            {editingItem && (
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="edit-barcode" className="text-right">
                    Barcode
                  </Label>
                  <Input
                    id="edit-barcode"
                    value={editingItem.barcode ?? ""}
                    onChange={(e) => setEditingItem({ ...editingItem, barcode: e.target.value })}
                    className="col-span-3"
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="edit-name" className="text-right">
                    Nama Item
                  </Label>
                  <Input
                    id="edit-name"
                    value={editingItem.name}
                    onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })}
                    className="col-span-3"
                  />
                </div>
                 <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="edit-description" className="text-right">Deskripsi</Label>
                  <Input id="edit-description" value={editingItem.description} onChange={(e) => setEditingItem({ ...editingItem, description: e.target.value })} className="col-span-3"/>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="edit-category" className="text-right">Kategori</Label>
                  <Input id="edit-category" value={editingItem.category} onChange={(e) => setEditingItem({ ...editingItem, category: e.target.value })} className="col-span-3"/>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="edit-quantity" className="text-right">Kuantitas</Label>
                  <Input id="edit-quantity" type="number" value={editingItem.quantity} onChange={(e) => setEditingItem({ ...editingItem, quantity: parseInt(e.target.value) || 0 })} className="col-span-3"/>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="edit-minStock" className="text-right">Stok Min.</Label>
                  <Input id="edit-minStock" type="number" value={editingItem.minStock} onChange={(e) => setEditingItem({ ...editingItem, minStock: parseInt(e.target.value) || 0 })} className="col-span-3"/>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="edit-price" className="text-right">Harga (Rp)</Label>
                  <Input id="edit-price" type="number" value={editingItem.price} onChange={(e) => setEditingItem({ ...editingItem, price: parseFloat(e.target.value) || 0 })} className="col-span-3"/>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="edit-supplier" className="text-right">Pemasok</Label>
                  <Input id="edit-supplier" value={editingItem.supplier ?? ""} onChange={(e) => setEditingItem({ ...editingItem, supplier: e.target.value })} className="col-span-3"/>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="edit-location" className="text-right">Lokasi</Label>
                  <Input id="edit-location" value={editingItem.location} onChange={(e) => setEditingItem({ ...editingItem, location: e.target.value })} className="col-span-3"/>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingItem(null)}>Batal</Button>
              <Button onClick={updateInventoryItem}>Simpan Perubahan</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* View Item Dialog */}
        <Dialog open={!!viewingItem} onOpenChange={() => setViewingItem(null)}>
          <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Detail Item</DialogTitle>
            </DialogHeader>
            {viewingItem && (
              <div className="space-y-4 py-4">
                <div className="flex justify-center mb-4">
                  {viewingItem.barcode ? (
                    <BarcodeComponent value={viewingItem.barcode} height={60} displayValue={false} />
                  ) : (
                    <p className="text-gray-500">Tidak ada barcode</p>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
                  <div>
                    <Label className="text-sm font-medium text-gray-500">Nama Item</Label>
                    <p className="text-lg font-semibold">{viewingItem.name}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-gray-500">Kategori</Label>
                    <p>{viewingItem.category}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-gray-500">Stok Saat Ini</Label>
                    <p className="text-2xl font-bold text-blue-600">{viewingItem.quantity}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-gray-500">Stok Minimum</Label>
                    <p>{viewingItem.minStock}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-gray-500">Harga</Label>
                    <p className="text-lg font-semibold">Rp {viewingItem.price.toLocaleString()}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-gray-500">Barcode</Label>
                    <p className="font-mono">{viewingItem.barcode || "-"}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-gray-500">Pemasok</Label>
                    <p>{viewingItem.supplier || "-"}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-gray-500">Lokasi</Label>
                    <p>{viewingItem.location || "-"}</p>
                  </div>
                </div>
                <div className="pt-2 border-t">
                  <Label className="text-sm font-medium text-gray-500">Deskripsi</Label>
                  <p className="whitespace-pre-wrap">{viewingItem.description || "Tidak ada deskripsi."}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-500">Total Nilai Stok Item Ini</Label>
                  <p className="text-xl font-bold text-blue-600">
                    Rp {(viewingItem.quantity * viewingItem.price).toLocaleString()}
                  </p>
                </div>
                {viewingItem.lastUpdated && (
                  <div>
                    <Label className="text-sm font-medium text-gray-500">Update Terakhir</Label>
                    <p>{new Date(viewingItem.lastUpdated).toLocaleString()}</p>
                  </div>
                )}
              </div>
            )}
            <DialogFooter>
              <Button onClick={() => setViewingItem(null)}>Tutup</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Stock Adjustment Dialog */}
        <Dialog open={!!stockAdjustment} onOpenChange={() => setStockAdjustment(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                {stockAdjustment?.type === "add" ? "Tambah" : "Kurangi"} Stok: {stockAdjustment?.itemName}
              </DialogTitle>
              <DialogDescription>
                Stok saat ini: {stockAdjustment?.currentQuantity}. Masukkan jumlah untuk penyesuaian.
              </DialogDescription>
            </DialogHeader>
            {stockAdjustment && (
              <div className="py-4">
                <Label htmlFor="adjustment-amount">Jumlah</Label>
                <Input
                  id="adjustment-amount"
                  type="number"
                  min="1"
                  value={stockAdjustment.amount}
                  onChange={(e) =>
                    setStockAdjustment({
                      ...stockAdjustment,
                      amount: parseInt(e.target.value) || 1,
                    })
                  }
                />
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setStockAdjustment(null)}>Batal</Button>
              <Button onClick={handleStockAdjustment}>
                {stockAdjustment?.type === "add" ? "Tambah Stok" : "Kurangi Stok"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
