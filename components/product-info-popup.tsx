"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog" //
import { Button } from "@/components/ui/button" //
import { Input } from "@/components/ui/input" //
import { Label } from "@/components/ui/label" //
import { Textarea } from "@/components/ui/textarea" //
import { Badge } from "@/components/ui/badge" //
import { toast } from "@/hooks/use-toast" //
import { useFirebaseInventory } from "@/hooks/use-firebase" //
import { formatCurrency } from "@/lib/utils" //
import { Package, Truck, MapPin, AlertTriangle, Plus, Minus, Barcode as BarcodeIcon, PackagePlus } from "lucide-react" //
import BarcodeComponent from "react-barcode" //

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
  barcode?: string //
  supplier?: string //
  createdAt: any
  updatedAt: any
}

export function ProductInfoPopup({ barcode, isOpen, onClose }: ProductInfoPopupProps) {
  const { items, addItem, updateItem } = useFirebaseInventory() //
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
    barcode: barcode, // Auto-filled from scan //
    supplier: "",
  })

  // Update barcode and reset/prepare form when dialog opens or barcode changes
  useEffect(() => {
    if (isOpen) {
      // Always reset stock adjustment mode when dialog opens or barcode changes
      setIsUpdatingStock(false);
      setStockAdjustment(1);

      const currentBarcode = barcode || ""; 

      if (!product) { // Product not found by barcode
        setIsAddingNew(true); // Default to showing the add form for new items
        setNewProduct({
          name: "",
          category: "Umum",
          quantity: 1,
          minStock: 5,
          price: 0,
          description: "",
          location: "Gudang Utama",
          barcode: currentBarcode, 
          supplier: "",
        });
      } else { // Product found
        setIsAddingNew(false); // Product found, don't show add form initially
      }
    }
  }, [isOpen, product, barcode]);


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
          description: "Nama produk dan barcode harus diisi", //
          variant: "destructive",
        })
        return
      }

      // Check if barcode already exists
      const existingProduct = items.find((item) => item.barcode === newProduct.barcode) //
      if (existingProduct) {
        toast({
          title: "Error",
          description: "Barcode sudah terdaftar untuk produk lain", //
          variant: "destructive",
        })
        return
      }

      await addItem(newProduct) //
      toast({
        title: "✅ Produk Ditambahkan",
        description: `${newProduct.name} berhasil ditambahkan ke inventaris`,
      })
      setIsAddingNew(false)
      onClose()
    } catch (error) {
      toast({
        title: "Error",
        description: "Gagal menambahkan produk", //
        variant: "destructive",
      })
    }
  }

  // Handle stock adjustment
  const handleStockAdjustment = async (adjustment: number) => {
    if (!product) return

    try {
      const newQuantity = Math.max(0, product.quantity + adjustment)
      await updateItem(product.id, { quantity: newQuantity, updatedAt: Date.now() }) //
      toast({
        title: "📦 Stok Diperbarui",
        description: `Stok ${product.name} diperbarui menjadi ${newQuantity}`,
      })
      setIsUpdatingStock(false)
    } catch (error) {
      toast({
        title: "Error",
        description: "Gagal memperbarui stok", //
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
      <div className="flex items-center justify-center p-6 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-700/30">
        <div className="flex flex-col items-center text-center">
          <AlertTriangle className="h-12 w-12 text-yellow-500 dark:text-yellow-400 mb-2" />
          <h3 className="text-lg font-medium text-yellow-800 dark:text-yellow-300">Produk Tidak Ditemukan</h3>
          <p className="text-sm text-yellow-600 dark:text-yellow-400/80 mt-1">
            Barcode <span className="font-mono font-bold bg-yellow-100 dark:bg-yellow-800/30 px-2 py-1 rounded">{barcode}</span> belum
            terdaftar.
          </p>
        </div>
      </div>

      {isAddingNew ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-4">
            <PackagePlus className="h-5 w-5 text-blue-600 dark:text-blue-400" />
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
              <Label htmlFor="new-product-barcode">Barcode *</Label>
              <div className="relative">
                <BarcodeIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500" />
                <Input
                  id="new-product-barcode"
                  name="barcode"
                  value={newProduct.barcode || ""}
                  onChange={handleInputChange}
                  placeholder="Barcode"
                  required
                  readOnly
                  className="pl-10 bg-gray-100 dark:bg-gray-700 font-mono"
                />
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Barcode terisi otomatis dari hasil scan.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="category">Kategori</Label>
              <select
                id="category"
                name="category"
                value={newProduct.category}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-input bg-background rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-ring dark:border-gray-600 dark:bg-gray-700 dark:text-white"
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

          <div className="flex justify-end space-x-2 pt-4 border-t dark:border-gray-700">
            <Button variant="outline" onClick={() => { setIsAddingNew(false); onClose();}}> 
              Batal
            </Button>
            <Button onClick={handleAddProduct} className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600">
              <Plus className="h-4 w-4 mr-2" />
              Simpan Produk
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex justify-center">
          <Button onClick={() => setIsAddingNew(true)} className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600">
            <PackagePlus className="h-4 w-4 mr-2" />
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
          {/* Barcode 1D & Product Icon */}
          <div className="flex flex-col items-center md:w-1/3 space-y-4">
            <div className="flex items-center justify-center w-full h-32 bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-blue-900/30 dark:to-indigo-900/30 rounded-lg p-4">
              <Package className="h-20 w-20 text-blue-500 dark:text-blue-400" />
            </div>
            <div className="flex flex-col items-center justify-center">
              <div className="bg-white p-2 rounded border dark:bg-gray-800 dark:border-gray-700">
                <BarcodeComponent
                  value={product.barcode ?? ""}
                  format="CODE128"
                  width={1.5} // Adjusted for better readability
                  height={50} // Adjusted height
                  displayValue={false} // Value displayed below separately
                  background="transparent" // Use transparent for dark mode compatibility
                  lineColor={document.body.classList.contains('dark') ? '#FFFFFF' : '#000000'}
                />
              </div>
              <span className="text-xs text-gray-500 dark:text-gray-400 mt-1 font-mono">{product.barcode}</span>
            </div>
          </div>
          

          {/* Product details */}
          <div className="w-full md:w-2/3 space-y-4">
            <div>
              <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{product.name}</h3>
              <div className="flex items-center gap-2 mt-2">
                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/50 dark:text-blue-300 dark:border-blue-700">
                  {product.category}
                </Badge>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-green-50 dark:bg-green-900/30 p-3 rounded-lg">
                <p className="text-sm text-green-600 dark:text-green-400 font-medium">Harga</p>
                <p className="text-xl font-bold text-green-700 dark:text-green-300">{formatCurrency(product.price)}</p>
              </div>
              <div className="bg-blue-50 dark:bg-blue-900/30 p-3 rounded-lg">
                <p className="text-sm text-blue-600 dark:text-blue-400 font-medium">Stok</p>
                <div className="flex items-center gap-2">
                  <p className="text-xl font-bold text-blue-700 dark:text-blue-300">{product.quantity}</p>
                  <Badge variant={product.quantity <= product.minStock ? "destructive" : "default"} 
                         className={product.quantity <= product.minStock 
                                    ? "bg-red-500 dark:bg-red-600" 
                                    : "bg-blue-500 dark:bg-blue-600"}>
                    {product.quantity <= product.minStock ? "Stok Rendah" : "Tersedia"}
                  </Badge>
                </div>
                 <p className="text-xs text-gray-500 dark:text-gray-400">Min. Stok: {product.minStock}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                <MapPin className="h-4 w-4" />
                <span>Lokasi: <span className="font-medium">{product.location}</span></span>
              </div>
              {product.supplier && (
                <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                  <Truck className="h-4 w-4" />
                  <span>Supplier: <span className="font-medium">{product.supplier}</span></span>
                </div>
              )}
            </div>

            {product.description && (
              <div className="bg-gray-50 dark:bg-gray-700/50 p-3 rounded-lg">
                <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Deskripsi</p>
                <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">{product.description}</p>
              </div>
            )}
          </div>
        </div>

        {/* Stock adjustment */}
        <div className="border-t dark:border-gray-700 pt-4">
          {isUpdatingStock ? (
            <div className="space-y-4">
              <h4 className="font-medium">Penyesuaian Stok Manual</h4>
              <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4">
                <div className="flex items-center gap-2">
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
                </div>
                <div className="flex-1 flex flex-col sm:flex-row justify-end gap-2 mt-2 sm:mt-0 w-full sm:w-auto">
                  <Button variant="destructive" onClick={() => handleStockAdjustment(-stockAdjustment)} className="w-full sm:w-auto">
                    Kurangi Stok
                  </Button>
                  <Button onClick={() => handleStockAdjustment(stockAdjustment)} className="w-full sm:w-auto bg-green-600 hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-600">
                    Tambah Stok
                  </Button>
                </div>
              </div>
               <Button variant="outline" onClick={() => setIsUpdatingStock(false)} className="w-full sm:w-auto mt-2 sm:mt-0">
                Batal Penyesuaian
              </Button>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row justify-between items-center gap-2">
              <p className="text-sm text-gray-600 dark:text-gray-400">Perlu mengubah jumlah stok?</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => handleQuickAdjustment(-1)}>
                  <Minus className="h-4 w-4 mr-1" /> Kurangi 1
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleQuickAdjustment(1)}>
                  <Plus className="h-4 w-4 mr-1" /> Tambah 1
                </Button>
                <Button onClick={() => setIsUpdatingStock(true)} size="sm" className="bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600">
                  Sesuaikan Manual
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Package className="h-6 w-6" />
            {product ? "Informasi Produk" : "Produk Tidak Ditemukan"}
          </DialogTitle>
        </DialogHeader>
        <div className="py-4">
         {product ? renderProductInfo() : renderProductNotFound()}
        </div>
        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={onClose}>
            Tutup
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}