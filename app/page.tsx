"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import dynamic from "next/dynamic"
import { Alert, AlertDescription } from "@/components/ui/alert"
import Link from "next/link"
import { Wifi, WifiOff, AlertCircle, Plus, Download, TrendingDown } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { useFirebaseInventory, InventoryItem, useFirebaseTransactions } from "@/hooks/use-firebase"
import { useRealtimeDeviceStatus } from "@/hooks/use-realtime-device-status"
import { getFirebaseStatus, firebaseHelpers } from "@/lib/firebase"
import StatsCards from "@/components/dashboard/stats-cards"
import InventoryTable from "@/components/dashboard/inventory-table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const BarcodeComponent = dynamic(() => import("react-barcode"), {
  ssr: false,
  loading: () => <div className="h-[60px] w-48 bg-muted rounded" />,
})

interface StockAdjustment {
  itemId: string
  itemName: string
  currentQuantity: number
  type: "add" | "subtract"
  amount: number
}

export default function DashboardPage() {
  const {
    items: inventory,
    loading: inventoryLoading,
    error: inventoryError,
    addItem,
    updateItem,
    deleteItem,
  } = useFirebaseInventory()
  const { loading: scansLoading, error: scansError } = { loading: false, error: null }
  const { transactions, loading: transactionsLoading } = useFirebaseTransactions(500)

  const {
    devices,
    loading: devicesLoading,
    error: devicesError,
    onlineDevices: realtimeOnlineDevices,
    totalDevices
  } = useRealtimeDeviceStatus()

  const [isAddItemOpen, setIsAddItemOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null)
  const editBaselineQtyRef = useRef<number>(0)
  const [viewingItem, setViewingItem] = useState<InventoryItem | null>(null)
  const [stockAdjustment, setStockAdjustment] = useState<StockAdjustment | null>(null)
  const [searchTerm, setSearchTerm] = useState("")
  const [filterCategory, setFilterCategory] = useState("all")
  const [sortOrder, setSortOrder] = useState("name-asc")

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
    if (inventoryLoading || !inventory) return ["all"];
    return ["all", ...new Set(inventory.map((item) => item.category).filter(cat => typeof cat === 'string' && cat.trim() !== ''))]
  }, [inventory, inventoryLoading]);

  const filteredInventory = useMemo(() => {
    let result = [...inventory]

    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      result = result.filter(
        (item) =>
          item.name.toLowerCase().includes(term) ||
          (item.barcode && item.barcode.toLowerCase().includes(term)) ||
          (item.category && item.category.toLowerCase().includes(term)) ||
          (item.location && item.location.toLowerCase().includes(term)),
      )
    }

    // Category filter
    if (filterCategory && filterCategory !== "all") {
      result = result.filter((item) => item.category === filterCategory)
    }

    // Sort
    result.sort((a, b) => {
      switch (sortOrder) {
        case "name-asc":
          return a.name.localeCompare(b.name)
        case "name-desc":
          return b.name.localeCompare(a.name)
        case "quantity-asc":
          return b.quantity - a.quantity
        case "quantity-desc":
          return a.quantity - b.quantity
        case "price-asc":
          return a.price - b.price
        case "price-desc":
          return b.price - a.price
        default:
          return 0
      }
    })

    return result
  }, [inventory, searchTerm, filterCategory, sortOrder])

  const firebaseStatus = getFirebaseStatus()
  const onlineDevices = realtimeOnlineDevices

  const prevOnlineDevicesRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!devicesLoading) {
      const currentOnlineDevices = onlineDevices;
      const prevOnlineDevices = prevOnlineDevicesRef.current;

      if (prevOnlineDevices !== undefined) {
        if (currentOnlineDevices > 0 && prevOnlineDevices === 0) {
          toast({ title: "Pemindai Terhubung", description: "Satu atau lebih pemindai ESP32 kini aktif." });
        } else if (currentOnlineDevices === 0 && prevOnlineDevices > 0) {
          toast({ title: "Pemindai Terputus", description: "Semua pemindai ESP32 kini tidak aktif.", variant: "destructive" });
        }
      }
      prevOnlineDevicesRef.current = currentOnlineDevices;
    }
  }, [onlineDevices, devicesLoading, toast]);

  // Server-side batch prediction via /api/predict-batch
  const [stockRisks, setStockRisks] = useState<Array<{
    item: InventoryItem
    prediction: { model: { slope: number; avgDailyConsumption: number }; forecast: Array<{ timestamp: number; predictedQuantity: number; estimatedConsumption: number }>; stockoutDate: Date | null }
    predictedLowest: number
    daysToStockout: number | null
  }>>([])

  useEffect(() => {
    if (inventoryLoading || transactionsLoading) return
    if (inventory.length === 0 || transactions.length === 0) return

    const controller = new AbortController()

    const fetchRisks = async () => {
      try {
        const items = inventory
          .filter(i => !i.deleted && i.barcode)
          .map(i => ({
            id: i.id,
            barcode: i.barcode,
            name: i.name,
            quantity: Number(i.quantity) || 0,
            minStock: Number(i.minStock) || 0,
          }))

        const txs = transactions.map(t => ({
          productBarcode: t.productBarcode,
          type: t.type,
          quantity: Number(t.quantity) || 0,
          timestamp: Number(t.timestamp) || Date.now(),
        }))

        const res = await fetch("/api/predict", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "batch",
            items,
            transactions: txs,
            horizonDays: 14,
            trainRatio: 0.85,
            topN: 3,
            recentDays: 90,
          }),
          signal: controller.signal,
        })

        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        if (data.error) throw new Error(data.error)

        const risks = (data.risks || [])
          .map((r: { itemId: string; predictedLowest: number; daysToStockout: number | null; avgDailyConsumption: number; slope: number; forecast: Array<{ timestamp: number; predictedQuantity: number; estimatedConsumption: number }> }) => {
            const inv = inventory.find(i => i.id === r.itemId)
            if (!inv) return null
            return {
              item: inv,
              prediction: {
                model: { slope: r.slope, avgDailyConsumption: r.avgDailyConsumption },
                forecast: r.forecast,
                stockoutDate: r.daysToStockout !== null
                  ? new Date(Date.now() + r.daysToStockout * 24 * 60 * 60 * 1000)
                  : null,
              },
              predictedLowest: r.predictedLowest,
              daysToStockout: r.daysToStockout,
            }
          })
          .filter((r: typeof risks[number] | null): r is NonNullable<typeof r> => r !== null)

        setStockRisks(risks)
      } catch (err) {
        if ((err as Error).name === "AbortError") return
        // Silently fall back to empty (server error or unavailable)
        console.warn("[stockRisks] batch predict failed:", err)
        setStockRisks([])
      }
    }

    fetchRisks()
    return () => controller.abort()
  }, [inventory, transactions, inventoryLoading, transactionsLoading])

  const stockoutAlertedRef = useRef(false)
  useEffect(() => {
    if (stockoutAlertedRef.current) return
    if (inventoryLoading || transactionsLoading) return
    if (stockRisks.length === 0) return

    const urgent = stockRisks.filter(
      (r) => r.daysToStockout !== null && r.daysToStockout <= 7,
    )
    if (urgent.length === 0) return

    const today = new Date().toISOString().slice(0, 10)
    const notifiedKey = `stockout-notified-${today}`
    if (typeof window !== "undefined") {
      const notified = sessionStorage.getItem(notifiedKey)
      const notifiedIds = notified ? new Set(notified.split(",")) : new Set<string>()
      const newOnes = urgent.filter((r) => !notifiedIds.has(r.item.id))
      if (newOnes.length === 0) return

      newOnes.forEach((r) => {
        toast({
          title: `Stok akan habis: ${r.item.name}`,
          description: `Perkiraan ${r.daysToStockout} hari lagi (tren ${r.prediction.model.slope.toFixed(2)}/hari). Stok sekarang ${r.item.quantity}.`,
          variant: "destructive",
        })
        notifiedIds.add(r.item.id)
      })
      sessionStorage.setItem(notifiedKey, Array.from(notifiedIds).join(","))
    }
    stockoutAlertedRef.current = true
  }, [stockRisks, inventoryLoading, transactionsLoading, toast])

  const batteryAlertedRef = useRef(false)
  useEffect(() => {
    if (batteryAlertedRef.current) return
    if (devicesLoading || devices.length === 0) return

    const lowBattery = devices.filter(
      (d) => d.status === "online" && d.batteryLevel != null && d.batteryLevel < 20,
    )
    if (lowBattery.length === 0) return

    const today = new Date().toISOString().slice(0, 10)
    if (typeof window !== "undefined") {
      const notifiedIds = new Set(
        (sessionStorage.getItem(`battery-notified-${today}`) || "").split(",").filter(Boolean),
      )
      const newOnes = lowBattery.filter((d) => !notifiedIds.has(d.deviceId))
      if (newOnes.length === 0) return

      newOnes.forEach((d) => {
        toast({
          title: `Baterai rendah: ${d.name || d.deviceId}`,
          description: `Level ${d.batteryLevel}% — segera charge perangkat.`,
          variant: "destructive",
        })
        notifiedIds.add(d.deviceId)
      })
      sessionStorage.setItem(`battery-notified-${today}`, Array.from(notifiedIds).join(","))
    }
    batteryAlertedRef.current = true
  }, [devices, devicesLoading, toast])

  if (inventoryLoading || scansLoading || devicesLoading) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary border-t-transparent mx-auto mb-4"></div>
          <p className="text-muted-foreground">Memuat data...</p>
        </div>
      </div>
    )
  }

  if (inventoryError || scansError || devicesError) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{inventoryError || scansError || devicesError || "Gagal memuat data."}</AlertDescription>
          </Alert>
          <Button onClick={() => window.location.reload()}>Muat Ulang</Button>
        </div>
      </div>
    )
  }

  const addInventoryItem = async () => {
    if (!newItem.name || !newItem.barcode) {
      toast({ title: "Kesalahan", description: "Nama dan barcode wajib diisi", variant: "destructive" })
      return
    }
    const existingItemByBarcode = inventory.find((item) => item.barcode && item.barcode === newItem.barcode && newItem.barcode !== "")
    if (existingItemByBarcode) {
      toast({ title: "Gagal", description: `Barcode ${newItem.barcode} sudah digunakan untuk ${existingItemByBarcode.name}`, variant: "destructive" })
      return
    }
    try {
      await addItem(newItem)
      setNewItem({ barcode: "", name: "", description: "", category: "", quantity: 0, minStock: 5, price: 0, supplier: "", location: "", lastUpdated: Date.now() })
      setIsAddItemOpen(false)
      toast({ title: "Berhasil", description: "Item berhasil ditambahkan" })
    } catch {
      toast({ title: "Error", description: "Gagal menambahkan item", variant: "destructive" })
    }
  }

  const updateInventoryItem = async () => {
    if (!editingItem) return
    try {
      // Write only metadata — never the absolute quantity, to avoid clobbering
      // concurrent stock changes (scanner/other tabs) that happened while the
      // dialog was open.
      const { quantity, id, ...metadata } = editingItem
      await updateItem(id, metadata as Partial<InventoryItem>)

      // If the user changed quantity in the dialog, apply it as an atomic delta
      // relative to what they saw when the dialog opened (not the live value).
      const qtyDiff = quantity - editBaselineQtyRef.current
      if (qtyDiff !== 0) {
        await firebaseHelpers.adjustStock(id, qtyDiff, {
          type: qtyDiff > 0 ? "in" : "out",
          productName: editingItem.name,
          productBarcode: editingItem.barcode ?? "",
          quantity: Math.abs(qtyDiff),
          unitPrice: editingItem.price ?? 0,
          totalAmount: (editingItem.price ?? 0) * Math.abs(qtyDiff),
          reason: "Penyesuaian via edit item",
          operator: "Dashboard",
          notes: `Penyesuaian via edit item`,
        })
      }

      setEditingItem(null)
      toast({ title: "Berhasil", description: "Item berhasil diperbarui" })
    } catch {
      toast({ title: "Error", description: "Gagal memperbarui item", variant: "destructive" })
    }
  }

  const deleteInventoryItem = async (id: string, name: string) => {
    if (!confirm(`Hapus "${name}"?`)) return
    try {
      await deleteItem(id)
      toast({ title: "Berhasil", description: "Item berhasil dihapus" })
    } catch {
      toast({ title: "Error", description: "Gagal menghapus item", variant: "destructive" })
    }
  }

  const handleStockAdjustment = async () => {
    if (!stockAdjustment) return
    const { itemId, amount, type, currentQuantity, itemName } = stockAdjustment
    const newQuantity = type === "add" ? currentQuantity + amount : currentQuantity - amount
    if (newQuantity < 0) {
      toast({ title: "Error", description: "Stok tidak boleh kurang dari nol.", variant: "destructive" })
      return
    }
    try {
      const adjustedItem = inventory.find((i) => i.id === itemId)
      const delta = type === "add" ? amount : -amount

      // Atomic: server-side increment + transaction in one multi-path update
      await firebaseHelpers.adjustStock(itemId, delta, {
        type: type === "add" ? "in" : "out",
        productName: itemName,
        productBarcode: adjustedItem?.barcode ?? "",
        quantity: amount,
        unitPrice: adjustedItem?.price ?? 0,
        totalAmount: (adjustedItem?.price ?? 0) * amount,
        reason: type === "add" ? "Penambahan stok manual" : "Pengurangan stok manual",
        operator: "Dashboard",
        notes: `Penyesuaian stok manual`,
      })

      setStockAdjustment(null)
      toast({ title: "Berhasil", description: `Stok ${itemName} ${type === "add" ? "ditambah" : "dikurangi"} sebanyak ${amount}` })
    } catch {
      toast({ title: "Error", description: "Gagal mengubah stok.", variant: "destructive" })
    }
  }

  const totalItems = inventory.length
  const totalValue = inventory.reduce((sum, item) => sum + item.quantity * item.price, 0)
  const lowStockItems = inventory.filter((item) => item.quantity <= item.minStock)

  const exportToCSV = () => {
    const csvRows = [];
    const headers = ["ID", "Barcode", "Nama", "Deskripsi", "Kategori", "Kuantitas", "Stok Min", "Harga", "Pemasok", "Lokasi", "Update Terakhir"];
    csvRows.push(headers.join(','));
    for (const item of inventory) {
      const values = [item.id, item.barcode || "", `"${item.name.replace(/"/g, '""')}"`, `"${item.description.replace(/"/g, '""')}"`, item.category, item.quantity, item.minStock, item.price, `"${(item.supplier || "").replace(/"/g, '""')}"`, `"${item.location.replace(/"/g, '""')}"`, item.lastUpdated ? new Date(item.lastUpdated).toLocaleString() : ""];
      csvRows.push(values.join(','));
    }
    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const fileName = `inventory_${new Date().toISOString().split('T')[0]}.csv`;
    const link = document.createElement("a");
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", fileName);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
    toast({ title: "Export Berhasil", description: `${inventory.length} item diexport` });
  };

  const handleView = (item: InventoryItem) => setViewingItem({ ...item, barcode: item.barcode ?? "", supplier: item.supplier ?? "" })
  const handleEdit = (item: InventoryItem) => {
    editBaselineQtyRef.current = item.quantity
    setEditingItem({ ...item, barcode: item.barcode ?? "", supplier: item.supplier ?? "" })
  }
  const handleStockAdj = (item: InventoryItem, type: "add" | "subtract") => {
    setStockAdjustment({ itemId: item.id, itemName: item.name, currentQuantity: item.quantity, type, amount: type === "add" && item.quantity <= item.minStock ? Math.max(item.minStock * 2 - item.quantity, 5) : 1 })
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 animate-fade-in-up">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Dashboard Inventory</h1>
            <p className="text-sm text-muted-foreground mt-1">Kelola stok barang dengan mudah</p>
          </div>
          <Button onClick={() => setIsAddItemOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Tambah Item
          </Button>
        </div>

        {/* Status Alert */}
        <Alert variant={firebaseStatus.isConfigured ? "default" : "destructive"} className="animate-fade-in-up">
          {firebaseStatus.isConfigured ? (
            <Wifi className="h-4 w-4" />
          ) : (
            <WifiOff className="h-4 w-4" />
          )}
          <AlertDescription>
            {firebaseStatus.isConfigured ? "Terhubung ke Firebase - Real-time sync aktif" : "Tidak terhubung ke Firebase"}
          </AlertDescription>
        </Alert>

        {/* Stats Cards */}
        <StatsCards
          totalItems={totalItems}
          totalValue={totalValue}
          lowStockItems={lowStockItems}
          inventory={inventory}
          onlineDevices={onlineDevices}
          totalDevices={totalDevices}
          devices={devices}
        />

        <div className="bg-card border rounded-lg p-5 shadow-sm animate-fade-in-up">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <div>
              <div className="flex items-center gap-2">
                <TrendingDown className="w-5 h-5 text-amber-500" />
                <h2 className="text-lg font-semibold">Ringkasan Prediksi Stok</h2>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Barang paling berisiko berdasarkan histori transaksi manual dan scanner.
              </p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/prediksi">Buka Prediksi</Link>
            </Button>
          </div>

          {stockRisks.length === 0 ? (
            <div className="text-sm text-muted-foreground py-3">
              Belum cukup data transaksi untuk menghitung prediksi. Minimal 2 transaksi per barang.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {stockRisks.map(({ item, prediction, predictedLowest, daysToStockout }) => {
                const belowMin = predictedLowest <= item.minStock
                return (
                  <div key={item.id} className="rounded-md border p-4 bg-background">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-medium line-clamp-1">{item.name}</div>
                        <div className="text-xs text-muted-foreground">Stok sekarang: {item.quantity}</div>
                      </div>
                      <span className={belowMin ? "text-xs px-2 py-1 rounded bg-destructive/10 text-destructive" : "text-xs px-2 py-1 rounded bg-green-500/10 text-green-600"}>
                        {belowMin ? "Risiko" : "Aman"}
                      </span>
                    </div>
                    <div className="mt-3 space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Tren</span>
                        <span className="font-mono">{prediction.model.slope.toFixed(2)}/hari</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Terendah 14 hari</span>
                        <span className="font-mono">{predictedLowest.toFixed(1)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Perkiraan habis</span>
                        <span className="font-mono">{daysToStockout === null ? "—" : `${daysToStockout} hari`}</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Inventory Table */}
        <InventoryTable
          inventory={inventory}
          filteredInventory={filteredInventory}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          filterCategory={filterCategory}
          onFilterCategoryChange={setFilterCategory}
          sortOrder={sortOrder}
          onSortOrderChange={setSortOrder}
          categories={categories}
          onAddItem={() => setIsAddItemOpen(true)}
          onExport={exportToCSV}
          onView={handleView}
          onEdit={handleEdit}
          onDelete={deleteInventoryItem}
          onStockAdjust={handleStockAdj}
          lowStockItems={lowStockItems}
        />

        {/* Add Item Dialog */}
        <Dialog open={isAddItemOpen} onOpenChange={setIsAddItemOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Tambah Item Baru</DialogTitle>
              <DialogDescription>Masukkan detail item inventory.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="barcode" className="text-right">Barcode</Label>
                <Input id="barcode" value={newItem.barcode} onChange={(e) => setNewItem({ ...newItem, barcode: e.target.value })} className="col-span-3" placeholder="Scan atau ketik" />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="name" className="text-right">Nama *</Label>
                <Input id="name" value={newItem.name} onChange={(e) => setNewItem({ ...newItem, name: e.target.value })} className="col-span-3" placeholder="Contoh: Coca Cola 330ml" />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="category" className="text-right">Kategori</Label>
                <Input id="category" value={newItem.category} onChange={(e) => setNewItem({ ...newItem, category: e.target.value })} className="col-span-3" placeholder="Contoh: Minuman" />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="quantity" className="text-right">Kuantitas</Label>
                <Input id="quantity" type="number" value={newItem.quantity} onChange={(e) => setNewItem({ ...newItem, quantity: parseInt(e.target.value) || 0 })} className="col-span-3" />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="price" className="text-right">Harga (Rp)</Label>
                <Input id="price" type="number" value={newItem.price} onChange={(e) => setNewItem({ ...newItem, price: parseFloat(e.target.value) || 0 })} className="col-span-3" />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="location" className="text-right">Lokasi</Label>
                <Input id="location" value={newItem.location} onChange={(e) => setNewItem({ ...newItem, location: e.target.value })} className="col-span-3" placeholder="Contoh: Rak A1" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddItemOpen(false)}>Batal</Button>
              <Button onClick={addInventoryItem}>Simpan</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Item Dialog */}
        <Dialog open={!!editingItem} onOpenChange={() => setEditingItem(null)}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Edit Item</DialogTitle>
              <DialogDescription>Perbarui informasi item.</DialogDescription>
            </DialogHeader>
            {editingItem && (
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="edit-barcode" className="text-right">Barcode</Label>
                  <Input id="edit-barcode" value={editingItem.barcode ?? ""} onChange={(e) => setEditingItem({ ...editingItem, barcode: e.target.value })} className="col-span-3" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="edit-name" className="text-right">Nama</Label>
                  <Input id="edit-name" value={editingItem.name} onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })} className="col-span-3" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="edit-category" className="text-right">Kategori</Label>
                  <Input id="edit-category" value={editingItem.category} onChange={(e) => setEditingItem({ ...editingItem, category: e.target.value })} className="col-span-3" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="edit-quantity" className="text-right">Kuantitas</Label>
                  <Input id="edit-quantity" type="number" value={editingItem.quantity} onChange={(e) => setEditingItem({ ...editingItem, quantity: parseInt(e.target.value) || 0 })} className="col-span-3" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="edit-price" className="text-right">Harga</Label>
                  <Input id="edit-price" type="number" value={editingItem.price} onChange={(e) => setEditingItem({ ...editingItem, price: parseFloat(e.target.value) || 0 })} className="col-span-3" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="edit-location" className="text-right">Lokasi</Label>
                  <Input id="edit-location" value={editingItem.location} onChange={(e) => setEditingItem({ ...editingItem, location: e.target.value })} className="col-span-3" />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingItem(null)}>Batal</Button>
              <Button onClick={updateInventoryItem}>Simpan</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* View Item Dialog */}
        <Dialog open={!!viewingItem} onOpenChange={() => setViewingItem(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Detail Item</DialogTitle>
            </DialogHeader>
            {viewingItem && (
              <div className="space-y-4 py-4">
                <div className="flex justify-center py-4">
                  {viewingItem.barcode ? (
                    <BarcodeComponent value={viewingItem.barcode} height={50} displayValue={false} />
                  ) : (
                    <p className="text-muted-foreground">Tidak ada barcode</p>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">Nama</Label>
                    <p className="font-semibold">{viewingItem.name}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Kategori</Label>
                    <p>{viewingItem.category}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Stok</Label>
                    <p className="text-xl font-bold">{viewingItem.quantity}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Harga</Label>
                    <p className="font-semibold">Rp {viewingItem.price.toLocaleString()}</p>
                  </div>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button onClick={() => setViewingItem(null)}>Tutup</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Stock Adjustment Dialog */}
        <Dialog open={!!stockAdjustment} onOpenChange={() => setStockAdjustment(null)}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>{stockAdjustment?.type === "add" ? "Tambah" : "Kurangi"} Stok: {stockAdjustment?.itemName}</DialogTitle>
              <DialogDescription>Stok saat ini: {stockAdjustment?.currentQuantity}</DialogDescription>
            </DialogHeader>
            {stockAdjustment && (
              <div className="py-4">
                <Label htmlFor="adjustment-amount">Jumlah</Label>
                <Input id="adjustment-amount" type="number" min="1" value={stockAdjustment.amount} onChange={(e) => setStockAdjustment({ ...stockAdjustment, amount: parseInt(e.target.value) || 1 })} />
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setStockAdjustment(null)}>Batal</Button>
              <Button onClick={handleStockAdjustment}>{stockAdjustment?.type === "add" ? "Tambah" : "Kurangi"} Stok</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}