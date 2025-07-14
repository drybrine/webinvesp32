"use client"

import React, { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import { useFirebaseInventory } from "@/hooks/use-firebase"
import { firebaseHelpers } from "@/lib/firebase"
import { Package, Plus, Minus, Zap, AlertTriangle, X, ShoppingCart, PackageOpen } from "lucide-react"

interface MobileQuickActionPopupProps {
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
  barcode?: string
  supplier?: string
}

export function MobileQuickActionPopup({ barcode, isOpen, onClose }: MobileQuickActionPopupProps) {
  const { items, updateItem, addItem } = useFirebaseInventory()
  const { toast } = useToast()
  const [product, setProduct] = useState<InventoryItem | null>(null)
  const [quickActionAmount, setQuickActionAmount] = useState(1)
  const [isLoading, setIsLoading] = useState(false)
  const [showAddNewForm, setShowAddNewForm] = useState(false)
  const [newProduct, setNewProduct] = useState({
    name: "",
    category: "Umum",
    quantity: 1,
    minStock: 5,
    price: 0,
    description: "",
    location: "",
  })

  // Reset state when popup opens
  useEffect(() => {
    if (isOpen && barcode) {
      const foundProduct = items.find((item) => item.barcode === barcode)
      setProduct(foundProduct || null)
      setQuickActionAmount(1)
      setShowAddNewForm(!foundProduct)
      setIsLoading(false)
      
      if (!foundProduct) {
        setNewProduct(prev => ({ ...prev, name: `Product ${barcode}` }))
      }
    }
  }, [barcode, items, isOpen])

  // Prevent body scroll on mobile when popup is open
  useEffect(() => {
    if (isOpen && typeof document !== 'undefined') {
      const isMobile = /Mobile|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
      if (isMobile) {
        document.body.classList.add('dialog-open')
        document.body.style.overflow = 'hidden'
        document.body.style.position = 'fixed'
        document.body.style.width = '100%'
        document.body.style.top = '0'
      }
      
      return () => {
        document.body.classList.remove('dialog-open')
        document.body.style.overflow = ''
        document.body.style.position = ''
        document.body.style.width = ''
        document.body.style.top = ''
      }
    }
  }, [isOpen])

  const handleStockIn = async () => {
    if (!product || quickActionAmount <= 0 || isLoading) return

    setIsLoading(true)
    try {
      const newQuantity = product.quantity + quickActionAmount
      await updateItem(product.id, { quantity: newQuantity })

      // Record transaction
      const transactionData = {
        type: "in" as "in" | "out" | "adjustment",
        productName: product.name,
        productBarcode: product.barcode || barcode || "",
        quantity: quickActionAmount,
        unitPrice: product.price,
        totalAmount: quickActionAmount * product.price,
        reason: "Stock In via Mobile ESP32 Scanner",
        operator: "ESP32 Mobile User",
        timestamp: Date.now(),
      }
      await firebaseHelpers.addTransaction(transactionData)

      toast({
        title: "✅ Stock In Berhasil",
        description: `+${quickActionAmount} ${product.name}. Stok sekarang: ${newQuantity}`,
        duration: 3000,
      })
      
      onClose()
    } catch (error) {
      console.error("Error during stock in:", error)
      toast({
        title: "❌ Error",
        description: "Gagal melakukan stock in",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleStockOut = async () => {
    if (!product || quickActionAmount <= 0 || isLoading) return

    if (product.quantity < quickActionAmount) {
      toast({
        title: "⚠️ Stok Tidak Cukup",
        description: `Stok tersedia: ${product.quantity}, diminta: ${quickActionAmount}`,
        variant: "destructive",
      })
      return
    }

    setIsLoading(true)
    try {
      const newQuantity = Math.max(0, product.quantity - quickActionAmount)
      await updateItem(product.id, { quantity: newQuantity })

      // Record transaction
      const transactionData = {
        type: "out" as "in" | "out" | "adjustment",
        productName: product.name,
        productBarcode: product.barcode || barcode || "",
        quantity: -quickActionAmount,
        unitPrice: product.price,
        totalAmount: -quickActionAmount * product.price,
        reason: "Stock Out via Mobile ESP32 Scanner",
        operator: "ESP32 Mobile User",
        timestamp: Date.now(),
      }
      await firebaseHelpers.addTransaction(transactionData)

      toast({
        title: "📤 Stock Out Berhasil",
        description: `-${quickActionAmount} ${product.name}. Stok sekarang: ${newQuantity}`,
        duration: 3000,
      })
      
      onClose()
    } catch (error) {
      console.error("Error during stock out:", error)
      toast({
        title: "❌ Error",
        description: "Gagal melakukan stock out",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleAddNewProduct = async () => {
    if (!newProduct.name.trim() || isLoading) {
      toast({
        title: "⚠️ Validasi Error",
        description: "Nama produk harus diisi",
        variant: "destructive",
      })
      return
    }

    setIsLoading(true)
    try {
      const productToAdd = {
        ...newProduct,
        barcode: barcode || "",
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
      }
      
      await addItem(productToAdd)
      
      toast({
        title: "✅ Produk Ditambahkan",
        description: `${newProduct.name} berhasil ditambahkan dengan stok ${newProduct.quantity}`,
        duration: 3000,
      })
      
      onClose()
    } catch (error) {
      console.error("Error adding product:", error)
      toast({
        title: "❌ Error",
        description: "Gagal menambahkan produk",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const renderExistingProduct = () => (
    <div className="space-y-4">
      {/* Product Header */}
      <div className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
        <div className="w-12 h-12 bg-blue-100 dark:bg-blue-800/50 rounded-lg flex items-center justify-center">
          <Package className="h-6 w-6 text-blue-600 dark:text-blue-400" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-sm">{product?.name}</h3>
          <p className="text-xs text-gray-600 dark:text-gray-400">Barcode: {barcode}</p>
          <Badge variant={product && product.quantity <= product.minStock ? "destructive" : "default"} className="text-xs mt-1">
            Stok: {product?.quantity} unit
          </Badge>
        </div>
      </div>

      {/* Quick Amount Controls */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Jumlah</Label>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setQuickActionAmount(Math.max(1, quickActionAmount - 1))}
            disabled={isLoading}
            className="h-10 w-10 p-0"
          >
            <Minus className="h-4 w-4" />
          </Button>
          <Input
            type="number"
            value={quickActionAmount}
            onChange={(e) => setQuickActionAmount(Math.max(1, parseInt(e.target.value) || 1))}
            className="text-center h-10 w-16"
            min="1"
            disabled={isLoading}
          />
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setQuickActionAmount(quickActionAmount + 1)}
            disabled={isLoading}
            className="h-10 w-10 p-0"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="grid grid-cols-2 gap-3 pt-2">
        <Button 
          onClick={handleStockIn} 
          disabled={isLoading}
          className="bg-green-600 hover:bg-green-700 text-white h-12 text-sm"
        >
          {isLoading ? (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
          ) : (
            <Plus className="h-4 w-4 mr-2" />
          )}
          Stock In
        </Button>
        <Button 
          onClick={handleStockOut} 
          disabled={isLoading || !!(product && product.quantity < quickActionAmount)}
          className="bg-red-600 hover:bg-red-700 text-white h-12 text-sm"
        >
          {isLoading ? (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
          ) : (
            <Minus className="h-4 w-4 mr-2" />
          )}
          Stock Out
        </Button>
      </div>

      {/* Stock Warning */}
      {product && product.quantity < quickActionAmount && (
        <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
          <div className="flex items-center gap-2 text-yellow-800 dark:text-yellow-200">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-xs">Stok tidak mencukupi untuk stock out {quickActionAmount} unit</span>
          </div>
        </div>
      )}
    </div>
  )

  const renderAddNewProduct = () => (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3 p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
        <div className="w-12 h-12 bg-orange-100 dark:bg-orange-800/50 rounded-lg flex items-center justify-center">
          <PackageOpen className="h-6 w-6 text-orange-600 dark:text-orange-400" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-sm">Produk Baru</h3>
          <p className="text-xs text-gray-600 dark:text-gray-400">Barcode: {barcode}</p>
        </div>
      </div>

      {/* Form */}
      <div className="space-y-3">
        <div>
          <Label className="text-sm font-medium">Nama Produk *</Label>
          <Input
            value={newProduct.name}
            onChange={(e) => setNewProduct(prev => ({ ...prev, name: e.target.value }))}
            placeholder="Masukkan nama produk"
            className="h-10 text-sm"
            disabled={isLoading}
          />
        </div>
        
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-sm font-medium">Stok Awal</Label>
            <Input
              type="number"
              value={newProduct.quantity}
              onChange={(e) => setNewProduct(prev => ({ ...prev, quantity: Math.max(0, parseInt(e.target.value) || 0) }))}
              className="h-10 text-sm"
              min="0"
              disabled={isLoading}
            />
          </div>
          <div>
            <Label className="text-sm font-medium">Harga (Rp)</Label>
            <Input
              type="number"
              value={newProduct.price}
              onChange={(e) => setNewProduct(prev => ({ ...prev, price: Math.max(0, parseInt(e.target.value) || 0) }))}
              className="h-10 text-sm"
              min="0"
              disabled={isLoading}
            />
          </div>
        </div>

        <div>
          <Label className="text-sm font-medium">Kategori</Label>
          <select
            value={newProduct.category}
            onChange={(e) => setNewProduct(prev => ({ ...prev, category: e.target.value }))}
            className="w-full h-10 px-3 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isLoading}
          >
            <option value="Umum">Umum</option>
            <option value="Elektronik">Elektronik</option>
            <option value="Makanan">Makanan</option>
            <option value="Minuman">Minuman</option>
            <option value="Pakaian">Pakaian</option>
            <option value="Alat Tulis">Alat Tulis</option>
            <option value="Lainnya">Lainnya</option>
          </select>
        </div>
      </div>

      {/* Add Button */}
      <Button 
        onClick={handleAddNewProduct} 
        disabled={isLoading || !newProduct.name.trim()}
        className="w-full bg-blue-600 hover:bg-blue-700 text-white h-12 text-sm"
      >
        {isLoading ? (
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
        ) : (
          <Plus className="h-4 w-4 mr-2" />
        )}
        Tambah Produk
      </Button>
    </div>
  )

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-[95vw] max-w-sm mx-auto p-4 max-h-[85vh] overflow-y-auto">
        <DialogHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-blue-600" />
              <DialogTitle className="text-base">Aksi Cepat ESP32</DialogTitle>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-8 w-8 p-0 hover:bg-gray-100"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        {product ? renderExistingProduct() : renderAddNewProduct()}
        
        {/* ESP32 Indicator */}
        <div className="flex items-center justify-center gap-2 pt-2 border-t border-gray-200 dark:border-gray-700">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
          <span className="text-xs text-gray-500">ESP32 Scanner Aktif</span>
        </div>
      </DialogContent>
    </Dialog>
  )
}
