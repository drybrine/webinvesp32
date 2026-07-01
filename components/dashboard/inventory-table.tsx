"use client"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
  Plus,
  Eye,
  Edit,
  Trash2,
  Minus,
  Filter,
  Download,
  Search,
} from "lucide-react"
import { InventoryItem } from "@/hooks/use-firebase"

interface InventoryTableProps {
  inventory: InventoryItem[]
  filteredInventory: InventoryItem[]
  searchTerm: string
  onSearchChange: (value: string) => void
  filterCategory: string
  onFilterCategoryChange: (value: string) => void
  sortOrder: string
  onSortOrderChange: (value: string) => void
  categories: string[]
  onAddItem: () => void
  onExport: () => void
  onView: (item: InventoryItem) => void
  onEdit: (item: InventoryItem) => void
  onDelete: (id: string, name: string) => void
  onStockAdjust: (item: InventoryItem, type: "add" | "subtract") => void
  lowStockItems: InventoryItem[]
  canWrite: boolean
}

export default function InventoryTable({
  filteredInventory,
  searchTerm,
  onSearchChange,
  filterCategory,
  onFilterCategoryChange,
  sortOrder,
  onSortOrderChange,
  categories,
  onAddItem,
  onExport,
  onView,
  onEdit,
  onDelete,
  onStockAdjust,
  lowStockItems,
  canWrite,
}: InventoryTableProps) {
  return (
    <>
      <LowStockAlert lowStockItems={lowStockItems} />
      <Card className="overflow-hidden border-border/80 bg-card/95 shadow-sm ring-1 ring-border/30">
        <CardHeader className="border-b bg-muted/25">
          <div className="flex flex-col space-y-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
            <div>
              <CardTitle className="text-xl font-bold text-foreground">
                Inventory ({filteredInventory.length})
              </CardTitle>
              <CardDescription className="text-sm text-muted-foreground mt-0.5">
                Kelola dan pantau stok barang Anda
              </CardDescription>
            </div>

            <div className="flex flex-col space-y-2 sm:flex-row sm:space-y-0 sm:space-x-3">
              {canWrite && (
                <Button onClick={onAddItem} size="sm" title="Tekan N untuk tambah item">
                  <Plus className="w-4 h-4 mr-2" />
                  Tambah Item
                </Button>
              )}
              <Button variant="outline" onClick={onExport} size="sm">
                <Download className="w-4 h-4 mr-2" />
                Export CSV
              </Button>
            </div>
          </div>

          <div className="flex flex-col space-y-3 sm:flex-row sm:space-y-0 sm:space-x-4 mt-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Cari item..."
                value={searchTerm}
                onChange={(e) => onSearchChange(e.target.value)}
                className="pl-10"
                title="Tekan / untuk fokus pencarian"
              />
            </div>
            <div className="flex flex-col space-y-2 sm:flex-row sm:space-y-0 sm:space-x-2">
              <Select value={filterCategory} onValueChange={onFilterCategoryChange}>
                <SelectTrigger className="w-full sm:w-[150px]" aria-label="Filter kategori">
                  <Filter className="h-4 w-4 mr-2 text-muted-foreground" />
                  <SelectValue placeholder="Kategori" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((category) => (
                    <SelectItem key={category} value={category}>
                      {category === "all" ? "Semua Kategori" : category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={sortOrder} onValueChange={onSortOrderChange}>
                <SelectTrigger className="w-full sm:w-[150px]" aria-label="Urutkan">
                  <SelectValue placeholder="Urutan" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name-asc">Nama A-Z</SelectItem>
                  <SelectItem value="name-desc">Nama Z-A</SelectItem>
                  <SelectItem value="quantity-asc">Stok Tertinggi</SelectItem>
                  <SelectItem value="quantity-desc">Stok Terendah</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {/* Mobile View */}
          <div className="block sm:hidden p-4 space-y-3">
            {filteredInventory.length === 0 ? (
              <EmptyState />
            ) : (
              filteredInventory.map((item) => (
                <MobileCard key={item.id} item={item} onView={onView} onEdit={onEdit} onDelete={onDelete} onStockAdjust={onStockAdjust} canWrite={canWrite} />
              ))
            )}
          </div>

          {/* Desktop View */}
          <div className="hidden sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[250px]">Item</TableHead>
                  <TableHead className="w-[120px]">Kategori</TableHead>
                  <TableHead className="text-center w-[100px]">Stok</TableHead>
                  <TableHead className="w-[120px]">Lokasi</TableHead>
                  <TableHead className="text-right w-[180px]">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredInventory.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12">
                      <EmptyState />
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredInventory.map((item) => (
                    <DesktopRow key={item.id} item={item} onView={onView} onEdit={onEdit} onDelete={onDelete} onStockAdjust={onStockAdjust} canWrite={canWrite} />
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </>
  )
}

function LowStockAlert({ lowStockItems }: { lowStockItems: InventoryItem[] }) {
  if (lowStockItems.length === 0) return null

  const criticalItems = lowStockItems.filter(item => item.quantity === 0)
  const warningItems = lowStockItems.filter(item => item.quantity > 0 && item.quantity <= item.minStock)

  return (
    <div className="mb-6 rounded-lg border border-amber-200/70 bg-amber-50/70 p-4 shadow-sm ring-1 ring-amber-100">
      <div className="flex items-center gap-2 font-semibold text-amber-800 mb-3">
        <span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse"></span>
        {lowStockItems.length} Item Memerlukan Perhatian
      </div>
      <div className="space-y-3">
        {criticalItems.length > 0 && (
          <div className="rounded-md border border-red-200 bg-red-50/80 p-3">
            <div className="font-medium text-red-700 mb-2 text-xs uppercase tracking-wide">Habis ({criticalItems.length})</div>
            <div className="flex flex-wrap gap-2">
              {criticalItems.slice(0, 6).map(item => (
                <span key={item.id} className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 rounded text-xs font-medium">
                  <span className="w-1.5 h-1.5 bg-red-500 rounded-full"></span>
                  {item.name}
                </span>
              ))}
              {criticalItems.length > 6 && (
                <span className="text-xs text-red-600 font-medium self-center">+{criticalItems.length - 6} lainnya</span>
              )}
            </div>
          </div>
        )}
        {warningItems.length > 0 && (
          <div className="rounded-md border border-amber-200 bg-card/90 p-3">
            <div className="font-medium text-amber-700 mb-2 text-xs uppercase tracking-wide">Stok Rendah ({warningItems.length})</div>
            <div className="flex flex-wrap gap-2">
              {warningItems.slice(0, 6).map(item => (
                <span key={item.id} className="inline-flex items-center gap-1 px-2 py-1 bg-amber-100 text-amber-700 rounded text-xs font-medium">
                  <span className="w-1.5 h-1.5 bg-amber-500 rounded-full"></span>
                  {item.name} ({item.quantity})
                </span>
              ))}
              {warningItems.length > 6 && (
                <span className="text-xs text-amber-600 font-medium self-center">+{warningItems.length - 6} lainnya</span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="text-center py-12">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Package className="h-6 w-6" />
      </div>
      <p className="text-muted-foreground font-medium">Tidak ada item yang ditemukan</p>
      <p className="text-sm text-muted-foreground/70 mt-1">Coba ubah filter atau tambah item baru</p>
    </div>
  )
}

function MobileCard({ item, onView, onEdit, onDelete, onStockAdjust, canWrite }: {
  item: InventoryItem
  onView: (item: InventoryItem) => void
  onEdit: (item: InventoryItem) => void
  onDelete: (id: string, name: string) => void
  onStockAdjust: (item: InventoryItem, type: "add" | "subtract") => void
  canWrite: boolean
}) {
  const isLowStock = item.quantity <= item.minStock
  const isOutOfStock = item.quantity === 0

  return (
    <div className="rounded-lg border border-border/80 bg-card/95 p-4 shadow-sm transition-[box-shadow,border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-md">
      <div className="flex justify-between items-start mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-foreground truncate text-sm">{item.name}</h2>
            {isOutOfStock && <Badge variant="destructive" className="text-xs">Habis</Badge>}
            {isLowStock && !isOutOfStock && <Badge variant="secondary" className="text-xs">Rendah</Badge>}
          </div>
          <p className="text-xs text-muted-foreground">{item.category}</p>
          {item.barcode && <p className="text-xs font-mono text-muted-foreground/70 mt-1">{item.barcode}</p>}
        </div>
        <Badge variant={isOutOfStock ? "destructive" : isLowStock ? "secondary" : "default"} className="text-sm">
          {item.quantity}
        </Badge>
      </div>
      <div className="grid grid-cols-2 gap-3 text-xs mb-3">
        <div>
          <span className="text-muted-foreground block">Stok Minimum:</span>
          <p className="font-medium text-foreground">{item.minStock}</p>
        </div>
        <div>
          <span className="text-muted-foreground block">Lokasi:</span>
          <p className="font-medium truncate">{item.location || "-"}</p>
        </div>
      </div>
      <div className="flex flex-col gap-2 pt-2 border-t">
        <div className={canWrite ? "grid grid-cols-3 gap-1" : "grid grid-cols-1 gap-1"}>
          <Button variant="ghost" size="sm" className="h-8 text-muted-foreground hover:text-foreground" onClick={() => onView({ ...item, barcode: item.barcode ?? "", supplier: item.supplier ?? "" })}>
            <Eye className="h-3 w-3 mr-1" />
            <span className="text-xs">Lihat</span>
          </Button>
          {canWrite && <Button variant="ghost" size="sm" className="h-8 text-muted-foreground hover:text-foreground" onClick={() => onEdit({ ...item, barcode: item.barcode ?? "", supplier: item.supplier ?? "" })}>
            <Edit className="h-3 w-3 mr-1" />
            <span className="text-xs">Edit</span>
          </Button>}
          {canWrite && <Button variant="ghost" size="sm" className="h-8 text-destructive/70 hover:text-destructive hover:bg-destructive/5" onClick={() => onDelete(item.id, item.name)}>
            <Trash2 className="h-3 w-3 mr-1" />
            <span className="text-xs">Hapus</span>
          </Button>}
        </div>
        {canWrite && <div className="grid grid-cols-2 gap-1">
          <Button size="sm" variant="outline" className="h-9 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700" onClick={() => onStockAdjust(item, "add")}>
            <Plus className="h-3 w-3 mr-1" />
            Tambah Stok
          </Button>
          <Button size="sm" variant="outline" className="h-9" onClick={() => onStockAdjust(item, "subtract")} disabled={item.quantity <= 0}>
            <Minus className="h-3 w-3 mr-1" />
            Kurangi Stok
          </Button>
        </div>}
      </div>
    </div>
  )
}

function DesktopRow({ item, onView, onEdit, onDelete, onStockAdjust, canWrite }: {
  item: InventoryItem
  onView: (item: InventoryItem) => void
  onEdit: (item: InventoryItem) => void
  onDelete: (id: string, name: string) => void
  onStockAdjust: (item: InventoryItem, type: "add" | "subtract") => void
  canWrite: boolean
}) {
  const isLowStock = item.quantity <= item.minStock
  const isOutOfStock = item.quantity === 0

  return (
    <TableRow className={isOutOfStock ? 'bg-red-50/40' : isLowStock ? 'bg-amber-50/40' : ''}>
      <TableCell>
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isOutOfStock ? 'bg-red-500' : isLowStock ? 'bg-amber-500' : 'bg-emerald-500'}`}></div>
          <div className="min-w-0">
            <div className="font-semibold text-foreground text-sm">{item.name}</div>
            <div className="text-xs text-muted-foreground truncate max-w-[200px]">{item.description || "-"}</div>
          </div>
        </div>
      </TableCell>
      <TableCell className="text-muted-foreground text-sm">{item.category}</TableCell>
      <TableCell className="text-center">
        <Badge variant={isOutOfStock ? "destructive" : isLowStock ? "secondary" : "default"} className="font-mono">
          {item.quantity}
        </Badge>
        {isLowStock && <div className="text-[11px] text-muted-foreground mt-0.5">Min: {item.minStock}</div>}
      </TableCell>
      <TableCell className="text-muted-foreground text-sm">{item.location || "-"}</TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end items-center gap-1">
          {canWrite && <Button variant="ghost" size="sm" className="h-8 px-2 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800" onClick={() => onStockAdjust(item, "add")} title="Tambah stok">
            <Plus className="h-3.5 w-3.5 mr-1" />
            <span className="text-xs">Tambah</span>
          </Button>}
          {canWrite && <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => onStockAdjust(item, "subtract")} disabled={item.quantity <= 0} title="Kurangi stok">
            <Minus className="h-3.5 w-3.5 mr-1" />
            <span className="text-xs">Kurangi</span>
          </Button>}
          {canWrite && <div className="w-px h-4 bg-border mx-0.5" />}
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground" onClick={() => onView({ ...item, barcode: item.barcode ?? "", supplier: item.supplier ?? "" })} title="Lihat detail">
            <Eye className="h-3.5 w-3.5" />
          </Button>
          {canWrite && <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground" onClick={() => onEdit({ ...item, barcode: item.barcode ?? "", supplier: item.supplier ?? "" })} title="Edit item">
            <Edit className="h-3.5 w-3.5" />
          </Button>}
          {canWrite && <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive/70 hover:text-destructive hover:bg-destructive/5" onClick={() => onDelete(item.id, item.name)} title="Hapus item">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>}
        </div>
      </TableCell>
    </TableRow>
  )
}
