"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { toast } from "@/hooks/use-toast"
import { useFirebaseInventory } from "@/hooks/use-firebase"
import { formatCurrency } from "@/lib/utils"
import { Package, Truck, MapPin, AlertTriangle, Plus, Minus, Barcode } from "lucide-react"

interface ProductInfoPopupProps {
  barcode: string
  isOpen: boolean
  onClose: () => void
}

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
}

export function ProductInfoPopup({ barcode, isOpen, onClose }: ProductInfoPopupProps) {
  const { items, addItem, updateItem } = useFirebaseInventory()
  const [isAddingNew, setIsAddingNew] = useState(false)
  const [isUpdatingStock, setIsUpdatingStock] = useState(false)
  const [stockAdjustment, setStockAdjustment] = useState(1)

  // Find product by barcode
  const product = items.find((item) => item.barcode === barcode)

  // Form state for new product - barcode is auto-filled and readonly
  const [newProduct, setNewProduct] = useState<Omit<InventoryItem, "id" | "createdAt" | "updatedAt">>({
    name: "",
    category: "Umum",
    quantity: 1,
    minStock: 5,
    price: 0,
    description: "",
    location: "Gudang Utama",
    barcode: barcode, // Auto-filled from scan
    supplier: "",
  })

  // Update barcode when prop changes
  useEffect(() => {
    setNewProduct((prev) => ({
      ...prev,
      barcode: barcode,
    }))
  }, [barcode])

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (isOpen && !product) {
      setIsAddingNew(false)
      setNewProduct({
        name: "",
        category: "Umum",
        quantity: 1,
        minStock: 5,
        price: 0,
        description: "",
        location: "Gudang Utama",
        barcode: barcode,
        supplier: "",
      })
    }
  }, [isOpen, product, barcode])

  // Handle input change for new product form
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setNewProduct((prev) => ({
      ...prev,
      [name]: name === "quantity" || name === "minStock" || name === "price" ? Number(value) : value,
    }))
  }

  // Handle add new product
  const handleAddProduct = async () => {
    try {
      // Validate required fields
      if (!newProduct.name || !newProduct.barcode) {
        toast({
          title: "Error",
          description: "Nama produk dan barcode harus diisi",
          variant: "destructive",
        })
        return
      }

      // Check if barcode already exists
      const existingProduct = items.find((item) => item.barcode === newProduct.barcode)
      if (existingProduct) {
        toast({
          title: "Error",
          description: "Barcode sudah terdaftar untuk produk lain",
          variant: "destructive",
        })
        return
      }

      await addItem(newProduct)
      toast({
        title: "✅ Produk Ditambahkan",
        description: `${newProduct.name} berhasil ditambahkan ke inventaris`,
      })
      setIsAddingNew(false)
      onClose()
    } catch (error) {
      toast({
        title: "Error",
        description: "Gagal menambahkan produk",
        variant: "destructive",
      })
    }
  }

  // Handle stock adjustment
  const handleStockAdjustment = async (adjustment: number) => {
    if (!product) return

    try {
      const newQuantity = Math.max(0, product.quantity + adjustment)
      await updateItem(product.id, { quantity: newQuantity, updatedAt: Date.now() })
      toast({
        title: "📦 Stok Diperbarui",
        description: `Stok ${product.name} diperbarui menjadi ${newQuantity}`,
      })
      setIsUpdatingStock(false)
    } catch (error) {
      toast({
        title: "Error",
        description: "Gagal memperbarui stok",
        variant: "destructive",
      })
    }
  }

  // Handle quick stock adjustment
  const handleQuickAdjustment = async (adjustment: number) => {
    if (!product) return
    await handleStockAdjustment(adjustment)
  }

  // Render product not found view
  const renderProductNotFound = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-center p-6 bg-yellow-50 rounded-lg border border-yellow-200">
        <div className="flex flex-col items-center text-center">
          <AlertTriangle className="h-12 w-12 text-yellow-500 mb-2" />
          <h3 className="text-lg font-medium text-yellow-800">Produk Tidak Ditemukan</h3>
          <p className="text-sm text-yellow-600 mt-1">
            Barcode <span className="font-mono font-bold bg-yellow-100 px-2 py-1 rounded">{barcode}</span> belum
            terdaftar dalam database
          </p>
        </div>
      </div>

      {isAddingNew ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-4">
            <Package className="h-5 w-5 text-blue-600" />
            <h3 className="text-lg font-medium">Tambah Produk Baru</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nama Produk *</Label>
              <Input
                id="name"
                name="name"
                value={newProduct.name}
                onChange={handleInputChange}
                placeholder="Masukkan nama produk"
                required
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="barcode">Barcode *</Label>
              <div className="relative">
                <Barcode className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  id="barcode"
                  name="barcode"
                  value={newProduct.barcode}
                  onChange={handleInputChange}
                  placeholder="Barcode"
                  required
                  readOnly
                  className="pl-10 bg-gray-50 font-mono"
                />
              </div>
              <p className="text-xs text-gray-500">Barcode terisi otomatis dari hasil scan</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="category">Kategori</Label>
              <select
                id="category"
                name="category"
                value={newProduct.category}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="Umum">Umum</option>
                <option value="Elektronik">Elektronik</option>
                <option value="Pakaian">Pakaian</option>
                <option value="Makanan">Makanan & Minuman</option>
                <option value="Alat Tulis">Alat Tulis</option>
                <option value="Kesehatan">Kesehatan</option>
                <option value="Otomotif">Otomotif</option>
                <option value="Rumah Tangga">Rumah Tangga</option>
                <option value="Lainnya">Lainnya</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="price">Harga (Rp)</Label>
              <Input
                id="price"
                name="price"
                type="number"
                value={newProduct.price}
                onChange={handleInputChange}
                placeholder="0"
                min="0"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quantity">Stok Awal</Label>
              <Input
                id="quantity"
                name="quantity"
                type="number"
                value={newProduct.quantity}
                onChange={handleInputChange}
                placeholder="1"
                min="0"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="minStock">Stok Minimum</Label>
              <Input
                id="minStock"
                name="minStock"
                type="number"
                value={newProduct.minStock}
                onChange={handleInputChange}
                placeholder="5"
                min="0"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="location">Lokasi</Label>
              <Input
                id="location"
                name="location"
                value={newProduct.location}
                onChange={handleInputChange}
                placeholder="Gudang Utama"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="supplier">Supplier</Label>
              <Input
                id="supplier"
                name="supplier"
                value={newProduct.supplier || ""}
                onChange={handleInputChange}
                placeholder="Nama supplier"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="description">Deskripsi</Label>
              <Textarea
                id="description"
                name="description"
                value={newProduct.description}
                onChange={handleInputChange}
                placeholder="Deskripsi produk"
                rows={3}
              />
            </div>
          </div>

          <div className="flex justify-end space-x-2 pt-4 border-t">
            <Button variant="outline" onClick={() => setIsAddingNew(false)}>
              Batal
            </Button>
            <Button onClick={handleAddProduct} className="bg-blue-600 hover:bg-blue-700">
              <Plus className="h-4 w-4 mr-2" />
              Simpan Produk
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex justify-center">
          <Button onClick={() => setIsAddingNew(true)} className="bg-blue-600 hover:bg-blue-700">
            <Plus className="h-4 w-4 mr-2" />
            Tambah Produk Baru
          </Button>
        </div>
      )}
    </div>
  )

  // Render product info view
  const renderProductInfo = () => {
    if (!product) return null

    return (
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row gap-6">
          {/* Product image or icon */}
          <div className="flex items-center justify-center w-full md:w-1/3 bg-gradient-to-br from-blue-50 to-indigo-100 rounded-lg p-6">
            <Package className="h-24 w-24 text-blue-500" />
          </div>

          {/* Product details */}
          <div className="w-full md:w-2/3 space-y-4">
            <div>
              <h3 className="text-2xl font-bold text-gray-900">{product.name}</h3>
              <div className="flex items-center gap-2 mt-2">
                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                  {product.category}
                </Badge>
                <span className="text-sm text-gray-500 font-mono bg-gray-100 px-2 py-1 rounded">{product.barcode}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-green-50 p-3 rounded-lg">
                <p className="text-sm text-green-600 font-medium">Harga</p>
                <p className="text-xl font-bold text-green-700">{formatCurrency(product.price)}</p>
              </div>
              <div className="bg-blue-50 p-3 rounded-lg">
                <p className="text-sm text-blue-600 font-medium">Stok</p>
                <div className="flex items-center gap-2">
                  <p className="text-xl font-bold text-blue-700">{product.quantity}</p>
                  <Badge variant={product.quantity <= product.minStock ? "destructive" : "default"}>
                    {product.quantity <= product.minStock ? "Stok Rendah" : "Tersedia"}
                  </Badge>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center gap-2 text-gray-600">
                <MapPin className="h-4 w-4" />
                <span>{product.location}</span>
              </div>
              {product.supplier && (
                <div className="flex items-center gap-2 text-gray-600">
                  <Truck className="h-4 w-4" />
                  <span>{product.supplier}</span>
                </div>
              )}
            </div>

            {product.description && (
              <div className="bg-gray-50 p-3 rounded-lg">
                <p className="text-sm text-gray-500 font-medium">Deskripsi</p>
                <p className="text-sm text-gray-700 mt-1">{product.description}</p>
              </div>
            )}
          </div>
        </div>

        {/* Stock adjustment */}
        {isUpdatingStock ? (
          <div className="space-y-4 border-t pt-4">
            <h4 className="font-medium">Penyesuaian Stok</h4>
            <div className="flex items-center gap-4">
              <Button variant="outline" size="icon" onClick={() => setStockAdjustment((prev) => Math.max(1, prev - 1))}>
                <Minus className="h-4 w-4" />
              </Button>
              <Input
                type="number"
                value={stockAdjustment}
                onChange={(e) => setStockAdjustment(Math.max(1, Number.parseInt(e.target.value) || 1))}
                className="w-20 text-center"
                min="1"
              />
              <Button variant="outline" size="icon" onClick={() => setStockAdjustment((prev) => prev + 1)}>
                <Plus className="h-4 w-4" />
              </Button>
              <div className="flex-1 flex justify-end gap-2">
                <Button variant="outline" onClick={() => setIsUpdatingStock(false)}>
                  Batal
                </Button>
                <Button variant="destructive" onClick={() => handleStockAdjustment(-stockAdjustment)}>
                  Kurangi Stok
                </Button>
                <Button onClick={() => handleStockAdjustment(stockAdjustment)}>Tambah Stok</Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex justify-between border-t pt-4">
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => handleQuickAdjustment(-1)}>
                <Minus className="h-4 w-4 mr-1" /> Kurangi 1
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleQuickAdjustment(1)}>
                <Plus className="h-4 w-4 mr-1" /> Tambah 1
              </Button>
            </div>
            <Button onClick={() => setIsUpdatingStock(true)}>Sesuaikan Stok</Button>
          </div>
        )}
      </div>
    )
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            {product ? "Informasi Produk" : "Produk Tidak Ditemukan"}
          </DialogTitle>
        </DialogHeader>
        {product ? renderProductInfo() : renderProductNotFound()}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Tutup
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
