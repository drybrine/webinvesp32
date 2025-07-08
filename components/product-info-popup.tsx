"use client"

import React, { useState, useEffect, useCallback } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import { useFirebaseInventory } from "@/hooks/use-firebase"
import { firebaseHelpers } from "@/lib/firebase"
import { Package, AlertTriangle, Plus, Minus, Edit, Trash2, Zap, MapPin, Truck, DollarSign, Barcode as BarcodeIcon, PackagePlus } from "lucide-react"
import BarcodeComponent from "react-barcode"

interface ProductInfoPopupProps {
  barcode: string | null
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
  barcode?: string // Make barcode optional to match Firebase hook type
  supplier?: string
  createdAt?: any
  updatedAt?: any
}

export function ProductInfoPopup({ barcode, isOpen, onClose }: ProductInfoPopupProps) {
  const { items, addItem, updateItem } = useFirebaseInventory()
  const { toast } = useToast()
  const [product, setProduct] = useState<InventoryItem | null>(null)
  const [viewMode, setViewMode] = useState<"info" | "quickAction" | "manualAdjust" | "addNew">("quickAction")
  const [quickActionAmount, setQuickActionAmount] = useState(1)
  const [manualAdjustmentAmount, setManualAdjustmentAmount] = useState(0)

  const [newProduct, setNewProduct] = useState<Omit<InventoryItem, "id" | "createdAt" | "updatedAt">>({
    name: "",
    barcode: barcode || "",
    category: "Umum",
    quantity: 0,
    minStock: 5,
    price: 0,
    description: "",
    location: "",
    supplier: "",
  })

  useEffect(() => {
    if (barcode) {
      const foundProduct = items.find((item) => item.barcode === barcode)
      
      setProduct(foundProduct || null)
      if (foundProduct) {
        setViewMode("quickAction") // Default ke quick action jika produk ada
      } else {
        setViewMode("addNew") // Default ke tambah baru jika produk tidak ada
        setNewProduct(prev => ({ ...prev, barcode: barcode }));
      }
      setQuickActionAmount(1) // Reset amount
      setManualAdjustmentAmount(0) // Reset amount
    } else {
      setProduct(null)
      setViewMode("info") // Default atau state yang sesuai jika tidak ada barcode
    }
  }, [barcode, items, isOpen]) // Tambahkan isOpen agar reset saat popup dibuka kembali

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setNewProduct(prev => ({
      ...prev,
      [name]: name === "quantity" || name === "minStock" || name === "price" ? Number(value) : value,
    }));
  };

  const handleAddProduct = async () => {
    try {
      // Validasi input yang diperlukan
      if (!newProduct.name.trim()) {
        toast({ title: "Error", description: "Nama produk harus diisi.", variant: "destructive" });
        return;
      }
      
      if (!newProduct.barcode?.trim()) {
        toast({ title: "Error", description: "Barcode harus diisi.", variant: "destructive" });
        return;
      }
      
      if (newProduct.price < 0) {
        toast({ title: "Error", description: "Harga tidak boleh negatif.", variant: "destructive" });
        return;
      }
      
      if (newProduct.quantity < 0) {
        toast({ title: "Error", description: "Stok awal tidak boleh negatif.", variant: "destructive" });
        return;
      }
      
      if (newProduct.minStock < 0) {
        toast({ title: "Error", description: "Stok minimum tidak boleh negatif.", variant: "destructive" });
        return;
      }
      
      // Cek jika barcode sudah ada (meskipun seharusnya tidak terjadi jika alur dari scan)
      if (items.some(item => item.barcode === newProduct.barcode)) {
        toast({ title: "Error", description: "Barcode sudah terdaftar untuk produk lain.", variant: "destructive" });
        return;
      }
      
      // Add the lastUpdated property
      const productToAdd = {
        ...newProduct,
        lastUpdated: new Date().toISOString() // or whatever format your app uses
      };
      
      await addItem(productToAdd);
      toast({ 
        title: "✅ Produk Ditambahkan", 
        description: `${newProduct.name} berhasil ditambahkan dengan stok awal ${newProduct.quantity} unit.` 
      });
      onClose();
    } catch (error) {
      console.error("Error adding product:", error);
      toast({ title: "Error", description: "Gagal menambahkan produk.", variant: "destructive" });
    }
  };


  const handleStockIn = async () => {
    if (!product || quickActionAmount <= 0) return

    try {
      const newQuantity = product.quantity + quickActionAmount
      await updateItem(product.id, { quantity: newQuantity }) // updateItem dari hook sudah menangani updatedAt

      // Catat transaksi
      const transactionData = {
        type: "in" as "in" | "out" | "adjustment",
        productName: product.name,
        productBarcode: product.barcode,
        quantity: quickActionAmount,
        unitPrice: product.price,
        totalAmount: quickActionAmount * product.price,
        reason: "Stock In via Quick Action Popup",
        operator: "User", // Ganti dengan user yang login jika ada
      }
      await firebaseHelpers.addTransaction(transactionData)

      toast({
        title: "📦 Stock In Berhasil",
        description: `+${quickActionAmount} ${product.name} | Stok: ${product.quantity} → ${newQuantity}. Transaksi dicatat.`,
      })
      onClose()
    } catch (error) {
      console.error("Error during stock in or transaction:", error)
      toast({
        title: "Error",
        description: "Gagal melakukan stock in atau mencatat transaksi.",
        variant: "destructive",
      })
    }
  }

  const handleStockOut = async () => {
    if (!product || quickActionAmount <= 0) return

    if (product.quantity < quickActionAmount) {
      toast({
        title: "⚠️ Stok Tidak Cukup",
        description: `Stok tersedia: ${product.quantity}, diminta: ${quickActionAmount}`,
        variant: "destructive",
      })
      return
    }

    try {
      const newQuantity = Math.max(0, product.quantity - quickActionAmount)
      await updateItem(product.id, { quantity: newQuantity })

      // Catat transaksi
      const transactionData = {
        type: "out" as "in" | "out" | "adjustment",
        productName: product.name,
        productBarcode: product.barcode,
        quantity: -quickActionAmount, // Kuantitas negatif untuk stock out
        unitPrice: product.price,
        totalAmount: -quickActionAmount * product.price, // Total negatif
        reason: "Stock Out via Quick Action Popup",
        operator: "User",
      }
      await firebaseHelpers.addTransaction(transactionData)

      toast({
        title: "📤 Stock Out Berhasil",
        description: `-${quickActionAmount} ${product.name} | Stok: ${product.quantity} → ${newQuantity}. Transaksi dicatat.`,
      })
      onClose()
    } catch (error) {
      console.error("Error during stock out or transaction:", error)
      toast({
        title: "Error",
        description: "Gagal melakukan stock out atau mencatat transaksi.",
        variant: "destructive",
      })
    }
  }
  
  const handleManualStockAdjustment = async () => {
    if (!product || manualAdjustmentAmount === 0) {
        toast({ title: "Info", description: "Masukkan jumlah penyesuaian yang valid."});
        return;
    }

    try {
      const newQuantity = Math.max(0, product.quantity + manualAdjustmentAmount);
      await updateItem(product.id, { quantity: newQuantity });

      const transactionData = {
        type: "adjustment" as "in" | "out" | "adjustment",
        productName: product.name,
        productBarcode: product.barcode,
        quantity: manualAdjustmentAmount, // Jumlah penyesuaian (bisa positif/negatif)
        unitPrice: product.price, // Harga satuan mungkin tidak selalu relevan untuk penyesuaian
        totalAmount: manualAdjustmentAmount * product.price, // Nilai penyesuaian
        reason: "Manual Stock Adjustment via Popup",
        operator: "User",
      };
      await firebaseHelpers.addTransaction(transactionData);

      toast({
        title: "📦 Stok Disesuaikan",
        description: `Stok ${product.name} disesuaikan ${manualAdjustmentAmount > 0 ? '+' : ''}${manualAdjustmentAmount}. Stok baru: ${newQuantity}. Transaksi dicatat.`,
      });
      setViewMode('info'); // Kembali ke tampilan info setelah penyesuaian
      setManualAdjustmentAmount(0); // Reset input
    } catch (error) {
      console.error("Error during manual stock adjustment or transaction:", error);
      toast({
        title: "Error",
        description: "Gagal menyesuaikan stok atau mencatat transaksi.",
        variant: "destructive",
      });
    }
  };


  // Render quick action view (default for existing products)
  const renderQuickAction = () => {
    if (!product) return null

    return (
      <div className="space-y-6">
        {/* Product Summary Card */}
        <div className="p-4 border rounded-lg bg-gray-50 dark:bg-gray-800">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-gray-200 dark:bg-gray-700 rounded-md flex items-center justify-center">
              <Package className="h-8 w-8 text-gray-500 dark:text-gray-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">{product.name}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">Barcode: <span className="font-mono">{product.barcode}</span></p>
              <Badge variant={product.quantity <= product.minStock ? "destructive" : "secondary"}>
                Stok: {product.quantity}
              </Badge>
            </div>
          </div>
        </div>
    
        {/* Quick Actions */}
        <div className="space-y-3">
          <Label htmlFor="quickActionAmount">Jumlah Aksi Cepat</Label>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => setQuickActionAmount(Math.max(1, quickActionAmount - 1))}>
              <Minus className="h-4 w-4" />
            </Button>
            <Input
              id="quickActionAmount"
              type="number"
              value={quickActionAmount}
              onChange={(e) => setQuickActionAmount(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-20 text-center"
              min="1"
            />
            <Button variant="outline" size="icon" onClick={() => setQuickActionAmount(quickActionAmount + 1)}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
    
        <div className="grid grid-cols-2 gap-4">
          <Button onClick={handleStockIn} className="bg-green-600 hover:bg-green-700 text-white">
            <Plus className="h-4 w-4 mr-2" /> Stock In
          </Button>
          <Button onClick={handleStockOut} className="bg-red-600 hover:bg-red-700 text-white" disabled={product.quantity < quickActionAmount}>
            <Minus className="h-4 w-4 mr-2" /> Stock Out
          </Button>
        </div>
    
        {product.quantity < quickActionAmount && viewMode === 'quickAction' && (
          <div className="p-3 bg-yellow-100 dark:bg-yellow-900 border border-yellow-300 dark:border-yellow-700 rounded-md">
            <div className="flex items-center gap-2 text-yellow-800 dark:text-yellow-200">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-sm">Stok tidak mencukupi untuk stock out sebanyak {quickActionAmount} unit</span>
            </div>
          </div>
        )}
         {/* Alternative Actions */}
        <div className="flex justify-center gap-2 pt-4 border-t dark:border-gray-700">
          <Button variant="outline" size="sm" onClick={() => setViewMode('info')}>
            <Package className="h-4 w-4 mr-1" />
            Detail Produk
          </Button>
          <Button variant="outline" size="sm" onClick={() => setViewMode('manualAdjust')}>
            <Zap className="h-4 w-4 mr-1" />
            Manual Adjust
          </Button>
        </div>
      </div>
    )
  }

  // Render product info view  
  const renderProductInfo = () => {
    if (!product) return null

    const formatCurrency = (price: number): string => {
      return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
      }).format(price)
    }
    return (
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row gap-6">
          {/* Barcode & Product Icon */}
          <div className="flex flex-col items-center md:w-1/3 space-y-4">
            <div className="flex items-center justify-center w-full h-32 bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-blue-900/30 dark:to-indigo-900/30 rounded-lg p-4">
              <Package className="h-20 w-20 text-blue-500 dark:text-blue-400" />
            </div>
            <div className="flex flex-col items-center justify-center">
              <div className="bg-white p-2 rounded border dark:bg-gray-800 dark:border-gray-700">
                <BarcodeComponent
                  value={product.barcode ?? ""}
                  format="CODE128"
                  width={1.5}
                  height={50}
                  displayValue={false}
                  background="transparent"
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

        <div className="flex justify-center gap-2 pt-4 border-t dark:border-gray-700">
          <Button variant="outline" onClick={() => setViewMode('quickAction')}>
            <Zap className="h-4 w-4 mr-1" />
            Quick Action
          </Button>
          <Button variant="outline" onClick={() => setViewMode('manualAdjust')}>
            Manual Adjust
          </Button>
        </div>
      </div>
    )
  }

  // Render manual adjustment view
  const renderManualAdjustment = () => {
    if (!product) return null

    return (
      <div className="space-y-6">
        <div className="text-center">
          <h4 className="text-lg font-medium">Manual Stock Adjustment</h4>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Stok saat ini: <span className="font-bold">{product.quantity}</span> unit
          </p>
        </div>

        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={() => setManualAdjustmentAmount(Math.max(1, manualAdjustmentAmount - 1))}>
                <Minus className="h-4 w-4" />
              </Button>
              <Input
                type="number"
                value={manualAdjustmentAmount}
                onChange={(e) => setManualAdjustmentAmount(Math.max(1, Number.parseInt(e.target.value) || 1))}
                className="w-20 text-center"
                min="1"
              />
              <Button variant="outline" size="icon" onClick={() => setManualAdjustmentAmount(manualAdjustmentAmount + 1)}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex-1 flex flex-col sm:flex-row justify-end gap-2 mt-2 sm:mt-0 w-full sm:w-auto">
              <Button 
                variant="destructive" 
                onClick={() => handleManualStockAdjustment()} 
                className="w-full sm:w-auto"
              >
                Simpan Penyesuaian
              </Button>
            </div>
          </div>
        </div>

        <div className="flex justify-center gap-2 pt-4 border-t dark:border-gray-700">
          <Button variant="outline" onClick={() => setViewMode('quickAction')}>
            Kembali
          </Button>
        </div>
      </div>
    )
  }

  // Render add new product view
  const renderAddNewProduct = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-center p-6 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-700/30">
        <div className="flex flex-col items-center text-center">
          <AlertTriangle className="h-12 w-12 text-yellow-500 dark:text-yellow-400 mb-2" />
          <h3 className="text-lg font-medium text-yellow-800 dark:text-yellow-300">Produk Tidak Ditemukan</h3>
          <p className="text-sm text-yellow-600 dark:text-yellow-400/80 mt-1">
            Barcode <span className="font-mono font-bold bg-yellow-100 dark:bg-yellow-800/30 px-2 py-1 rounded">{barcode}</span> belum terdaftar.
          </p>
        </div>
      </div>

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
        </div>

        <div className="flex justify-end space-x-2 pt-4 border-t dark:border-gray-700">
          <Button variant="outline" onClick={onClose}>
            Batal
          </Button>
          <Button onClick={handleAddProduct} className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600">
            <Plus className="h-4 w-4 mr-2" />
            Simpan Produk
          </Button>
        </div>
      </div>
    </div>
  )

  if (!isOpen) return null;

  const renderContent = () => {
    if (!product && viewMode !== 'addNew') {
      // Jika barcode discan tapi produk tidak ada, dan kita tidak dalam mode 'addNew' (seharusnya tidak terjadi jika logika useEffect benar)
      return (
        <div className="text-center py-8">
          <Package className="h-12 w-12 mx-auto text-gray-400 mb-4" />
          <p className="text-gray-500">Produk dengan barcode <span className="font-mono">{barcode}</span> tidak ditemukan.</p>
          <Button onClick={() => setViewMode('addNew')} className="mt-4">Tambah Produk Baru</Button>
        </div>
      );
    }
    
    switch (viewMode) {
      case "quickAction":
        if (!product) return <p>Produk tidak ditemukan.</p>; // Fallback
        return (
          <div className="space-y-6">
            {/* Product Summary Card */}
            <div className="p-4 border rounded-lg bg-gray-50 dark:bg-gray-800">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-gray-200 dark:bg-gray-700 rounded-md flex items-center justify-center">
                  <Package className="h-8 w-8 text-gray-500 dark:text-gray-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">{product.name}</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Barcode: <span className="font-mono">{product.barcode}</span></p>
                  <Badge variant={product.quantity <= product.minStock ? "destructive" : "secondary"}>
                    Stok: {product.quantity}
                  </Badge>
                </div>
              </div>
            </div>
    
            {/* Quick Actions */}
            <div className="space-y-3">
              <Label htmlFor="quickActionAmount">Jumlah Aksi Cepat</Label>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" onClick={() => setQuickActionAmount(Math.max(1, quickActionAmount - 1))}>
                  <Minus className="h-4 w-4" />
                </Button>
                <Input
                  id="quickActionAmount"
                  type="number"
                  value={quickActionAmount}
                  onChange={(e) => setQuickActionAmount(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-20 text-center"
                  min="1"
                />
                <Button variant="outline" size="icon" onClick={() => setQuickActionAmount(quickActionAmount + 1)}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
    
            <div className="grid grid-cols-2 gap-4">
              <Button onClick={handleStockIn} className="bg-green-600 hover:bg-green-700 text-white">
                <Plus className="h-4 w-4 mr-2" /> Stock In
              </Button>
              <Button onClick={handleStockOut} className="bg-red-600 hover:bg-red-700 text-white" disabled={product.quantity < quickActionAmount}>
                <Minus className="h-4 w-4 mr-2" /> Stock Out
              </Button>
            </div>
    
            {product.quantity < quickActionAmount && viewMode === 'quickAction' && (
              <div className="p-3 bg-yellow-100 dark:bg-yellow-900 border border-yellow-300 dark:border-yellow-700 rounded-md">
                <div className="flex items-center gap-2 text-yellow-800 dark:text-yellow-200">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="text-sm">Stok tidak mencukupi untuk stock out sebanyak {quickActionAmount} unit</span>
                </div>
              </div>
            )}
             {/* Alternative Actions */}
            <div className="flex justify-center gap-2 pt-4 border-t dark:border-gray-700">
              <Button variant="outline" size="sm" onClick={() => setViewMode('info')}>
                <Package className="h-4 w-4 mr-1" />
                Detail Produk
              </Button>
              <Button variant="outline" size="sm" onClick={() => setViewMode('manualAdjust')}>
                <Zap className="h-4 w-4 mr-1" />
                Manual Adjust
              </Button>
            </div>
          </div>
        );
      
      case "manualAdjust":
        if (!product) return <p>Produk tidak ditemukan.</p>; // Fallback
        return (
          <div className="space-y-6">
            <DialogHeader>
              <DialogTitle>Penyesuaian Stok Manual: {product.name}</DialogTitle>
              <DialogDescription>Stok saat ini: {product.quantity}. Masukkan jumlah penyesuaian (positif untuk menambah, negatif untuk mengurangi).</DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="manualAdjustmentAmount">Jumlah Penyesuaian</Label>
              <Input
                id="manualAdjustmentAmount"
                type="number"
                value={manualAdjustmentAmount}
                onChange={(e) => setManualAdjustmentAmount(parseInt(e.target.value) || 0)}
                placeholder="Contoh: 5 atau -3"
              />
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Stok setelah penyesuaian: {product.quantity + manualAdjustmentAmount}
            </p>
            <DialogFooter className="pt-4">
              <Button variant="outline" onClick={() => setViewMode('quickAction')}>Batal</Button>
              <Button onClick={handleManualStockAdjustment}>Simpan Penyesuaian</Button>
            </DialogFooter>
          </div>
        );

      case "addNew":
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <PackagePlus className="h-5 w-5" />
                Tambah Produk Baru
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Barcode <span className="font-mono bg-gray-100 dark:bg-gray-700 px-1 py-0.5 rounded">{barcode}</span> tidak ditemukan. Tambahkan sebagai produk baru.
              </p>
            </div>
            
            <div className="max-h-[50vh] overflow-y-auto pr-2">
              <div className="space-y-4">
                {/* Barcode dan Nama Produk */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="barcode-new" className="text-sm font-medium">Barcode *</Label>
                    <Input 
                      id="barcode-new" 
                      name="barcode" 
                      value={newProduct.barcode} 
                      onChange={handleInputChange} 
                      readOnly 
                      className="bg-gray-100 dark:bg-gray-700 text-sm"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="name" className="text-sm font-medium">Nama Produk *</Label>
                    <Input 
                      id="name" 
                      name="name" 
                      value={newProduct.name} 
                      onChange={handleInputChange} 
                      placeholder="Nama produk" 
                      className="text-sm"
                    />
                  </div>
                </div>

                {/* Deskripsi */}
                <div className="space-y-2">
                  <Label htmlFor="description" className="text-sm font-medium">Deskripsi</Label>
                  <Input 
                    id="description" 
                    name="description" 
                    value={newProduct.description} 
                    onChange={handleInputChange} 
                    placeholder="Deskripsi singkat produk" 
                    className="text-sm"
                  />
                </div>

                {/* Kategori dan Stok Awal */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="category" className="text-sm font-medium">Kategori</Label>
                    <select 
                      id="category" 
                      name="category" 
                      value={newProduct.category} 
                      onChange={handleInputChange} 
                      className="w-full px-3 py-2 text-sm border border-input bg-background rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-ring dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                    >
                      <option value="Umum">Umum</option>
                      <option value="Elektronik">Elektronik</option>
                      <option value="Pakaian">Pakaian</option>
                      <option value="Makanan">Makanan</option>
                      <option value="Minuman">Minuman</option>
                      <option value="ATK">ATK</option>
                      <option value="Lainnya">Lainnya</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="quantity" className="text-sm font-medium">Stok Awal *</Label>
                    <Input 
                      id="quantity" 
                      name="quantity" 
                      type="number" 
                      value={newProduct.quantity} 
                      onChange={handleInputChange} 
                      placeholder="0" 
                      min="0"
                      className="text-sm"
                    />
                  </div>
                </div>

                {/* Stok Minimum dan Harga */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="minStock" className="text-sm font-medium">Stok Minimum *</Label>
                    <Input 
                      id="minStock" 
                      name="minStock" 
                      type="number" 
                      value={newProduct.minStock} 
                      onChange={handleInputChange} 
                      placeholder="5" 
                      min="0"
                      className="text-sm"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="price" className="text-sm font-medium">Harga (Rp) *</Label>
                    <Input 
                      id="price" 
                      name="price" 
                      type="number" 
                      value={newProduct.price} 
                      onChange={handleInputChange} 
                      placeholder="0" 
                      min="0"
                      className="text-sm"
                    />
                  </div>
                </div>

                {/* Lokasi dan Pemasok */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="location" className="text-sm font-medium">Lokasi</Label>
                    <Input 
                      id="location" 
                      name="location" 
                      value={newProduct.location} 
                      onChange={handleInputChange} 
                      placeholder="Rak A1" 
                      className="text-sm"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="supplier" className="text-sm font-medium">Pemasok</Label>
                    <Input 
                      id="supplier" 
                      name="supplier" 
                      value={newProduct.supplier} 
                      onChange={handleInputChange} 
                      placeholder="Nama pemasok" 
                      className="text-sm"
                    />
                  </div>
                </div>
              </div>
            </div>
            
            <div className="flex justify-end gap-2 pt-4 border-t dark:border-gray-700">
              <Button variant="outline" onClick={onClose}>Batal</Button>
              <Button onClick={handleAddProduct} className="bg-blue-600 hover:bg-blue-700">
                <Plus className="h-4 w-4 mr-2" />
                Tambah Produk
              </Button>
            </div>
          </div>
        );
      
      case "info":
      default:
        if (!product) return <p>Produk tidak ditemukan atau belum dipilih.</p>;
        return (
          <div className="space-y-4">
            <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                    <Package className="h-6 w-6" /> {product.name}
                </DialogTitle>
                <DialogDescription>Detail lengkap produk inventaris.</DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 text-sm p-1">
                <div className="md:col-span-2 flex justify-center mb-2">
                    {product.barcode && (
                        <div className="bg-white p-2 rounded border inline-block">
                        <BarcodeComponent
                            value={product.barcode}
                            format="CODE128"
                            width={1.5}
                            height={50}
                            displayValue={true}
                            fontSize={12}
                            margin={5}
                        />
                        </div>
                    )}
                </div>

                <div>
                    <Label className="text-xs text-gray-500 dark:text-gray-400">Kategori</Label>
                    <p className="font-medium">{product.category}</p>
                </div>
                <div>
                    <Label className="text-xs text-gray-500 dark:text-gray-400">Harga</Label>
                    <p className="font-medium">Rp {product.price.toLocaleString()}</p>
                </div>
                <div className="md:col-span-2">
                    <Label className="text-xs text-gray-500 dark:text-gray-400">Deskripsi</Label>
                    <p className="font-medium">{product.description || "-"}</p>
                </div>
                <div className="flex items-center gap-2">
                    <Label className="text-xs text-gray-500 dark:text-gray-400">Stok Saat Ini:</Label>
                    <Badge variant={product.quantity <= product.minStock ? "destructive" : product.quantity === 0 ? "destructive" : "default"}
                           className={product.quantity <= product.minStock && product.quantity > 0 ? "bg-yellow-500 dark:bg-yellow-600" 
                                    : product.quantity === 0 ? "bg-red-600 dark:bg-red-700" 
                                    : "bg-blue-500 dark:bg-blue-600"}>
                        {product.quantity} {product.quantity <= product.minStock && product.quantity > 0 ? "(Stok Rendah)" : product.quantity === 0 ? "(Stok Habis)" : ""}
                    </Badge>
                </div>
                 <div>
                    <Label className="text-xs text-gray-500 dark:text-gray-400">Min. Stok</Label>
                    <p className="font-medium">{product.minStock}</p>
                </div>

                <div className="flex items-center gap-1">
                    <MapPin className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                    <Label className="text-xs text-gray-500 dark:text-gray-400">Lokasi:</Label>
                    <p className="font-medium">{product.location || "-"}</p>
                </div>
                {product.supplier && (
                    <div className="flex items-center gap-1">
                        <Truck className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                        <Label className="text-xs text-gray-500 dark:text-gray-400">Pemasok:</Label>
                        <p className="font-medium">{product.supplier}</p>
                    </div>
                )}
                {product.createdAt && (
                    <div>
                        <Label className="text-xs text-gray-500 dark:text-gray-400">Dibuat Pada</Label>
                        <p className="font-medium">{new Date(product.createdAt).toLocaleDateString('id-ID')}</p>
                    </div>
                )}
                {product.updatedAt && (
                    <div>
                        <Label className="text-xs text-gray-500 dark:text-gray-400">Diperbarui Pada</Label>
                        <p className="font-medium">{new Date(product.updatedAt).toLocaleDateString('id-ID')}</p>
                    </div>
                )}
            </div>
             <DialogFooter className="pt-4 border-t dark:border-gray-700">
                <Button variant="outline" onClick={() => setViewMode('quickAction')}>Aksi Cepat</Button>
                <Button onClick={onClose}>Tutup</Button>
            </DialogFooter>
          </div>
        );
    }
  };


  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[500px] md:max-w-[600px] lg:max-w-[700px] max-h-[85vh] overflow-hidden">
        <DialogHeader className="pb-3">
          <DialogTitle className="text-lg">
            {viewMode === 'addNew' ? 'Tambah Produk Baru' : 
             viewMode === 'quickAction' ? 'Aksi Cepat' :
             viewMode === 'manualAdjust' ? 'Penyesuaian Manual' : 
             product ? product.name : 'Informasi Produk'}
          </DialogTitle>
          <DialogDescription className="text-sm">
            {viewMode === 'addNew' ? 'Tambahkan produk baru ke inventaris' : 
             viewMode === 'quickAction' ? 'Ubah stok dengan cepat' :
             viewMode === 'manualAdjust' ? 'Sesuaikan stok secara manual' :
             'Detail informasi produk'}
          </DialogDescription>
        </DialogHeader>
        
        {renderContent()}
      </DialogContent>
    </Dialog>
  )
}