"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  AlertCircle,
  Package,
  Scan,
  TrendingUp,
  Plus,
  Edit,
  Trash2,
  Search,
  QrCode,
  Minus,
  Eye,
  Wifi,
  WifiOff,
} from "lucide-react"
import Barcode from "react-barcode"

import QRCodeGenerator from "@/components/qr-code-generator"
import { useFirebaseInventory, useFirebaseScans, useFirebaseDevices } from "@/hooks/use-firebase"
import { toast } from "@/hooks/use-toast"
import { getFirebaseStatus } from "@/lib/firebase"
import { ScanHistory } from "@/components/scan-history"

interface InventoryItem {
  id: string
  barcode: string
  name: string
  description: string
  category: string
  quantity: number
  minStock: number
  price: number
  supplier: string
  location: string
  lastUpdated?: number
}

export default function TransaksiPage() {
  const {
    items: inventory,
    loading: inventoryLoading,
    error: inventoryError,
    addItem,
    updateItem,
    deleteItem,
    isConfigured,
  } = useFirebaseInventory()
  const { scans, loading: scansLoading } = useFirebaseScans()
  const { devices, loading: devicesLoading } = useFirebaseDevices()

  const [searchTerm, setSearchTerm] = useState("")
  const [selectedCategory, setSelectedCategory] = useState("all")
  const [isAddItemOpen, setIsAddItemOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null)
  const [viewingItem, setViewingItem] = useState<InventoryItem | null>(null)
  const [isQRDialogOpen, setIsQRDialogOpen] = useState(false)
  const [qrValue, setQrValue] = useState("")
  const [stockAdjustment, setStockAdjustment] = useState<{
    item: InventoryItem
    type: "add" | "remove"
    amount: number
  } | null>(null)

  const [newItem, setNewItem] = useState({
    barcode: "",
    name: "",
    description: "",
    category: "",
    quantity: 0,
    minStock: 5,
    price: 0,
    supplier: "",
    location: "",
  })

  // Get Firebase status
  const firebaseStatus = getFirebaseStatus()

  // Show loading state
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

    // Check if barcode already exists
    const existingItem = inventory.find((item) => item.barcode === newItem.barcode)
    if (existingItem) {
      toast({
        title: "Barcode Sudah Ada",
        description: `Barcode ${newItem.barcode} sudah digunakan untuk ${existingItem.name}`,
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

  const adjustStock = async () => {
    if (!stockAdjustment) return

    const { item, type, amount } = stockAdjustment
    const newQuantity = type === "add" ? item.quantity + amount : item.quantity - amount

    if (newQuantity < 0) {
      toast({
        title: "Error",
        description: "Stok tidak boleh kurang dari 0",
        variant: "destructive",
      })
      return
    }

    try {
      await updateItem(item.id, { ...item, quantity: newQuantity })
      setStockAdjustment(null)
      toast({
        title: "Berhasil",
        description: `Stok ${type === "add" ? "ditambah" : "dikurangi"} sebanyak ${amount}`,
      })
    } catch (error) {
      toast({
        title: "Error",
        description: "Gagal mengubah stok",
        variant: "destructive",
      })
    }
  }

  const generateQRCode = (item: InventoryItem) => {
    const qrData = JSON.stringify({
      barcode: item.barcode,
      name: item.name,
      id: item.id,
    })
    setQrValue(qrData)
    setIsQRDialogOpen(true)
  }

  const filteredInventory = inventory.filter((item) => {
    const matchesSearch =
      item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.barcode ?? "").includes(searchTerm) ||
      item.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.supplier ?? "").toLowerCase().includes(searchTerm.toLowerCase())
    const matchesCategory = selectedCategory === "all" || item.category === selectedCategory
    return matchesSearch && matchesCategory
  })

  const categories = [...new Set(inventory.map((item) => item.category))].filter(Boolean)
  const lowStockItems = inventory.filter((item) => item.quantity <= item.minStock)
  const totalValue = inventory.reduce((sum, item) => sum + item.quantity * item.price, 0)
  const totalItems = inventory.reduce((sum, item) => sum + item.quantity, 0)
  const onlineDevices = devices.filter((d) => d.status === "online").length

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold text-gray-900">📦 Dashboard Inventaris</h1>
          <p className="text-gray-600">Kelola stok barang dengan mudah dan efisien</p>
        </div>

        {/* Connection Status */}
        <Alert className={firebaseStatus.available ? "border-green-500 bg-green-50" : "border-yellow-500 bg-yellow-50"}>
          {firebaseStatus.available ? (
            <Wifi className="h-4 w-4 text-green-600" />
          ) : (
            <WifiOff className="h-4 w-4 text-yellow-600" />
          )}
          <AlertDescription>
            <div className="flex items-center justify-between">
              <div>
                <strong>Status Koneksi:</strong>{" "}
                {firebaseStatus.available ? (
                  <span className="text-green-700">Terhubung ke Firebase (Real-time sync aktif)</span>
                ) : (
                  <span className="text-yellow-700">Mode Offline (Data disimpan lokal)</span>
                )}
              </div>
              <Badge variant={firebaseStatus.available ? "default" : "secondary"}>
                {firebaseStatus.available ? "Online" : "Offline"}
              </Badge>
            </div>
          </AlertDescription>
        </Alert>

        {/* Show errors if any */}
        {inventoryError && (
          <Alert className="border-red-500 bg-red-50">
            <AlertCircle className="h-4 w-4 text-red-600" />
            <AlertDescription>
              <p className="font-medium text-red-800">Kesalahan Memuat Data: {inventoryError}</p>
            </AlertDescription>
          </Alert>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Item</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalItems.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">{inventory.length} produk unik</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Nilai</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
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
        </div>

        {/* Low Stock Alert */}
        {lowStockItems.length > 0 && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>{lowStockItems.length} item</strong> kehabisan stok dan perlu diisi ulang:
              <div className="mt-2 flex flex-wrap gap-2">
                {lowStockItems.slice(0, 5).map((item) => (
                  <Badge key={item.id} variant="destructive" className="text-xs">
                    {item.name} ({item.quantity})
                  </Badge>
                ))}
                {lowStockItems.length > 5 && (
                  <Badge variant="outline" className="text-xs">
                    +{lowStockItems.length - 5} lainnya
                  </Badge>
                )}
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Inventory Management */}
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
              <div>
                <CardTitle>Manajemen Inventaris</CardTitle>
                <CardDescription>Kelola stok barang, harga, dan informasi produk</CardDescription>
              </div>
              <Dialog open={isAddItemOpen} onOpenChange={setIsAddItemOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Tambah Item
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Tambah Item Baru</DialogTitle>
                    <DialogDescription>Tambahkan item baru ke inventaris Anda.</DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="barcode" className="text-right">
                        Barcode *
                      </Label>
                      <Input
                        id="barcode"
                        value={newItem.barcode}
                        onChange={(e) => setNewItem({ ...newItem, barcode: e.target.value })}
                        className="col-span-3"
                        placeholder="1234567890123"
                      />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="name" className="text-right">
                        Nama *
                      </Label>
                      <Input
                        id="name"
                        value={newItem.name}
                        onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                        className="col-span-3"
                        placeholder="Nama produk"
                      />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="description" className="text-right">
                        Deskripsi
                      </Label>
                      <Textarea
                        id="description"
                        value={newItem.description}
                        onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                        className="col-span-3"
                        placeholder="Deskripsi produk"
                        rows={2}
                      />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="category" className="text-right">
                        Kategori
                      </Label>
                      <Input
                        id="category"
                        value={newItem.category}
                        onChange={(e) => setNewItem({ ...newItem, category: e.target.value })}
                        className="col-span-3"
                        placeholder="Elektronik, Furnitur, dll."
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="quantity" className="text-right col-span-2">
                          Kuantitas
                        </Label>
                        <Input
                          id="quantity"
                          type="number"
                          min="0"
                          value={newItem.quantity}
                          onChange={(e) => setNewItem({ ...newItem, quantity: Number.parseInt(e.target.value) || 0 })}
                          className="col-span-2"
                        />
                      </div>
                      <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="minStock" className="text-right col-span-2">
                          Stok Minimum
                        </Label>
                        <Input
                          id="minStock"
                          type="number"
                          min="0"
                          value={newItem.minStock}
                          onChange={(e) => setNewItem({ ...newItem, minStock: Number.parseInt(e.target.value) || 0 })}
                          className="col-span-2"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="price" className="text-right">
                        Harga (Rp)
                      </Label>
                      <Input
                        id="price"
                        type="number"
                        min="0"
                        value={newItem.price}
                        onChange={(e) => setNewItem({ ...newItem, price: Number.parseFloat(e.target.value) || 0 })}
                        className="col-span-3"
                        placeholder="15000000"
                      />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="supplier" className="text-right">
                        Pemasok
                      </Label>
                      <Input
                        id="supplier"
                        value={newItem.supplier}
                        onChange={(e) => setNewItem({ ...newItem, supplier: e.target.value })}
                        className="col-span-3"
                        placeholder="Nama pemasok"
                      />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="location" className="text-right">
                        Lokasi
                      </Label>
                      <Input
                        id="location"
                        value={newItem.location}
                        onChange={(e) => setNewItem({ ...newItem, location: e.target.value })}
                        className="col-span-3"
                        placeholder="Gudang A-1"
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsAddItemOpen(false)}>
                      Batal
                    </Button>
                    <Button onClick={addInventoryItem}>Tambah Item</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Search and Filter */}
            <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
              <div className="flex gap-2 flex-1 w-full">
                <div className="relative flex-1">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Cari nama, barcode, atau pemasok..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-8"
                  />
                </div>
                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Kategori" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Kategori</SelectItem>
                    {categories.map((category) => (
                      <SelectItem key={category} value={category}>
                        {category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Inventory List */}
            <div className="grid gap-4">
              {filteredInventory.length === 0 ? (
                <div className="text-center py-8">
                  <Package className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                  <p className="text-gray-500">
                    {inventory.length === 0 ? "Belum ada item inventaris" : "Tidak ada item yang sesuai filter"}
                  </p>
                  <p className="text-sm text-gray-400">
                    {inventory.length === 0
                      ? "Tambahkan item pertama Anda untuk memulai"
                      : "Coba ubah kata kunci pencarian atau filter kategori"}
                  </p>
                </div>
              ) : (
                filteredInventory.map((item) => (
                  <Card key={item.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="space-y-2 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-semibold text-lg">{item.name}</h3>
                            <Badge variant={item.quantity <= item.minStock ? "destructive" : "secondary"}>
                              {item.quantity} stok
                            </Badge>
                            {item.category && <Badge variant="outline">{item.category}</Badge>}
                            {item.quantity <= item.minStock && (
                              <Badge variant="destructive" className="animate-pulse">
                                Stok Rendah
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">{item.description}</p>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm text-muted-foreground">
                            <span>
                              <strong>Barcode:</strong>
                              <span className="font-mono text-xs">{item.barcode}</span>
                              <div className="bg-white p-1 rounded border inline-block mt-1">
                                <Barcode
                                  value={item.barcode ?? ""}
                                  format="CODE128"
                                  width={1.5}
                                  height={40}
                                  displayValue={false}
                                  background="#fff"
                                  lineColor="#000"
                                />
                              </div>
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
                          </div>
                        </div>
                        <div className="flex flex-col gap-2 ml-4">
                          <div className="flex gap-1">
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
                              onClick={() => generateQRCode({ ...item, barcode: item.barcode ?? "", supplier: item.supplier ?? "" })}
                              title="Generate QR Code"
                            >
                              <QrCode className="h-4 w-4" />
                            </Button>
                          </div>
                          <div className="flex gap-1">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setStockAdjustment({ item: { ...item, barcode: item.barcode ?? "", supplier: item.supplier ?? "" }, type: "add", amount: 1 })}
                              title="Tambah Stok"
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setStockAdjustment({ item: { ...item, barcode: item.barcode ?? "", supplier: item.supplier ?? "" }, type: "remove", amount: 1 })}
                              title="Kurangi Stok"
                            >
                              <Minus className="h-4 w-4" />
                            </Button>
                          </div>
                          <div className="flex gap-1">
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
                              variant="outline"
                              size="sm"
                              onClick={() => deleteInventoryItem(item.id, item.name)}
                              title="Hapus Item"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Edit Item Dialog */}
        <Dialog open={!!editingItem} onOpenChange={() => setEditingItem(null)}>
          <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
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
                    value={editingItem.barcode}
                    onChange={(e) => setEditingItem({ ...editingItem, barcode: e.target.value })}
                    className="col-span-3"
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="edit-name" className="text-right">
                    Nama
                  </Label>
                  <Input
                    id="edit-name"
                    value={editingItem.name}
                    onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })}
                    className="col-span-3"
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="edit-description" className="text-right">
                    Deskripsi
                  </Label>
                  <Textarea
                    id="edit-description"
                    value={editingItem.description}
                    onChange={(e) => setEditingItem({ ...editingItem, description: e.target.value })}
                    className="col-span-3"
                    rows={2}
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="edit-category" className="text-right">
                    Kategori
                  </Label>
                  <Input
                    id="edit-category"
                    value={editingItem.category}
                    onChange={(e) => setEditingItem({ ...editingItem, category: e.target.value })}
                    className="col-span-3"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="edit-quantity" className="text-right col-span-2">
                      Kuantitas
                    </Label>
                    <Input
                      id="edit-quantity"
                      type="number"
                      min="0"
                      value={editingItem.quantity}
                      onChange={(e) =>
                        setEditingItem({ ...editingItem, quantity: Number.parseInt(e.target.value) || 0 })
                      }
                      className="col-span-2"
                    />
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="edit-minStock" className="text-right col-span-2">
                      Stok Minimum
                    </Label>
                    <Input
                      id="edit-minStock"
                      type="number"
                      min="0"
                      value={editingItem.minStock}
                      onChange={(e) =>
                        setEditingItem({ ...editingItem, minStock: Number.parseInt(e.target.value) || 0 })
                      }
                      className="col-span-2"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="edit-price" className="text-right">
                    Harga (Rp)
                  </Label>
                  <Input
                    id="edit-price"
                    type="number"
                    min="0"
                    value={editingItem.price}
                    onChange={(e) => setEditingItem({ ...editingItem, price: Number.parseFloat(e.target.value) || 0 })}
                    className="col-span-3"
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="edit-supplier" className="text-right">
                    Pemasok
                  </Label>
                  <Input
                    id="edit-supplier"
                    value={editingItem.supplier}
                    onChange={(e) => setEditingItem({ ...editingItem, supplier: e.target.value })}
                    className="col-span-3"
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="edit-location" className="text-right">
                    Lokasi
                  </Label>
                  <Input
                    id="edit-location"
                    value={editingItem.location}
                    onChange={(e) => setEditingItem({ ...editingItem, location: e.target.value })}
                    className="col-span-3"
                  />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingItem(null)}>
                Batal
              </Button>
              <Button onClick={updateInventoryItem}>Perbarui Item</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* View Item Dialog */}
        <Dialog open={!!viewingItem} onOpenChange={() => setViewingItem(null)}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Detail Item</DialogTitle>
              <DialogDescription>Informasi lengkap item inventaris</DialogDescription>
            </DialogHeader>
            {viewingItem && (
              <div className="space-y-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium text-gray-500">Nama</Label>
                    <p className="text-lg font-semibold">{viewingItem.name}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-gray-500">Barcode</Label>
                    <p className="font-mono">{viewingItem.barcode}</p>
                  </div>
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-500">Deskripsi</Label>
                  <p>{viewingItem.description || "-"}</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium text-gray-500">Kategori</Label>
                    <p>{viewingItem.category || "-"}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-gray-500">Harga</Label>
                    <p className="text-lg font-semibold text-green-600">Rp {viewingItem.price.toLocaleString()}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium text-gray-500">Stok Saat Ini</Label>
                    <p className="text-2xl font-bold">{viewingItem.quantity}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-gray-500">Stok Minimum</Label>
                    <p className="text-lg">{viewingItem.minStock}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium text-gray-500">Pemasok</Label>
                    <p>{viewingItem.supplier || "-"}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-gray-500">Lokasi</Label>
                    <p>{viewingItem.location || "-"}</p>
                  </div>
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-500">Total Nilai</Label>
                  <p className="text-xl font-bold text-blue-600">
                    Rp {(viewingItem.quantity * viewingItem.price).toLocaleString()}
                  </p>
                </div>
                {/* Contoh menampilkan lastUpdated (jika ada) */}
                {viewingItem.lastUpdated && (
                  <span>
                    <strong>Update Terakhir:</strong>{" "}
                    {new Date(viewingItem.lastUpdated).toLocaleString()}
                  </span>
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
          <DialogContent className="sm:max-w-[400px]">
            <DialogHeader>
              <DialogTitle>{stockAdjustment?.type === "add" ? "Tambah Stok" : "Kurangi Stok"}</DialogTitle>
              <DialogDescription>
                {stockAdjustment?.type === "add" ? "Tambahkan stok untuk item ini" : "Kurangi stok untuk item ini"}
              </DialogDescription>
            </DialogHeader>
            {stockAdjustment && (
              <div className="space-y-4 py-4">
                <div>
                  <Label className="text-sm font-medium text-gray-500">Item</Label>
                  <p className="font-semibold">{stockAdjustment.item.name}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-500">Stok Saat Ini</Label>
                  <p className="text-2xl font-bold">{stockAdjustment.item.quantity}</p>
                </div>
                <div>
                  <Label htmlFor="adjustment-amount">
                    Jumlah {stockAdjustment.type === "add" ? "Penambahan" : "Pengurangan"}
                  </Label>
                  <Input
                    id="adjustment-amount"
                    type="number"
                    min="1"
                    value={stockAdjustment.amount}
                    onChange={(e) =>
                      setStockAdjustment({
                        ...stockAdjustment,
                        amount: Number.parseInt(e.target.value) || 1,
                      })
                    }
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-500">Stok Setelah Perubahan</Label>
                  <p className="text-xl font-semibold">
                    {stockAdjustment.type === "add"
                      ? stockAdjustment.item.quantity + stockAdjustment.amount
                      : stockAdjustment.item.quantity - stockAdjustment.amount}
                  </p>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setStockAdjustment(null)}>
                Batal
              </Button>
              <Button onClick={adjustStock}>{stockAdjustment?.type === "add" ? "Tambah Stok" : "Kurangi Stok"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* QR Code Dialog */}
        <Dialog open={isQRDialogOpen} onOpenChange={setIsQRDialogOpen}>
          <DialogContent className="sm:max-w-[400px]">
            <DialogHeader>
              <DialogTitle>QR Code</DialogTitle>
              <DialogDescription>QR code untuk item inventaris ini</DialogDescription>
            </DialogHeader>
            <div className="flex justify-center py-4">
              <QRCodeGenerator value={qrValue} size={200} />
            </div>
            <DialogFooter>
              <Button onClick={() => setIsQRDialogOpen(false)}>Tutup</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Scan History Card */}
        <Card>
          <CardHeader>
            <CardTitle>Riwayat Scan Terkait Transaksi</CardTitle>
          </CardHeader>
          <CardContent>
            <ScanHistory scans={scans} loading={scansLoading} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
