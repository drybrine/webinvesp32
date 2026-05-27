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
}: InventoryTableProps) {
  return (
    <>
      <LowStockAlert lowStockItems={lowStockItems} />
      <Card className="shadow-sm">
        <CardHeader className="border-b bg-muted/30">
          <div className="flex flex-col space-y-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
            <div>
              <CardTitle className="text-xl font-bold text-foreground">
                Inventory ({filteredInventory.length})
              </CardTitle>
              <CardDescription className="text-sm text-muted-foreground mt-1">
                Kelola dan pantau stok barang Anda
              </CardDescription>
            </div>

            <div className="flex flex-col space-y-2 sm:flex-row sm:space-y-0 sm:space-x-3">
              <Button onClick={onAddItem} size="sm">
                <Plus className="w-4 h-4 mr-2" />
                Tambah Item
              </Button>
              <Button variant="outline" onClick={onExport} size="sm">
                <Download className="w-4 h-4 mr-2" />
                Export CSV
              </Button>
            </div>
          </div>

          <div className="flex flex-col space-y-3 sm:flex-row sm:space-y-0 sm:space-x-4 mt-4 p-4 bg-muted/20 rounded-lg">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Cari item..."
                value={searchTerm}
                onChange={(e) => onSearchChange(e.target.value)}
                className="pl-10"
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
                  <SelectItem value="price-asc">Harga Terendah</SelectItem>
                  <SelectItem value="price-desc">Harga Tertinggi</SelectItem>
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
                <MobileCard key={item.id} item={item} onView={onView} onEdit={onEdit} onDelete={onDelete} onStockAdjust={onStockAdjust} />
              ))
            )}
          </div>

          {/* Desktop View */}
          <div className="hidden sm:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-[250px]">Item</TableHead>
                  <TableHead className="w-[120px]">Kategori</TableHead>
                  <TableHead className="text-center w-[100px]">Stok</TableHead>
                  <TableHead className="text-right w-[120px]">Harga</TableHead>
                  <TableHead className="w-[120px]">Lokasi</TableHead>
                  <TableHead className="text-right w-[180px]">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredInventory.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12">
                      <EmptyState />
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredInventory.map((item) => (
                    <DesktopRow key={item.id} item={item} onView={onView} onEdit={onEdit} onDelete={onDelete} onStockAdjust={onStockAdjust} />
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
    <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
      <div className="flex items-center gap-2 font-semibold text-amber-800 mb-3">
        <span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse"></span>
        {lowStockItems.length} Item Memerlukan Perhatian
      </div>
      <div className="space-y-3">
        {criticalItems.length > 0 && (
          <div className="bg-white rounded-lg p-3 border border-red-200">
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
          <div className="bg-white rounded-lg p-3 border border-amber-200">
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
      <Package className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
      <p className="text-muted-foreground font-medium">Tidak ada item yang ditemukan</p>
      <p className="text-sm text-muted-foreground/70 mt-1">Coba ubah filter atau tambah item baru</p>
    </div>
  )
}

function MobileCard({ item, onView, onEdit, onDelete, onStockAdjust }: {
  item: InventoryItem
  onView: (item: InventoryItem) => void
  onEdit: (item: InventoryItem) => void
  onDelete: (id: string, name: string) => void
  onStockAdjust: (item: InventoryItem, type: "add" | "subtract") => void
}) {
  const isLowStock = item.quantity <= item.minStock
  const isOutOfStock = item.quantity === 0

  return (
    <div className="border rounded-lg p-4 bg-card hover:shadow-md transition-shadow">
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
          <span className="text-muted-foreground block">Harga:</span>
          <p className="font-medium text-foreground">Rp {item.price.toLocaleString()}</p>
        </div>
        <div>
          <span className="text-muted-foreground block">Lokasi:</span>
          <p className="font-medium truncate">{item.location || "-"}</p>
        </div>
      </div>
      <div className="flex justify-between items-center pt-2 border-t">
        <div className="flex gap-1">
          <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => onView({ ...item, barcode: item.barcode ?? "", supplier: item.supplier ?? "" })}>
            <Eye className="h-3 w-3" />
          </Button>
          <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => onEdit({ ...item, barcode: item.barcode ?? "", supplier: item.supplier ?? "" })}>
            <Edit className="h-3 w-3" />
          </Button>
          <Button variant="outline" size="sm" className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10" onClick={() => onDelete(item.id, item.name)}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant="outline" className="h-8 px-2 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700" onClick={() => onStockAdjust(item, "add")}>
            <Plus className="h-3 w-3 mr-1" />
            Tambah
          </Button>
          <Button size="sm" variant="outline" className="h-8 px-2" onClick={() => onStockAdjust(item, "subtract")} disabled={item.quantity <= 0}>
            <Minus className="h-3 w-3 mr-1" />
            Kurang
          </Button>
        </div>
      </div>
    </div>
  )
}

function DesktopRow({ item, onView, onEdit, onDelete, onStockAdjust }: {
  item: InventoryItem
  onView: (item: InventoryItem) => void
  onEdit: (item: InventoryItem) => void
  onDelete: (id: string, name: string) => void
  onStockAdjust: (item: InventoryItem, type: "add" | "subtract") => void
}) {
  const isLowStock = item.quantity <= item.minStock
  const isOutOfStock = item.quantity === 0

  return (
    <TableRow className={isOutOfStock ? 'bg-red-50/50' : isLowStock ? 'bg-amber-50/50' : ''}>
      <TableCell>
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isOutOfStock ? 'bg-red-500' : isLowStock ? 'bg-amber-500' : 'bg-emerald-500'}`}></div>
          <div className="min-w-0">
            <div className="font-medium text-foreground">{item.name}</div>
            <div className="text-sm text-muted-foreground truncate max-w-[200px]">{item.description || "-"}</div>
          </div>
        </div>
      </TableCell>
      <TableCell className="text-muted-foreground">{item.category}</TableCell>
      <TableCell className="text-center">
        <Badge variant={isOutOfStock ? "destructive" : isLowStock ? "secondary" : "default"}>
          {item.quantity}
        </Badge>
        {isLowStock && <div className="text-xs text-muted-foreground mt-1">Min: {item.minStock}</div>}
      </TableCell>
      <TableCell className="text-right font-medium text-foreground">Rp {item.price.toLocaleString()}</TableCell>
      <TableCell className="text-muted-foreground">{item.location || "-"}</TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => onView({ ...item, barcode: item.barcode ?? "", supplier: item.supplier ?? "" })} title="Lihat">
            <Eye className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => onEdit({ ...item, barcode: item.barcode ?? "", supplier: item.supplier ?? "" })} title="Edit">
            <Edit className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" className="h-8 w-8 p-0 text-emerald-600 hover:bg-emerald-50" onClick={() => onStockAdjust(item, "add")} title="Tambah Stok">
            <Plus className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => onStockAdjust(item, "subtract")} disabled={item.quantity <= 0} title="Kurangi">
            <Minus className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10" onClick={() => onDelete(item.id, item.name)} title="Hapus">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  )
}