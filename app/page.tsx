"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import dynamic from "next/dynamic"
import { Alert, AlertDescription } from "@/components/ui/alert"
import Link from "next/link"
import { AlertCircle, TrendingDown } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { useFirebaseInventory, InventoryItem } from "@/hooks/use-firebase"
import { useRealtimeDeviceStatus } from "@/hooks/use-realtime-device-status"
import { usePredictionContext } from "@/components/alert-provider"
import { firebaseHelpers, type AddInventoryInput } from "@/lib/firebase"
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
import { LoadingSpinner, InlineSpinner } from "@/components/loading-spinner"

const BarcodeComponent = dynamic(() => import("@/components/pdf417-barcode"), {
  ssr: false,
  loading: () => <div className="h-[60px] w-48 rounded bg-default" />,
})

interface StockAdjustment {
  itemId: string
  itemName: string
  currentQuantity: number
  type: "add" | "subtract"
  amount: number
}

export default function DashboardPage() {
  const { role } = useAuth()
  const writable = canWrite(role)
  const {
    items: inventory,
    loading: inventoryLoading,
    error: inventoryError,
    addItem,
    updateItem,
    deleteItem,
  } = useFirebaseInventory()

  const {
    devices,
    loading: devicesLoading,
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
  const [isSaving, setIsSaving] = useState(false)

  const { toast } = useToast()

  const activeDevice = useMemo(() => {
    const online = devices.filter((d) => d.status === "online")
    return online.length > 0 ? online[0] : null
  }, [devices])
  const activeDeviceMode = activeDevice?.scanMode || "Manual"

  const [newItem, setNewItem] = useState<AddInventoryInput>({
    barcode: "",
    name: "",
    description: "",
    category: "",
    quantity: 0,
    minStock: 5,
    supplier: "",
    location: "",
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
          (item.name || "").toLowerCase().includes(term) ||
          (item.barcode || "").toLowerCase().includes(term) ||
          (item.category || "").toLowerCase().includes(term) ||
          (item.location || "").toLowerCase().includes(term),
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
          return a.quantity - b.quantity
        case "quantity-desc":
          return b.quantity - a.quantity
        default:
          return 0
      }
    })

    return result
  }, [inventory, searchTerm, filterCategory, sortOrder])

  const onlineDevices = realtimeOnlineDevices

  const prevOnlineDevicesRef = useRef<number | undefined>(undefined);
  const previousDeviceModesRef = useRef<Map<string, string>>(new Map());

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

  useEffect(() => {
    if (devicesLoading) return
    devices.forEach((device) => {
      const mode = device.scanMode || "Manual"
      const previous = previousDeviceModesRef.current.get(device.deviceId)
      if (previous && previous !== mode && device.status === "online") {
        toast({ title: "Mode Scanner Berubah", description: `${device.deviceId} sekarang ${mode}` })
      }
      previousDeviceModesRef.current.set(device.deviceId, mode)
    })
  }, [devices, devicesLoading, toast])

  // Gunakan shared prediction dari AlertProvider (dibanding fetch sendiri)
  const { risks: rawPredictionRisks, loading: stockRisksLoading } = usePredictionContext()

  const stockRisks = useMemo(() => {
    return rawPredictionRisks
      .map((r) => {
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
      .filter((r): r is NonNullable<typeof r> => r !== null)
  }, [rawPredictionRisks, inventory])

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

  // Only block on inventory — devices/stats can render while still connecting
  if (inventoryLoading) {
    return <LoadingSpinner fullScreen label="Memuat inventori..." />
  }

  if (inventoryError) {
    return (
      <div className="min-h-[100dvh] bg-background flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{inventoryError || "Gagal memuat data."}</AlertDescription>
          </Alert>
          <Button onClick={() => window.location.reload()}>Muat Ulang</Button>
        </div>
      </div>
    )
  }

  const addInventoryItem = async () => {
    if (!writable || isSaving) return
    if (!newItem.name || !newItem.barcode) {
      toast({ title: "Gagal", description: "Nama dan barcode wajib diisi", variant: "destructive" })
      return
    }
    const existingItemByBarcode = inventory.find((item) => item.barcode && item.barcode === newItem.barcode && newItem.barcode !== "")
    if (existingItemByBarcode) {
      toast({ title: "Gagal", description: `Barcode ${newItem.barcode} sudah digunakan untuk ${existingItemByBarcode.name}`, variant: "destructive" })
      return
    }
    setIsSaving(true)
    try {
      await addItem(newItem)
      setNewItem({ barcode: "", name: "", description: "", category: "", quantity: 0, minStock: 5, supplier: "", location: "" })
      setIsAddItemOpen(false)
      toast({ title: "Berhasil", description: "Item berhasil ditambahkan" })
    } catch {
      toast({ title: "Gagal", description: "Gagal menambahkan item", variant: "destructive" })
    } finally {
      setIsSaving(false)
    }
  }

  const updateInventoryItem = async () => {
    if (!writable || !editingItem || isSaving) return
    setIsSaving(true)
    try {
      const operationId = firebaseHelpers.createOperationId()
      // Whitelist only known metadata fields — never spread full RTDB row
      // (legacy keys like price trip $other:false rules).
      const metadata = {
        name: editingItem.name,
        category: editingItem.category,
        barcode: editingItem.barcode,
        minStock: editingItem.minStock,
        location: editingItem.location,
        description: editingItem.description,
        supplier: editingItem.supplier,
      }
      await updateItem(editingItem.id, metadata, operationId)

      // If the user changed quantity in the dialog, apply it as an atomic delta
      // relative to what they saw when the dialog opened (not the live value).
      const qtyDiff = editingItem.quantity - editBaselineQtyRef.current
      if (qtyDiff !== 0) {
        await firebaseHelpers.adjustStock(editingItem.id, qtyDiff, {
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
      toast({ title: "Gagal", description: "Gagal memperbarui item", variant: "destructive" })
    } finally {
      setIsSaving(false)
    }
  }

  const deleteInventoryItem = async (id: string, name: string) => {
    setDeletingItem({ id, name })
  }

  const confirmDelete = async () => {
    if (!writable || !deletingItem || isSaving) return
    setIsSaving(true)
    try {
      await deleteItem(deletingItem.id)
      toast({ title: "Berhasil", description: `"${deletingItem.name}" berhasil dihapus` })
    } catch {
      toast({ title: "Gagal", description: "Gagal menghapus item", variant: "destructive" })
    } finally {
      setIsSaving(false)
      setDeletingItem(null)
    }
  }

  const handleStockAdjustment = async () => {
    if (!writable || !stockAdjustment || isSaving) return
    const { itemId, amount, type, currentQuantity, itemName } = stockAdjustment
    const newQuantity = type === "add" ? currentQuantity + amount : currentQuantity - amount
    if (newQuantity < 0) {
      toast({ title: "Gagal", description: "Stok tidak boleh kurang dari nol.", variant: "destructive" })
      return
    }
    setIsSaving(true)
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
      toast({ title: "Gagal", description: "Gagal mengubah stok.", variant: "destructive" })
    } finally {
      setIsSaving(false)
    }
  }

  const totalItems = inventory.length
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
    <div className="min-h-[100dvh] bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-10 space-y-8">
        {/* Header */}
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between animate-fade-in-up">
          <div className="space-y-1">
            <p className="text-sm font-medium uppercase tracking-wider text-muted">Ringkasan</p>
            <h1 className="heading-1">Dashboard Inventori</h1>
            <p className="text-body max-w-md pt-1">Kelola stok barang gudang dan pantau prediksi stok otomatis.</p>
          </div>

          <div
            title={`Mode Scanner dikontrol dari tombol alat: ${activeDeviceMode}`}
            className={`
              inline-flex items-center gap-2 self-start rounded-full border px-4 py-2 text-sm font-semibold transition-all duration-300 md:self-auto
              ${activeDeviceMode === "Manual"
                ? "border-border bg-default text-foreground"
                : activeDeviceMode === "Auto IN"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700 shadow-sm"
                  : "border-amber-200 bg-amber-50 text-amber-700 shadow-sm"
              }
            `}
          >
            <span className={
              "inline-block h-2 w-2 animate-pulse rounded-full " + (
                activeDeviceMode === "Manual" ? "bg-muted"
                : activeDeviceMode === "Auto IN" ? "bg-emerald-500"
                : "bg-amber-500"
              )
            } />
            {activeDeviceMode}
          </div>
        </div>

        {/* Stats Cards */}
        <StatsCards
          totalItems={totalItems}
          lowStockItems={lowStockItems}
          onlineDevices={onlineDevices}
          totalDevices={totalDevices}
          devices={devices}
        />

        {/* Predictions Summary */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="animate-fade-in-up rounded-2xl border border-border bg-surface p-5 shadow-sm lg:col-span-3">
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <TrendingDown className="h-5 w-5 text-accent" />
                  <h2 className="text-lg font-bold tracking-tight text-foreground">Prediksi Stok</h2>
                </div>
                <p className="mt-1 text-sm text-muted">
                  Barang paling berisiko berdasarkan histori transaksi.
                </p>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link href="/prediksi">Detail Prediksi</Link>
              </Button>
            </div>

            {stockRisksLoading ? (
              <div className="flex items-center gap-2.5 py-4">
                <InlineSpinner size="sm" className="text-accent" />
                <span className="text-sm text-muted">Memuat ringkasan prediksi...</span>
              </div>
            ) : stockRisks.length === 0 ? (
              <div className="py-3 text-sm text-muted">
                Belum cukup data transaksi untuk menghitung prediksi. Minimal 2 transaksi per barang.
              </div>
            ) : (
              <div className="stagger-children grid grid-cols-1 gap-4 md:grid-cols-3">
                {stockRisks.map(({ item, prediction, predictedLowest, daysToStockout }) => {
                  const belowMin = predictedLowest <= item.minStock
                  return (
                    <div
                      key={item.id}
                      className={`card-hover relative overflow-hidden rounded-2xl border bg-surface p-4 shadow-sm ${
                        belowMin
                          ? "border-danger/25 bg-danger/[0.03]"
                          : "border-border/60"
                      }`}
                    >
                      <div
                        className={`absolute inset-x-0 top-0 h-1 ${
                          belowMin ? "bg-danger/80" : "bg-emerald-500/80"
                        }`}
                      />
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="line-clamp-1 text-sm font-semibold text-foreground">{item.name}</div>
                          <div className="mt-0.5 text-xs text-muted">
                            Stok:{" "}
                            <span className="font-mono font-medium text-foreground">{item.quantity}</span>
                          </div>
                        </div>
                        <span
                          className={
                            belowMin
                              ? "shrink-0 rounded-full border border-danger/20 bg-danger/10 px-2 py-0.5 text-[11px] font-semibold text-danger"
                              : "shrink-0 rounded-full border border-emerald-200 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-700"
                          }
                        >
                          {belowMin ? "Risiko" : "Aman"}
                        </span>
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border/50 pt-3 text-xs">
                        <div>
                          <div className="text-muted">Tren</div>
                          <div className="font-mono font-semibold text-foreground">
                            {prediction.model.slope.toFixed(2)}/hari
                          </div>
                        </div>
                        <div>
                          <div className="text-muted">Terendah</div>
                          <div className="font-mono font-semibold text-foreground">
                            {predictedLowest.toFixed(0)}
                          </div>
                        </div>
                        <div>
                          <div className="text-muted">Habis</div>
                          <div className="font-mono font-semibold text-foreground">
                            {daysToStockout === null ? "—" : `${daysToStockout}h`}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
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
        <Dialog open={isAddItemOpen} onOpenChange={(open) => { if (!isSaving) setIsAddItemOpen(open) }}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Tambah Item Baru</DialogTitle>
              <DialogDescription>Masukkan detail item inventori.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="barcode">Barcode</Label>
                <Input id="barcode" value={newItem.barcode} onChange={(e) => setNewItem({ ...newItem, barcode: e.target.value })} placeholder="Scan atau ketik" disabled={isSaving} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">Nama *</Label>
                <Input id="name" value={newItem.name} onChange={(e) => setNewItem({ ...newItem, name: e.target.value })} placeholder="Contoh: Busi NGK CPR8EA-9" disabled={isSaving} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">Kategori</Label>
                <Input id="category" value={newItem.category} onChange={(e) => setNewItem({ ...newItem, category: e.target.value })} placeholder="Contoh: Sparepart" disabled={isSaving} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="quantity">Kuantitas</Label>
                <Input id="quantity" type="number" value={newItem.quantity} onChange={(e) => setNewItem({ ...newItem, quantity: parseInt(e.target.value) || 0 })} disabled={isSaving} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="location">Lokasi</Label>
                <Input id="location" value={newItem.location} onChange={(e) => setNewItem({ ...newItem, location: e.target.value })} placeholder="Contoh: Rak A1" disabled={isSaving} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddItemOpen(false)} disabled={isSaving}>Batal</Button>
              <Button onClick={addInventoryItem} disabled={isSaving}>{isSaving ? "Menyimpan..." : "Simpan"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Item Dialog */}
        <Dialog open={!!editingItem} onOpenChange={(open) => { if (!open && !isSaving) setEditingItem(null) }}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Edit Item</DialogTitle>
              <DialogDescription>Perbarui informasi item.</DialogDescription>
            </DialogHeader>
            {editingItem && (
              <div className="grid gap-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-barcode">Barcode</Label>
                  <Input id="edit-barcode" value={editingItem.barcode ?? ""} onChange={(e) => setEditingItem({ ...editingItem, barcode: e.target.value })} disabled={isSaving} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-name">Nama</Label>
                  <Input id="edit-name" value={editingItem.name} onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })} disabled={isSaving} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-category">Kategori</Label>
                  <Input id="edit-category" value={editingItem.category} onChange={(e) => setEditingItem({ ...editingItem, category: e.target.value })} disabled={isSaving} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-quantity">Kuantitas</Label>
                  <Input id="edit-quantity" type="number" value={editingItem.quantity} onChange={(e) => setEditingItem({ ...editingItem, quantity: parseInt(e.target.value) || 0 })} disabled={isSaving} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-min-stock">Stok Minimum</Label>
                  <Input id="edit-min-stock" type="number" min="0" value={editingItem.minStock} onChange={(e) => setEditingItem({ ...editingItem, minStock: parseInt(e.target.value) || 0 })} disabled={isSaving} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-location">Lokasi</Label>
                  <Input id="edit-location" value={editingItem.location} onChange={(e) => setEditingItem({ ...editingItem, location: e.target.value })} disabled={isSaving} />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingItem(null)} disabled={isSaving}>
                Batal
              </Button>
              <Button onClick={updateInventoryItem} disabled={isSaving} isPending={isSaving}>
                {isSaving ? "Menyimpan..." : "Simpan"}
              </Button>
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
              <Button variant="outline" onClick={() => setStockAdjustment(null)} disabled={isSaving}>Batal</Button>
              <Button onClick={handleStockAdjustment} disabled={isSaving}>
                {isSaving ? "Menyimpan..." : `${stockAdjustment?.type === "add" ? "Tambah" : "Kurangi"} Stok`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation AlertDialog */}
        <AlertDialog open={!!deletingItem} onOpenChange={(open) => { if (!open && !isSaving) setDeletingItem(null) }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Hapus item?</AlertDialogTitle>
              <AlertDialogDescription>
                {deletingItem && `"${deletingItem.name}" akan dihapus dari inventori. Tindakan ini tidak dapat dibatalkan.`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isSaving}>Batal</AlertDialogCancel>
              <AlertDialogAction onClick={confirmDelete} disabled={isSaving} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                {isSaving ? "Menghapus..." : "Hapus"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
}
