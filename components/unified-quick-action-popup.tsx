"use client"

import React, { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import { useFirebaseInventory } from "@/hooks/use-firebase"
import { firebaseHelpers } from "@/lib/firebase"
import { Package, Plus, Minus, Zap, AlertTriangle, PackageOpen, X } from "lucide-react"

interface UnifiedQuickActionPopupProps {
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
  createdAt?: any
  updatedAt?: any
}

export function UnifiedQuickActionPopup({ barcode, isOpen, onClose }: UnifiedQuickActionPopupProps) {
  const { items, updateItem, addItem } = useFirebaseInventory()
  const { toast } = useToast()
  const [product, setProduct] = useState<InventoryItem | null>(null)
  const [quickActionAmount, setQuickActionAmount] = useState(1)
  const [isLoading, setIsLoading] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  const [newProduct, setNewProduct] = useState({
    name: "",
    category: "Umum",
    quantity: 1,
    minStock: 5,
    price: 0,
    description: "",
    location: "",
  })

  // Detect mobile device
  useEffect(() => {
    const checkMobile = () => {
      const userAgent = window.navigator.userAgent
      const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent)
      const isSmallScreen = window.innerWidth <= 768
      const isTouchDevice = 'ontouchstart' in window
      
      return isMobileDevice || isSmallScreen || isTouchDevice
    }
    
    setIsMobile(checkMobile())
    
    // Listen for resize events
    const handleResize = () => {
      setIsMobile(checkMobile())
    }
    
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Reset state when popup opens
  useEffect(() => {
    if (isOpen && barcode) {
      const foundProduct = items.find((item) => item.barcode === barcode)
      setProduct(foundProduct || null)
      setQuickActionAmount(1)
      setIsLoading(false)
      
      if (!foundProduct) {
        setNewProduct(prev => ({ ...prev, name: `Product ${barcode}` }))
      }
    }
  }, [barcode, items, isOpen])

  // Handle body scroll prevention
  useEffect(() => {
    if (isOpen && typeof document !== 'undefined') {
      if (isMobile) {
        // Mobile: Full scroll prevention
        document.body.classList.add('dialog-open')
        document.body.style.overflow = 'hidden'
        document.body.style.position = 'fixed'
        document.body.style.width = '100%'
        document.body.style.top = '0'
      } else {
        // Desktop: Simple overflow hidden
        document.body.classList.add('dialog-open')
        document.body.style.overflow = 'hidden'
      }
      
      return () => {
        document.body.classList.remove('dialog-open')
        document.body.style.overflow = ''
        if (isMobile) {
          document.body.style.position = ''
          document.body.style.width = ''
          document.body.style.top = ''
        }
      }
    }
  }, [isOpen, isMobile])

  const handleStockIn = async () => {
    if (!product || quickActionAmount <= 0 || isLoading) return

    setIsLoading(true)
    try {
      const newQuantity = product.quantity + quickActionAmount
      await updateItem(product.id, { quantity: newQuantity })

      // Record transaction
      const unitPrice = Number(product.price) || 0
      const totalAmount = unitPrice * quickActionAmount
      
      const transactionData = {
        type: "in" as "in" | "out" | "adjustment",
        productName: product.name,
        productBarcode: product.barcode || barcode || "",
        quantity: quickActionAmount,
        unitPrice: unitPrice,
        totalAmount: totalAmount,
        reason: "Stock In via Quick Action",
        operator: "ESP32 Scanner",
        timestamp: Date.now(),
        notes: `Stock in via ESP32 scanner - ${isMobile ? 'Mobile' : 'Desktop'}`,
      }

      await firebaseHelpers.addTransaction(transactionData)

      toast({
        title: "✅ Stock In Berhasil",
        description: `${product.name} +${quickActionAmount} unit. Stok sekarang: ${newQuantity}`,
        duration: 3000,
      })
      
      onClose()
    } catch (error) {
      console.error("Error stock in:", error)
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
    if (!product || quickActionAmount <= 0 || product.quantity < quickActionAmount || isLoading) return

    setIsLoading(true)
    try {
      const newQuantity = product.quantity - quickActionAmount
      await updateItem(product.id, { quantity: newQuantity })

      // Record transaction
      const unitPrice = Number(product.price) || 0
      const totalAmount = unitPrice * quickActionAmount
      
      const transactionData = {
        type: "out" as "in" | "out" | "adjustment",
        productName: product.name,
        productBarcode: product.barcode || barcode || "",
        quantity: quickActionAmount,
        unitPrice: unitPrice,
        totalAmount: totalAmount,
        reason: "Stock Out via Quick Action",
        operator: "ESP32 Scanner",
        timestamp: Date.now(),
        notes: `Stock out via ESP32 scanner - ${isMobile ? 'Mobile' : 'Desktop'}`,
      }

      await firebaseHelpers.addTransaction(transactionData)

      toast({
        title: "✅ Stock Out Berhasil",
        description: `${product.name} -${quickActionAmount} unit. Stok sekarang: ${newQuantity}`,
        duration: 3000,
      })
      
      onClose()
    } catch (error) {
      console.error("Error stock out:", error)
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
    if (!newProduct.name.trim() || isLoading) return

    setIsLoading(true)
    try {
      const productData = {
        ...newProduct,
        barcode: barcode || "",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        lastUpdated: Date.now(),
      }

      await addItem(productData)

      // Record transaction for initial stock
      if (newProduct.quantity > 0) {
        const transactionData = {
          type: "in" as "in" | "out" | "adjustment",
          productName: newProduct.name,
          productBarcode: barcode || "",
          quantity: newProduct.quantity,
          unitPrice: newProduct.price || 0,
          totalAmount: (newProduct.price || 0) * newProduct.quantity,
          reason: "Initial Stock - New Product",
          operator: "ESP32 Scanner",
          timestamp: Date.now(),
          notes: `New product added via ESP32 scanner - ${isMobile ? 'Mobile' : 'Desktop'}`,
        }

        await firebaseHelpers.addTransaction(transactionData)
      }

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
          <h2 className="font-semibold text-sm">{product?.name}</h2>
          <p className="text-xs text-gray-700 dark:text-gray-300">Barcode: {barcode}</p>
          <div className="flex gap-2 mt-1">
            <Badge variant={product && product.quantity <= product.minStock ? "destructive" : "default"} className="text-xs">
              Stok: {product?.quantity} unit
            </Badge>
            <Badge variant="outline" className="text-xs">
              Harga: {new Intl.NumberFormat("id-ID", {
                style: "currency",
                currency: "IDR",
                minimumFractionDigits: 0,
              }).format(Number(product?.price) || 0)}
            </Badge>
          </div>
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

      {/* Transaction Value Preview */}
      <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
        <div className="text-xs text-gray-700 dark:text-gray-300 mb-1">Nilai Transaksi:</div>
        <div className="text-sm font-semibold text-gray-800 dark:text-gray-200">
          {new Intl.NumberFormat("id-ID", {
            style: "currency",
            currency: "IDR",
            minimumFractionDigits: 0,
          }).format((Number(product?.price) || 0) * quickActionAmount)}
        </div>
        <div className="text-xs text-gray-500 mt-1">
          {quickActionAmount} unit × {new Intl.NumberFormat("id-ID", {
            style: "currency",
            currency: "IDR",
            minimumFractionDigits: 0,
          }).format(Number(product?.price) || 0)}
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
      {/* Product Not Found Header */}
      <div className="flex items-center justify-center p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
        <div className="flex flex-col items-center text-center">
          <AlertTriangle className="h-8 w-8 text-yellow-500 dark:text-yellow-400 mb-2" />
          <h2 className="text-sm font-medium text-yellow-800 dark:text-yellow-300">Produk Tidak Ditemukan</h2>
          <p className="text-xs text-yellow-600 dark:text-yellow-400/80 mt-1">
            Barcode <span className="font-mono font-bold bg-yellow-100 dark:bg-yellow-800/30 px-1 py-0.5 rounded">{barcode}</span> belum terdaftar.
          </p>
        </div>
      </div>

      {/* Add New Product Form */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <PackageOpen className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          <h2 className="text-sm font-medium">Tambah Produk Baru</h2>
        </div>

        <div>
          <Label className="text-sm font-medium">Nama Produk</Label>
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
              placeholder="0"
              className="h-10 text-sm"
              min="0"
              disabled={isLoading}
            />
          </div>
          <div>
            <Label className="text-sm font-medium">Harga</Label>
            <Input
              type="number"
              value={newProduct.price}
              onChange={(e) => setNewProduct(prev => ({ ...prev, price: Math.max(0, parseInt(e.target.value) || 0) }))}
              placeholder="0"
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

  // Dynamic sizing based on device type
  const dialogContentClass = isMobile 
    ? "w-[95vw] max-w-sm mx-auto p-4 max-h-[85vh] overflow-y-auto"
    : "w-[95vw] max-w-md mx-auto p-4 max-h-[85vh] overflow-y-auto"

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className={`${dialogContentClass} [&>button]:hidden`}>
        <DialogHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 flex-1 pr-2">
              <Zap className="h-5 w-5 text-blue-600" />
              <DialogTitle className="text-base">Aksi Cepat ESP32</DialogTitle>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-8 w-8 p-0 hover:bg-gray-100 flex-shrink-0"
              aria-label="Tutup popup aksi cepat"
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Tutup</span>
            </Button>
          </div>
          <DialogDescription className="sr-only">
            {product 
              ? `Kelola stok untuk produk ${product.name} dengan barcode ${barcode}. Anda dapat melakukan stock in, stock out, atau mengedit informasi produk.`
              : `Produk dengan barcode ${barcode} tidak ditemukan. Anda dapat menambahkan produk baru ke inventaris.`
            }
          </DialogDescription>
        </DialogHeader>

        {product ? renderExistingProduct() : renderAddNewProduct()}
        
        {/* ESP32 Indicator */}
        <div className="flex items-center justify-center gap-2 pt-2 border-t border-gray-200 dark:border-gray-700">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
          <span className="text-xs text-gray-500">ESP32 Scanner Aktif - {isMobile ? 'Mobile' : 'Desktop'}</span>
        </div>
      </DialogContent>
    </Dialog>
  )
}