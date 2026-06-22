"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import dynamic from "next/dynamic"
import { Alert, AlertDescription } from "@/components/ui/alert"
import Link from "next/link"
import { AlertCircle, TrendingDown } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { useFirebaseInventory, InventoryItem, useFirebaseTransactions } from "@/hooks/use-firebase"
import { useRealtimeDeviceStatus } from "@/hooks/use-realtime-device-status"
import { firebaseHelpers } from "@/lib/firebase"
import { downloadCsv } from "@/lib/csv"
import StatsCards from "@/components/dashboard/stats-cards"
import InventoryTable from "@/components/dashboard/inventory-table"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
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
import { useAuth } from "@/components/auth-provider"
import { canWrite } from "@/types/security"
import { AuditTimeline } from "@/components/audit-timeline"

const BarcodeComponent = dynamic(() => import("@/components/pdf417-barcode"), {
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
  const { role, getIdToken } = useAuth()
  const writable = canWrite(role)
  const {
    items: inventory,
    loading: inventoryLoading,
    error: inventoryError,
    addItem,
    updateItem,
    deleteItem,
  } = useFirebaseInventory()
  const { loading: scansLoading, error: scansError } = { loading: false, error: null }
  // null = semua transaksi untuk akurasi prediksi penuh (lihat CLAUDE.md)
  const { transactions, loading: transactionsLoading } = useFirebaseTransactions(null)

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
  const [deletingItem, setDeletingItem] = useState<{ id: string; name: string } | null>(null)
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
        default:
          return 0
      }
    })

    return result
  }, [inventory, searchTerm, filterCategory, sortOrder])

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
  const [stockRisksLoading, setStockRisksLoading] = useState(false)

  useEffect(() => {
    if (inventoryLoading || transactionsLoading) {
      setStockRisksLoading(true)
      return
    }
    if (inventory.length === 0 || transactions.length === 0) {
      setStockRisks([])
      setStockRisksLoading(false)
      return
    }

    const controller = new AbortController()
    setStockRisksLoading(true)

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

        const token = await getIdToken()
        const res = await fetch("/api/predict", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
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
      } finally {
        if (!controller.signal.aborted) {
          setStockRisksLoading(false)
        }
      }
    }

    fetchRisks()
    return () => controller.abort()
  }, [getIdToken, inventory, transactions, inventoryLoading, transactionsLoading])

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

  // Keyboard shortcuts: / to focus search, N to add item
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable

      if (e.key === "/" && !isInput) {
        e.preventDefault()
        const searchInput = document.querySelector<HTMLInputElement>('[placeholder="Cari item..."]')
        searchInput?.focus()
      }
      if (writable && e.key === "n" && !isInput) {
        e.preventDefault()
        setIsAddItemOpen(true)
      }
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [writable])

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
    if (!writable) return
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
      setNewItem({ barcode: "", name: "", description: "", category: "", quantity: 0, minStock: 5, supplier: "", location: "", lastUpdated: Date.now() })
      setIsAddItemOpen(false)
      toast({ title: "Berhasil", description: "Item berhasil ditambahkan" })
    } catch {
      toast({ title: "Error", description: "Gagal menambahkan item", variant: "destructive" })
    }
  }

  const updateInventoryItem = async () => {
    if (!writable || !editingItem) return
    try {
      const operationId = firebaseHelpers.createOperationId()
      // Write only metadata — never the absolute quantity, to avoid clobbering
      // concurrent stock changes (scanner/other tabs) that happened while the
      // dialog was open.
      const { quantity, id, ...metadata } = editingItem
      await updateItem(id, metadata as Partial<InventoryItem>, operationId)

      // If the user changed quantity in the dialog, apply it as an atomic delta
      // relative to what they saw when the dialog opened (not the live value).
      const qtyDiff = quantity - editBaselineQtyRef.current
      if (qtyDiff !== 0) {
        await firebaseHelpers.adjustStock(id, qtyDiff, {
          type: qtyDiff > 0 ? "in" : "out",
          productName: editingItem.name,
          productBarcode: editingItem.barcode ?? "",
          quantity: Math.abs(qtyDiff),
          reason: "Penyesuaian via edit item",
          operator: "Dashboard",
          notes: `Penyesuaian via edit item`,
        }, operationId)
      }

      setEditingItem(null)
      toast({ title: "Berhasil", description: "Item berhasil diperbarui" })
    } catch {
      toast({ title: "Error", description: "Gagal memperbarui item", variant: "destructive" })
    }
  }

  const deleteInventoryItem = async (id: string, name: string) => {
    setDeletingItem({ id, name })
  }

  const confirmDelete = async () => {
    if (!writable || !deletingItem) return
    try {
      await deleteItem(deletingItem.id)
      toast({ title: "Berhasil", description: `"${deletingItem.name}" berhasil dihapus` })
    } catch {
      toast({ title: "Error", description: "Gagal menghapus item", variant: "destructive" })
    } finally {
      setDeletingItem(null)
    }
  }

  const handleStockAdjustment = async () => {
    if (!writable || !stockAdjustment) return
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
  const totalTransactions = transactions.length
  const lowStockItems = inventory.filter((item) => item.quantity <= item.minStock)

  const exportToCSV = () => {
    const headers = ["ID", "Barcode", "Nama", "Deskripsi", "Kategori", "Kuantitas", "Stok Min", "Pemasok", "Lokasi", "Update Terakhir"];
    const fileName = `inventory_${new Date().toISOString().split('T')[0]}.csv`;
    const rows = inventory.map((item) => [
      item.id,
      item.barcode || "",
      item.name,
      item.description || "",
      item.category || "",
      item.quantity,
      item.minStock,
      item.supplier || "",
      item.location || "",
      item.lastUpdated ? new Date(item.lastUpdated).toLocaleString() : "",
    ]);
    downloadCsv(fileName, [headers, ...rows]);
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
            <h1 className="text-3xl sm:text-4xl font-bold text-foreground tracking-tight">Dashboard Inventory</h1>
            <p className="text-sm text-muted-foreground mt-1">Kelola stok barang dengan prediksi otomatis</p>
          </div>
        </div>

        {/* Stats Cards */}
        <StatsCards
          totalItems={totalItems}
          totalTransactions={totalTransactions}
          lowStockItems={lowStockItems}
          inventory={inventory}
          onlineDevices={onlineDevices}
          totalDevices={totalDevices}
          devices={devices}
        />

        <div className="bg-primary/[0.03] border border-primary/10 rounded-xl p-5 shadow-sm animate-fade-in-up">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
            <div>
              <div className="flex items-center gap-2">
                <TrendingDown className="w-5 h-5 text-primary" />
                <h2 className="text-lg font-bold text-foreground tracking-tight">Prediksi Stok</h2>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Barang paling berisiko berdasarkan histori transaksi.
              </p>
            </div>
            <Button asChild variant="outline" size="sm" className="border-primary/20 text-primary hover:bg-primary/5">
              <Link href="/prediksi">Detail Prediksi</Link>
            </Button>
          </div>

          {transactionsLoading || stockRisksLoading ? (
            <div className="text-sm text-muted-foreground py-3">
              Memuat ringkasan prediksi...
            </div>
          ) : stockRisks.length === 0 ? (
            <div className="text-sm text-muted-foreground py-3">
              Belum cukup data transaksi untuk menghitung prediksi. Minimal 2 transaksi per barang.
            </div>
          ) : (
            <div className="stagger-children grid grid-cols-1 md:grid-cols-3 gap-3">
              {stockRisks.map(({ item, prediction, predictedLowest, daysToStockout }) => {
                const belowMin = predictedLowest <= item.minStock
                return (
                  <div key={item.id} className="rounded-lg border border-border/60 bg-card p-4 transition-all duration-200 hover:border-primary/20 hover:shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-semibold text-foreground line-clamp-1 text-sm">{item.name}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">Stok: <span className="font-mono font-medium text-foreground">{item.quantity}</span></div>
                      </div>
                      <span className={belowMin ? "text-[11px] px-2 py-0.5 rounded-full bg-destructive/10 text-destructive font-semibold" : "text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 font-semibold"}>
                        {belowMin ? "Risiko" : "Aman"}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <div className="text-muted-foreground">Tren</div>
                        <div className="font-mono font-semibold text-foreground">{prediction.model.slope.toFixed(2)}/hari</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Terendah</div>
                        <div className="font-mono font-semibold text-foreground">{predictedLowest.toFixed(0)}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Habis</div>
                        <div className="font-mono font-semibold text-foreground">{daysToStockout === null ? "—" : `${daysToStockout}h`}</div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Inventory Table */}
        <div className="animate-fade-in-up">
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
          canWrite={writable}
        />
        </div>

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
                  <Label htmlFor="edit-min-stock" className="text-right">Stok Minimum</Label>
                  <Input id="edit-min-stock" type="number" min="0" value={editingItem.minStock} onChange={(e) => setEditingItem({ ...editingItem, minStock: parseInt(e.target.value) || 0 })} className="col-span-3" />
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
                <div className="flex flex-col items-center py-4 gap-2">
                  {viewingItem.barcode ? (
                    <>
                      <BarcodeComponent value={viewingItem.barcode} height={60} />
                      <span className="font-mono text-sm tracking-wider">{viewingItem.barcode}</span>
                    </>
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
                    <Label className="text-xs text-muted-foreground">Stok Minimum</Label>
                    <p className="font-semibold">{viewingItem.minStock}</p>
                  </div>
                </div>
                {role === "admin" && (
                  <div className="border-t pt-4">
                    <Label className="text-xs text-muted-foreground">Timeline Audit</Label>
                    <div className="mt-2"><AuditTimeline entityId={viewingItem.id} /></div>
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

        {/* Delete Confirmation AlertDialog */}
        <AlertDialog open={!!deletingItem} onOpenChange={() => setDeletingItem(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Hapus item?</AlertDialogTitle>
              <AlertDialogDescription>
                {deletingItem && `"${deletingItem.name}" akan dihapus dari inventory. Tindakan ini tidak dapat dibatalkan.`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Batal</AlertDialogCancel>
              <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Hapus
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
}
