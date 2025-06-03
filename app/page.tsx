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
      (d) => d.lastSeen && Date.now() - new Date(d.lastSeen).getTime() < 30 * 1000 // Ubah dari 5 menit ke 30 detik
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


  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8 text-center md:text-left">
          <h1 className="text-4xl font-bold text-gray-900">📦 Dashboard Inventaris</h1>
          <p className="text-gray-600">Kelola stok barang dengan mudah dan efisien</p>
        </div>

        <Alert className={`mb-6 ${firebaseStatus.available ? "border-green-500 bg-green-50" : "border-yellow-500 bg-yellow-50"}`}>
          {firebaseStatus.available ? (
            <Wifi className="h-4 w-4 text-green-600" />
          ) : (
            <WifiOff className="h-4 w-4 text-yellow-600" />
          )}
          <AlertDescription>
            <strong>Status Koneksi Backend:</strong>{" "}
            {firebaseStatus.available ? "Terhubung (Real-time sync aktif)" : "Tidak terhubung ke Firebase"}
          </AlertDescription>
        </Alert>

        {(inventoryError || scansError || devicesError) && (
          <Alert variant="destructive" className="mb-6 border-red-500 bg-red-50">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>Error:</strong> {inventoryError || scansError || devicesError || "Gagal memuat data."}
            </AlertDescription>
          </Alert>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Item</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalItems}</div>
              <p className="text-xs text-muted-foreground">Jenis barang unik</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Nilai</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">Rp {totalValue.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">Nilai inventaris saat ini</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Stok Rendah</CardTitle>
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{lowStockItems.length}</div>
              <p className="text-xs text-muted-foreground">Item perlu diisi ulang</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pemindai Aktif</CardTitle>
              <Scan className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{onlineDevices}</div>
              <p className="text-xs text-muted-foreground">Perangkat ESP32 online</p>
            </CardContent>
          </Card>
           {/* Simplified ESP32 Scanner Status Card */}
           <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Status Pemindai ESP32</CardTitle>
              {onlineDevices > 0 ? <Wifi className="h-4 w-4 text-green-600" /> : <WifiOff className="h-4 w-4 text-red-600" />}
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${onlineDevices > 0 ? 'text-green-600' : 'text-red-600'}`}>
                {onlineDevices > 0 ? "Terhubung" : "Terputus"}
              </div>
              <p className="text-xs text-muted-foreground">
                {onlineDevices > 0 ? `${onlineDevices} perangkat aktif terdeteksi` : "Tidak ada perangkat aktif"}
              </p>
              <Button 
                variant="outline" 
                size="sm" 
                className="mt-3 w-full" 
                onClick={() => router.push('/pengaturan?tab=devices')}
              >
                <Settings className="mr-2 h-4 w-4" />
                Kelola Perangkat
              </Button>
            </CardContent>
          </Card>
        </div>

        {lowStockItems.length > 0 && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>Perhatian Stok Rendah:</strong> {lowStockItems.length} item perlu segera diisi ulang.
              <ul className="list-disc list-inside ml-4 mt-1">
                {lowStockItems.slice(0, 5).map(item => <li key={item.id}>{item.name} (Sisa: {item.quantity})</li>)}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {/* Inventory Table and Controls */}
        <Card>
          <CardHeader>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <CardTitle>Daftar Inventaris ({filteredInventory.length})</CardTitle>
              <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
                <Button onClick={() => setIsAddItemOpen(true)} className="w-full sm:w-auto">
                  <Plus className="mr-2 h-4 w-4" /> Tambah Item
                </Button>
                <Button variant="outline" onClick={exportToCSV} className="w-full sm:w-auto">
                  <Download className="mr-2 h-4 w-4" /> Export CSV
                </Button>
              </div>
            </div>
            <div className="mt-4 flex flex-col md:flex-row gap-4">
              <div className="relative flex-grow">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cari item (nama, barcode, kategori...)"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 w-full"
                />
              </div>
              <div className="flex gap-4">
                <Select value={filterCategory} onValueChange={setFilterCategory}>
                  <SelectTrigger className="w-full md:w-[180px]">
                    <SelectValue placeholder="Filter Kategori" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat === "all" ? "Semua Kategori" : cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={sortOrder} onValueChange={setSortOrder}>
                  <SelectTrigger className="w-full md:w-[180px]">
                    <SelectValue placeholder="Urutkan" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="name-asc">Nama (A-Z)</SelectItem>
                    <SelectItem value="name-desc">Nama (Z-A)</SelectItem>
                    <SelectItem value="quantity-asc">Stok (Sedikit-Banyak)</SelectItem>
                    <SelectItem value="quantity-desc">Stok (Banyak-Sedikit)</SelectItem>
                    <SelectItem value="price-asc">Harga (Murah-Mahal)</SelectItem>
                    <SelectItem value="price-desc">Harga (Mahal-Murah)</SelectItem>
                    <SelectItem value="category-asc">Kategori (A-Z)</SelectItem>
                    <SelectItem value="category-desc">Kategori (Z-A)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {filteredInventory.length === 0 ? (
                <div className="text-center py-8">
                  <Package className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                  <p className="text-gray-500">
                    {inventory.length === 0 ? "Belum ada item dalam inventaris" : "Tidak ada item yang sesuai dengan pencarian"}
                  </p>
                </div>
              ) : (
                filteredInventory.map((item) => (
                  <div key={item.id} className="border rounded-lg p-4 bg-white shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-2">
                          <h3 className="font-semibold text-lg text-blue-700">{item.name}</h3>
                          <Badge variant={item.quantity <= item.minStock ? "destructive" : "secondary"}>
                            Stok: {item.quantity} / Min: {item.minStock}
                          </Badge>
                          <Badge variant="outline">{item.category}</Badge>
                        </div>
                        <p className="text-sm text-gray-600 mb-1 truncate" title={item.description}>{item.description || "Tidak ada deskripsi"}</p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-sm text-gray-500">
                          <span>
                            <strong>Barcode:</strong> {item.barcode || "-"}
                          </span>
                          <span>
                            <strong>Harga:</strong> Rp {item.price.toLocaleString()}
                          </span>
                          <span>
                            <strong>Lokasi:</strong> {item.location}
                          </span>
                          <span>
                            <strong>Pemasok:</strong> {item.supplier || "-"}
                          </span>
                           {item.lastUpdated && (
                            <span className="col-span-2 sm:col-span-1">
                                <strong>Update:</strong> {new Date(item.lastUpdated).toLocaleDateString()}
                            </span>
                           )}
                        </div>
                      </div>
                      <div className="flex flex-col gap-2 ml-0 md:ml-4 pt-2 md:pt-0 border-t md:border-t-0 md:border-l md:pl-4">
                        <div className="flex gap-1 flex-wrap justify-start md:justify-end">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              setViewingItem({
                                ...item,
                                barcode: item.barcode ?? "",
                                supplier: item.supplier ?? "",
                              })
                            }
                            title="Lihat Detail"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              setEditingItem({
                                ...item,
                                barcode: item.barcode ?? "",
                                supplier: item.supplier ?? "",
                              })
                            }
                            title="Edit Item"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="destructive"
                            // outline // This is not a valid prop for Button, should be variant="outline" + custom destructive styling or just variant="destructive"
                            size="sm"
                            onClick={() => deleteInventoryItem(item.id, item.name)}
                            title="Hapus Item"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="flex gap-1 mt-1 flex-wrap justify-start md:justify-end">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              setStockAdjustment({
                                itemId: item.id,
                                itemName: item.name,
                                currentQuantity: item.quantity,
                                type: "add",
                                amount: 1,
                              })
                            }
                            title="Tambah Stok"
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              setStockAdjustment({
                                itemId: item.id,
                                itemName: item.name,
                                currentQuantity: item.quantity,
                                type: "subtract",
                                amount: 1,
                              })
                            }
                            title="Kurangi Stok"
                          >
                            <Minus className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Add Item Dialog */}
        <Dialog open={isAddItemOpen} onOpenChange={setIsAddItemOpen}>
          <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Tambah Item Baru</DialogTitle>
              <DialogDescription>Masukkan detail item inventaris baru.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              {/* Fields: Barcode, Name, Description, Category, Quantity, MinStock, Price, Supplier, Location */}
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="barcode" className="text-right">Barcode</Label>
                <Input id="barcode" value={newItem.barcode ?? ""} onChange={(e) => setNewItem({ ...newItem, barcode: e.target.value })} className="col-span-3" placeholder="Contoh: 1234567890123"/>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="name" className="text-right">Nama Item</Label>
                <Input id="name" value={newItem.name} onChange={(e) => setNewItem({ ...newItem, name: e.target.value })} className="col-span-3" placeholder="Contoh: Kopi Sachet ABC"/>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="description" className="text-right">Deskripsi</Label>
                <Input id="description" value={newItem.description} onChange={(e) => setNewItem({ ...newItem, description: e.target.value })} className="col-span-3" placeholder="Detail singkat mengenai item"/>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="category" className="text-right">Kategori</Label>
                <Input id="category" value={newItem.category} onChange={(e) => setNewItem({ ...newItem, category: e.target.value })} className="col-span-3" placeholder="Contoh: Minuman"/>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="quantity" className="text-right">Kuantitas</Label>
                <Input id="quantity" type="number" value={newItem.quantity} onChange={(e) => setNewItem({ ...newItem, quantity: parseInt(e.target.value) || 0 })} className="col-span-3" />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="minStock" className="text-right">Stok Min.</Label>
                <Input id="minStock" type="number" value={newItem.minStock} onChange={(e) => setNewItem({ ...newItem, minStock: parseInt(e.target.value) || 0 })} className="col-span-3" />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="price" className="text-right">Harga (Rp)</Label>
                <Input id="price" type="number" value={newItem.price} onChange={(e) => setNewItem({ ...newItem, price: parseFloat(e.target.value) || 0 })} className="col-span-3" />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="supplier" className="text-right">Pemasok</Label>
                <Input id="supplier" value={newItem.supplier ?? ""} onChange={(e) => setNewItem({ ...newItem, supplier: e.target.value })} className="col-span-3" placeholder="Nama supplier (opsional)"/>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="location" className="text-right">Lokasi</Label>
                <Input id="location" value={newItem.location} onChange={(e) => setNewItem({ ...newItem, location: e.target.value })} className="col-span-3" placeholder="Contoh: Rak A1"/>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddItemOpen(false)}>Batal</Button>
              <Button onClick={addInventoryItem}>Simpan Item</Button>
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
