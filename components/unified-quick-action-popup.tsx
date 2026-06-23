"use client"

import React, { useState, useEffect, useMemo } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import { useFirebaseInventory, type InventoryItem } from "@/hooks/use-firebase"
import { firebaseHelpers } from "@/lib/firebase"
import { Package, Plus, Minus, Zap, AlertTriangle, PackageOpen, X, ArrowRightLeft } from "lucide-react"
import { useAuth } from "@/components/auth-provider"
import { canWrite } from "@/types/security"
import { useScanMode, MODE_LABELS, type ScanMode } from "@/hooks/use-scan-mode"

interface UnifiedQuickActionPopupProps {
  barcode: string | null
  scanId?: string
  deviceId?: string
  isOpen: boolean
  onClose: () => void
}

type NewProductDraft = Omit<InventoryItem, "id" | "barcode" | "createdAt" | "updatedAt" | "lastUpdated" | "deleted">

function createNewProductDraft(barcode?: string | null): NewProductDraft {
  return {
    name: barcode ? `Produk ${barcode}` : "",
    category: "Umum",
    quantity: 1,
    minStock: 5,
    description: "",
    location: "",
    supplier: "",
  }
}

type CatalogItem = {
  name: string
  sourceUrl: string
}

type ProductLookupResponse = {
  product?: Partial<Pick<NewProductDraft, "name" | "category" | "description" | "supplier">> | null
  catalog?: CatalogItem[]
}

export function UnifiedQuickActionPopup({ barcode, scanId, deviceId, isOpen, onClose }: UnifiedQuickActionPopupProps) {
  const { role } = useAuth()
  const writable = canWrite(role)
  const { items, addItem } = useFirebaseInventory()
  const { toast } = useToast()
  const { scanMode, setScanMode } = useScanMode()
  const [product, setProduct] = useState<InventoryItem | null>(null)
  const [quickActionAmount, setQuickActionAmount] = useState(1)
  const [isLoading, setIsLoading] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [lookupStatus, setLookupStatus] = useState<"idle" | "loading" | "found" | "not-found">("idle")
  const [catalog, setCatalog] = useState<CatalogItem[]>([])
  const [catalogSearch, setCatalogSearch] = useState("")

  const [newProduct, setNewProduct] = useState<NewProductDraft>(createNewProductDraft())

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
    if (!isOpen || !barcode) return

    const foundProduct = items.find((item) => item.barcode === barcode)
    setProduct(foundProduct || null)
    setQuickActionAmount(1)
    setIsLoading(false)
    setLookupStatus("idle")

    if (foundProduct) return

    const controller = new AbortController()
    setNewProduct(createNewProductDraft(barcode))
    setLookupStatus("loading")
    setCatalog([])
    setCatalogSearch("")

    // Write "searching" status to Firebase so firmware OLED can show progress
    if (scanId && deviceId) {
      firebaseHelpers.updateDeviceLookupStatus(deviceId, {
        scanId,
        barcode,
        status: "searching",
      }).catch(() => {})
    }

    fetch(`/api/lookup?barcode=${encodeURIComponent(barcode)}`, { signal: controller.signal })
      .then(async (res) => (res.ok ? (await res.json() as ProductLookupResponse) : null))
      .then((data) => {
        const lookup = data?.product
        const cat = data?.catalog || []
        if (!lookup?.name) {
          setLookupStatus("not-found")
          if (cat.length > 0) setCatalog(cat)
          if (scanId && deviceId) {
            firebaseHelpers.updateDeviceLookupStatus(deviceId, {
              scanId,
              barcode,
              status: "not_found",
            }).catch(() => {})
          }
          return
        }
        const name = lookup.name.trim()
        const category = lookup.category?.trim() || "Suku Cadang Honda"
        setNewProduct((prev) => ({
          ...prev,
          name: name || prev.name,
          category: category || prev.category,
          description: lookup.description?.trim() || prev.description,
          supplier: lookup.supplier?.trim() || prev.supplier,
        }))
        setLookupStatus("found")
        if (scanId && deviceId) {
          firebaseHelpers.updateDeviceLookupStatus(deviceId, {
            scanId,
            barcode,
            status: "found",
            name,
            category,
          }).catch(() => {})
        }
      })
      .catch((error) => {
        if (error?.name === "AbortError") return
        setLookupStatus("not-found")
        if (scanId && deviceId) {
          firebaseHelpers.updateDeviceLookupStatus(deviceId, {
            scanId,
            barcode,
            status: "failed",
            message: "lookup failed",
          }).catch(() => {})
        }
      })

    return () => controller.abort()
  }, [barcode, deviceId, items, isOpen, scanId])

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
      const transactionData = {
        type: "in" as "in" | "out" | "adjustment",
        productName: product.name,
        productBarcode: product.barcode || barcode || "",
        quantity: quickActionAmount,
        reason: "Stock In via Quick Action",
        operator: "ESP32 Scanner",
        notes: `Stock in via ESP32 scanner - ${isMobile ? 'Mobile' : 'Desktop'}`,
      }

      // Atomic: server-side increment + transaction in one multi-path update
      await firebaseHelpers.adjustStock(product.id, quickActionAmount, transactionData)

      toast({
        title: "Stock in berhasil",
        description: `${product.name} +${quickActionAmount} unit.`,
        duration: 3000,
      })

      onClose()
    } catch (error) {
      console.error("Error stock in:", error)
      toast({
        title: "Error",
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
      const transactionData = {
        type: "out" as "in" | "out" | "adjustment",
        productName: product.name,
        productBarcode: product.barcode || barcode || "",
        quantity: quickActionAmount,
        reason: "Stock Out via Quick Action",
        operator: "ESP32 Scanner",
        notes: `Stock out via ESP32 scanner - ${isMobile ? 'Mobile' : 'Desktop'}`,
      }

      // Atomic: server-side decrement + transaction in one multi-path update
      await firebaseHelpers.adjustStock(product.id, -quickActionAmount, transactionData)

      toast({
        title: "Stock out berhasil",
        description: `${product.name} -${quickActionAmount} unit.`,
        duration: 3000,
      })

      onClose()
    } catch (error) {
      console.error("Error stock out:", error)
      toast({
        title: "Error",
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
        name: newProduct.name.trim(),
        category: newProduct.category.trim() || "Umum",
        quantity: Math.max(0, Number(newProduct.quantity) || 0),
        minStock: Math.max(0, Number(newProduct.minStock) || 0),
        description: newProduct.description.trim(),
        location: newProduct.location.trim(),
        supplier: newProduct.supplier?.trim() || "",
        barcode: barcode || "",
      }

      await addItem(productData, "Scanner")

      toast({
        title: "Produk ditambahkan",
        description: `${productData.name} berhasil ditambahkan dengan stok ${productData.quantity}`,
        duration: 3000,
      })
      
      onClose()
    } catch (error) {
      console.error("Error adding product:", error)
      toast({
        title: "Error",
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
      <div className="flex items-center gap-3 p-3 bg-primary/5 rounded-lg">
        <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
          <Package className="h-6 w-6 text-primary" />
        </div>
        <div className="flex-1">
          <h2 className="font-semibold text-sm">{product?.name}</h2>
          <p className="text-xs text-muted-foreground">Barcode: {barcode}</p>
          <div className="flex gap-2 mt-1">
            <Badge variant={product && product.quantity <= product.minStock ? "destructive" : "default"} className="text-xs">
              Stok: {product?.quantity} unit
            </Badge>
            <Badge variant="outline" className="text-xs">
              Minimum: {product?.minStock ?? 0}
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

      {/* Action Buttons */}
      {writable && <div className="grid grid-cols-2 gap-3 pt-2">
        <Button 
          onClick={handleStockIn} 
          disabled={isLoading}
          className="bg-primary hover:bg-primary/90 text-primary-foreground h-12 text-sm"
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
          className="bg-destructive hover:bg-destructive/90 text-destructive-foreground h-12 text-sm"
        >
          {isLoading ? (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
          ) : (
            <Minus className="h-4 w-4 mr-2" />
          )}
          Stock Out
        </Button>
      </div>}

      {/* Stock Warning */}
      {product && product.quantity < quickActionAmount && (
        <div className="p-3 bg-amber-50/60 border border-amber-200/60 rounded-lg">
          <div className="flex items-center gap-2 text-amber-800">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-xs">Stok tidak mencukupi untuk stock out {quickActionAmount} unit</span>
          </div>
        </div>
      )}
    </div>
  )

  // Filter catalog by search text
  const filteredCatalog = useMemo(() => {
    if (!catalog || catalog.length === 0 || !catalogSearch.trim()) return catalog
    const q = catalogSearch.toLowerCase()
    return catalog.filter((item) => item.name.toLowerCase().includes(q))
  }, [catalog, catalogSearch])

  const handleSelectCatalogItem = (item: CatalogItem) => {
    setNewProduct((prev) => ({
      ...prev,
      name: item.name,
      category: "Suku Cadang Honda",
      supplier: "Honda Cengkareng",
      description: `Data dari Honda Cengkareng. ${item.sourceUrl ? item.sourceUrl : ""}`,
    }))
    setLookupStatus("found")
  }

  // Reset catalog search on close
  useEffect(() => {
    if (!isOpen) {
      setCatalog([])
      setCatalogSearch("")
    }
  }, [isOpen])

  const renderAddNewProduct = () => (
    <div className="space-y-4">
      {/* Product Not Found Header — dim when catalog item selected */}
      <div className={`flex items-center justify-center p-4 rounded-lg border ${
        lookupStatus === "found" && catalog.length > 0
          ? "bg-green-50/60 border-green-200/60"
          : "bg-amber-50/60 border-amber-200/60"
      }`}>
        <div className="flex flex-col items-center text-center">
          {lookupStatus === "found" && catalog.length > 0 ? (
            <>
              <Package className="h-8 w-8 text-green-500 mb-2" />
              <h2 className="text-sm font-medium text-green-800">Produk Dipilih dari Katalog</h2>
              <p className="text-xs text-green-600 mt-1">Data produk dari Honda Cengkareng</p>
            </>
          ) : (
            <>
              <AlertTriangle className="h-8 w-8 text-amber-500 mb-2" />
              <h2 className="text-sm font-medium text-amber-800">Produk Tidak Ditemukan</h2>
              <p className="text-xs text-amber-600 mt-1">
                Barcode <span className="font-mono font-bold bg-amber-100 px-1 py-0.5 rounded">{barcode}</span> belum terdaftar.
              </p>
            </>
          )}
        </div>
      </div>

      {lookupStatus !== "idle" && (
        <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          {lookupStatus === "loading" && "Mencari data produk di Honda Cengkareng..."}
          {lookupStatus === "found" && "Data produk ditemukan dan form otomatis diisi. Periksa sebelum menyimpan."}
          {lookupStatus === "not-found" && "Data produk tidak ditemukan otomatis. Pilih dari katalog atau isi manual."}
        </div>
      )}

      {/* Catalog picker — shown when barcode search fails but catalog available */}
      {lookupStatus === "not-found" && catalog.length > 0 && (
        <div className="space-y-2">
          <Label className="text-sm font-medium">Pilih dari Katalog Honda</Label>
          <Input
            value={catalogSearch}
            onChange={(e) => setCatalogSearch(e.target.value)}
            placeholder="Cari produk..."
            className="h-9 text-sm"
          />
          <div className="max-h-40 overflow-y-auto rounded-lg border border-border divide-y divide-border">
            {filteredCatalog && filteredCatalog.length > 0 ? (
              filteredCatalog.map((item, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleSelectCatalogItem(item)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors truncate"
                >
                  {item.name}
                </button>
              ))
            ) : (
              <div className="px-3 py-2 text-xs text-muted-foreground text-center">
                {catalogSearch ? "Tidak ditemukan" : "Daftar produk kosong"}
              </div>
            )}
          </div>
        </div>
      )}

      {!writable && <div className="text-sm text-muted-foreground text-center">Akun viewer hanya dapat melihat data scan.</div>}
      {/* Add New Product Form */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <PackageOpen className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-medium">Tambah Produk Baru</h2>
        </div>

        <div>
          <Label className="text-sm font-medium">Barcode</Label>
          <Input
            value={barcode || ""}
            className="h-10 text-sm font-mono"
            disabled
            readOnly
          />
        </div>

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
              placeholder="0"
              className="h-10 text-sm"
              min="0"
              disabled={isLoading}
            />
          </div>
          <div>
            <Label className="text-sm font-medium">Stok Minimum</Label>
            <Input
              type="number"
              value={newProduct.minStock}
              onChange={(e) => setNewProduct(prev => ({ ...prev, minStock: Math.max(0, parseInt(e.target.value) || 0) }))}
              placeholder="0"
              className="h-10 text-sm"
              min="0"
              disabled={isLoading}
            />
          </div>
        </div>

        <div>
          <Label className="text-sm font-medium">Kategori</Label>
          <Input
            value={newProduct.category}
            onChange={(e) => setNewProduct(prev => ({ ...prev, category: e.target.value }))}
            placeholder="Contoh: Oli & Pelumas"
            className="h-10 text-sm"
            disabled={isLoading}
          />
        </div>

        <div>
          <Label className="text-sm font-medium">Lokasi</Label>
          <Input
            value={newProduct.location}
            onChange={(e) => setNewProduct(prev => ({ ...prev, location: e.target.value }))}
            placeholder="Contoh: Rak A1"
            className="h-10 text-sm"
            disabled={isLoading}
          />
        </div>

        <div>
          <Label className="text-sm font-medium">Supplier</Label>
          <Input
            value={newProduct.supplier || ""}
            onChange={(e) => setNewProduct(prev => ({ ...prev, supplier: e.target.value }))}
            placeholder="Nama pemasok"
            className="h-10 text-sm"
            disabled={isLoading}
          />
        </div>

        <div>
          <Label className="text-sm font-medium">Deskripsi</Label>
          <Textarea
            value={newProduct.description}
            onChange={(e) => setNewProduct(prev => ({ ...prev, description: e.target.value }))}
            placeholder="Detail produk"
            className="min-h-20 text-sm"
            disabled={isLoading}
          />
        </div>
      </div>

      {/* Add Button */}
      <Button
        onClick={handleAddNewProduct}
        disabled={isLoading || !newProduct.name.trim()}
        className={`w-full h-12 text-sm text-white ${lookupStatus === "found" ? "bg-green-600 hover:bg-green-700" : "bg-primary hover:bg-primary/90 text-primary-foreground"}`}
      >
        {isLoading ? (
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
        ) : (
          <Plus className="h-4 w-4 mr-2" />
        )}
        {lookupStatus === "found" ? "Tambah Barang Otomatis" : "Tambah Produk"}
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
              <Zap className="h-5 w-5 text-primary" />
              <DialogTitle className="text-base">Aksi Cepat ESP32</DialogTitle>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-8 w-8 p-0 hover:bg-accent flex-shrink-0"
              aria-label="Tutup popup aksi cepat"
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Tutup</span>
            </Button>
          </div>
          <DialogDescription className="sr-only">
            {product 
              ? `Kelola stok untuk produk ${product.name} dengan barcode ${barcode}. Anda dapat melakukan stock in, stock out, atau mengedit informasi produk.`
              : `Produk dengan barcode ${barcode} tidak ditemukan. Anda dapat menambahkan produk baru ke inventory.`
            }
          </DialogDescription>
        </DialogHeader>

        {/* Mode Toggle: Manual / Auto IN / Auto OUT */}
        <div className="flex items-center gap-1.5 mb-3 px-1">
          <ArrowRightLeft className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <div className="flex rounded-lg border border-border p-0.5 bg-muted/50 w-full">
            {(["ask", "in", "out"] as ScanMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setScanMode(mode)}
                className={`
                  flex-1 text-xs font-medium py-1.5 px-2 rounded-md transition-all
                  ${scanMode === mode
                    ? mode === "ask"
                      ? "bg-background shadow-sm text-foreground"
                      : mode === "in"
                        ? "bg-green-600 text-white shadow-sm"
                        : "bg-red-600 text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                  }
                `}
              >
                {MODE_LABELS[mode]}
              </button>
            ))}
          </div>
        </div>

        {product ? renderExistingProduct() : renderAddNewProduct()}
        
        {/* ESP32 Indicator */}
        <div className="flex items-center justify-center gap-2 pt-2 border-t border-border">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
          <span className="text-xs text-muted-foreground">ESP32 Scanner Aktif - {isMobile ? 'Mobile' : 'Desktop'}</span>
        </div>
      </DialogContent>
    </Dialog>
  )
}
