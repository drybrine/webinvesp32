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
import { 
  Package, 
  Plus, 
  Minus, 
  Zap, 
  AlertTriangle, 
  PackageOpen, 
  X,
  Check,
  AlertCircle,
  MapPin,
  Building2,
  Tag,
  FileText,
  Barcode,
  Search,
  ArrowRight,
  Info,
  Sparkles,
  Database
} from "lucide-react"
import { useAuth } from "@/components/auth-provider"
import { useScanMode } from "@/hooks/use-scan-mode"
import { canWrite } from "@/types/security"

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
  const { scanMode } = useScanMode()
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

    // If barcode is unknown and we are in "out" mode, abort lookup and set status
    if (scanMode === "out") {
      setLookupStatus("not-found")
      if (scanId && deviceId) {
        firebaseHelpers.updateDeviceLookupStatus(deviceId, {
          scanId,
          barcode,
          status: "not_found",
          message: "Gagal: Barang belum terdaftar",
        }).catch((e: unknown) => console.error("[lookup] write not_found failed:", e))
      }
      return
    }

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
      }).catch((e: unknown) => console.error("[lookup] write searching failed:", e))
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
              message: "Isi manual di web",
            }).catch((e: unknown) => console.error("[lookup] write not_found failed:", e))
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
          }).catch((e: unknown) => console.error("[lookup] write found failed:", e))
        }
      })
      .catch((error) => {
        if (error?.name === "AbortError") return
        console.error("[lookup] fetch error:", error)
        setLookupStatus("not-found")
        if (scanId && deviceId) {
          firebaseHelpers.updateDeviceLookupStatus(deviceId, {
            scanId,
            barcode,
            status: "failed",
            message: "lookup failed",
          }).catch((e: unknown) => console.error("[lookup] write failed status:", e))
        }
      })

    return () => controller.abort()
  }, [barcode, deviceId, items, isOpen, scanId, scanMode])

  // Handle body scroll prevention
  useEffect(() => {
    if (isOpen && typeof document !== 'undefined') {
      if (isMobile) {
        // Mobile: Full scroll prevention
        document.body.classList.add('dialog-open')
        document.body.style.overflow = 'hidden'
        document.body.style.position = 'fixed'
        document.body.style.width = '105%'
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

      // Mark scan as processed immediately to prevent duplicate popups during re-renders
      if (scanId) {
        await firebaseHelpers.markScanProcessed(scanId).catch((e) => {
          console.error("Failed to mark scan processed:", e)
        })
      }

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

      // Mark scan as processed immediately to prevent duplicate popups during re-renders
      if (scanId) {
        await firebaseHelpers.markScanProcessed(scanId).catch((e) => {
          console.error("Failed to mark scan processed:", e)
        })
      }

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

      // Mark scan as processed immediately to prevent duplicate popups during re-renders
      if (scanId) {
        await firebaseHelpers.markScanProcessed(scanId).catch((e) => {
          console.error("Failed to mark scan processed:", e)
        })
      }

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

  const renderExistingProduct = () => {
    const isLowStock = product && product.quantity <= product.minStock
    
    return (
      <div className="space-y-5 pt-3">
        {/* Product Card with Glowing Gradient Border */}
        <div className={`relative overflow-hidden rounded-xl border p-4 transition-all duration-300 shadow-md ${
          isLowStock 
            ? "border-destructive/30 bg-gradient-to-br from-destructive/5 via-background to-destructive/5 shadow-destructive/5 animate-scale-in" 
            : "border-primary/10 bg-gradient-to-br from-primary/5 via-background to-primary/5 shadow-primary/5 animate-scale-in"
        }`}>
          {/* Subtle background glow */}
          <div className={`absolute -right-16 -top-16 w-32 h-32 rounded-full blur-3xl opacity-20 ${
            isLowStock ? "bg-destructive" : "bg-primary"
          }`} />
          
          <div className="relative flex items-start gap-4 z-10">
            <div className={`w-14 h-14 rounded-xl flex items-center justify-center shadow-inner border flex-shrink-0 ${
              isLowStock 
                ? "bg-destructive/10 border-destructive/20 text-destructive" 
                : "bg-primary/10 border-primary/20 text-primary"
            }`}>
              <Package className="h-7 w-7" />
            </div>
            
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-sm text-foreground tracking-tight leading-snug line-clamp-2">
                {product?.name}
              </h3>
              <div className="flex items-center gap-1 mt-1">
                <Barcode className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-mono text-muted-foreground select-all">{barcode}</span>
              </div>
              
              <div className="flex flex-wrap gap-1.5 mt-3">
                <Badge 
                  variant={isLowStock ? "destructive" : "secondary"} 
                  className={`text-[10px] font-bold px-2 py-0.5 shadow-sm ${
                    !isLowStock && "bg-primary/10 text-primary hover:bg-primary/10 border border-primary/20"
                  }`}
                >
                  Stok: {product?.quantity} unit
                </Badge>
                <Badge variant="outline" className="text-[10px] font-semibold bg-background/50 text-muted-foreground px-2 py-0.5 border-border/85">
                  Min. Stok: {product?.minStock ?? 0}
                </Badge>
                {isLowStock && (
                  <Badge variant="destructive" className="text-[9px] bg-red-500/10 text-red-600 border border-red-500/20 px-2 py-0.5 font-bold animate-pulse hover:bg-red-500/10">
                    Stok Menipis
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Quick Amount Controls */}
        <div className="space-y-2.5 bg-muted/30 p-3.5 rounded-xl border border-border/50">
          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Jumlah Stock In / Out
          </Label>
          <div className="flex items-center justify-between gap-3">
            <Button 
              variant="outline" 
              onClick={() => setQuickActionAmount(Math.max(1, quickActionAmount - 1))}
              disabled={isLoading}
              className="h-10 w-10 p-0 rounded-lg border-border/60 hover:bg-accent hover:text-accent-foreground active:scale-95 transition-all shadow-sm flex-shrink-0"
            >
              <Minus className="h-4 w-4" />
            </Button>
            <div className="relative flex-1 max-w-[120px]">
              <Input
                type="number"
                value={quickActionAmount}
                onChange={(e) => setQuickActionAmount(Math.max(1, parseInt(e.target.value) || 1))}
                className="text-center h-10 w-full font-bold text-base rounded-lg border-border/60 focus-visible:ring-primary shadow-sm"
                min="1"
                disabled={isLoading}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-muted-foreground pointer-events-none uppercase">
                unit
              </span>
            </div>
            <Button 
              variant="outline" 
              onClick={() => setQuickActionAmount(quickActionAmount + 1)}
              disabled={isLoading}
              className="h-10 w-10 p-0 rounded-lg border-border/60 hover:bg-accent hover:text-accent-foreground active:scale-95 transition-all shadow-sm flex-shrink-0"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Action Buttons */}
        {writable && (
          <div className="grid grid-cols-2 gap-3 pt-1">
            <Button 
              onClick={handleStockIn} 
              disabled={isLoading}
              className="bg-primary hover:bg-primary/95 text-primary-foreground h-11 text-xs font-bold rounded-xl shadow-lg shadow-primary/10 transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-1.5"
            >
              {isLoading ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              ) : (
                <>
                  <Plus className="h-3.5 w-3.5" />
                  <span>Stok Masuk</span>
                </>
              )}
            </Button>
            <Button 
              onClick={handleStockOut} 
              disabled={isLoading || !!(product && product.quantity < quickActionAmount)}
              className="bg-destructive hover:bg-destructive/95 text-destructive-foreground h-11 text-xs font-bold rounded-xl shadow-lg shadow-destructive/10 transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-1.5"
            >
              {isLoading ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              ) : (
                <>
                  <Minus className="h-3.5 w-3.5" />
                  <span>Stok Keluar</span>
                </>
              )}
            </Button>
          </div>
        )}

        {/* Stock Warning */}
        {product && product.quantity < quickActionAmount && (
          <div className="p-3 bg-red-500/5 border border-red-500/20 rounded-xl flex items-start gap-2.5 text-red-600 animate-in fade-in slide-in-from-top-1 duration-200 shadow-sm shadow-destructive/5">
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <div className="space-y-0.5">
              <p className="text-xs font-bold leading-none">Stok Kurang</p>
              <p className="text-[10px] text-red-500/80 leading-normal">
                Stok saat ini ({product.quantity} unit) tidak mencukupi untuk melakukan stock out sebesar {quickActionAmount} unit.
              </p>
            </div>
          </div>
        )}
      </div>
    )
  }

  const renderUnknownProductWarning = () => (
    <div className="space-y-5 pt-3">
      {/* Warning Card */}
      <div className="relative overflow-hidden rounded-xl border border-destructive/20 bg-gradient-to-br from-destructive/10 via-background to-destructive/5 p-5 text-center shadow-md animate-scale-in">
        <div className="absolute -right-10 -top-10 w-24 h-24 rounded-full bg-destructive/15 blur-2xl" />
        
        <div className="relative z-10 flex flex-col items-center">
          <div className="w-12 h-12 bg-destructive/10 rounded-full border border-destructive/20 flex items-center justify-center mb-3.5 shadow-inner">
            <AlertTriangle className="h-5 w-5 text-destructive animate-bounce" />
          </div>
          <h2 className="text-sm font-bold text-destructive tracking-tight uppercase">Gagal: Barang Belum Terdaftar</h2>
          
          <div className="flex items-center gap-1.5 mt-2 bg-destructive/10 border border-destructive/15 rounded-lg px-2.5 py-1">
            <Barcode className="h-3.5 w-3.5 text-destructive" />
            <span className="text-xs font-mono font-bold text-destructive select-all">{barcode}</span>
          </div>
        </div>
      </div>

      {/* Explanatory Info */}
      <div className="rounded-xl border border-border/80 bg-muted/20 p-4 space-y-3.5 shadow-inner animate-fade-in-up">
        <div className="flex items-start gap-2.5">
          <Info className="h-4.5 w-4.5 text-muted-foreground mt-0.5 flex-shrink-0" />
          <p className="text-xs text-muted-foreground leading-normal">
            Anda saat ini sedang menggunakan mode <strong className="text-foreground font-semibold">Auto KELUAR (Out)</strong>. Sistem tidak diizinkan untuk mengurangi stok barang yang belum terdaftar.
          </p>
        </div>
        
        <div className="border-t border-border/40 pt-3">
          <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
            Langkah-Langkah Solusi:
          </h4>
          <ol className="space-y-2 text-xs">
            <li className="flex items-start gap-2 text-muted-foreground">
              <span className="flex-shrink-0 w-4.5 h-4.5 rounded-full bg-muted border border-border/80 flex items-center justify-center text-[10px] font-bold text-foreground shadow-sm">
                1
              </span>
              <span className="leading-tight mt-0.5">Tutup popup peringatan ini.</span>
            </li>
            <li className="flex items-start gap-2 text-muted-foreground">
              <span className="flex-shrink-0 w-4.5 h-4.5 rounded-full bg-muted border border-border/80 flex items-center justify-center text-[10px] font-bold text-foreground shadow-sm">
                2
              </span>
              <span className="leading-tight mt-0.5">
                Ubah mode scanner di dashboard menjadi <strong className="text-foreground font-semibold">Manual</strong> atau <strong className="text-foreground font-semibold text-primary">Auto MASUK (In)</strong>.
              </span>
            </li>
            <li className="flex items-start gap-2 text-muted-foreground">
              <span className="flex-shrink-0 w-4.5 h-4.5 rounded-full bg-muted border border-border/80 flex items-center justify-center text-[10px] font-bold text-foreground shadow-sm">
                3
              </span>
              <span className="leading-tight mt-0.5">
                Pindai ulang barcode untuk membuka form pendaftaran barang baru.
              </span>
            </li>
          </ol>
        </div>
      </div>

      <Button 
        onClick={onClose}
        className="w-full h-11 text-xs font-bold bg-destructive hover:bg-destructive/90 text-white rounded-xl shadow-lg shadow-destructive/10 transition-all active:scale-[0.98]"
      >
        Tutup Peringatan
      </Button>
    </div>
  )

  const renderAddNewProduct = () => (
    <div className="space-y-5 pt-3">
      {/* Product Not Found / Found Header */}
      <div className={`relative overflow-hidden rounded-xl border p-4 transition-all duration-300 shadow-md animate-scale-in ${
        lookupStatus === "found" && catalog.length > 0
          ? "border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 via-background to-emerald-500/5 shadow-emerald-500/5"
          : lookupStatus === "found"
            ? "border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 via-background to-emerald-500/5 shadow-emerald-500/5"
            : "border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-background to-amber-500/5 shadow-amber-500/5"
      }`}>
        {/* Decorative backdrop glow */}
        <div className={`absolute -right-16 -top-16 w-32 h-32 rounded-full blur-3xl opacity-20 ${
          lookupStatus === "found" ? "bg-emerald-500" : "bg-amber-500"
        }`} />

        <div className="relative z-10 flex items-start gap-3.5">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-inner border flex-shrink-0 ${
            lookupStatus === "found"
              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600"
              : "bg-amber-500/10 border-amber-500/20 text-amber-600"
          }`}>
            {lookupStatus === "found" ? (
              <Check className="h-6 w-6 animate-in zoom-in duration-300" />
            ) : (
              <AlertTriangle className="h-6 w-6 animate-pulse" />
            )}
          </div>
          
          <div className="flex-1 min-w-0">
            <h3 className={`font-bold text-sm tracking-tight ${
              lookupStatus === "found" ? "text-emerald-800" : "text-amber-800"
            }`}>
              {lookupStatus === "found" 
                ? "Data Produk Ditemukan" 
                : "Produk Belum Terdaftar"
              }
            </h3>
            
            <p className={`text-xs mt-0.5 leading-normal ${
              lookupStatus === "found" ? "text-emerald-600" : "text-amber-600"
            }`}>
              {lookupStatus === "found"
                ? "Informasi produk berhasil ditarik otomatis dari database katalog Honda."
                : `Barcode ${barcode} belum terdaftar. Isi form di bawah untuk mendaftarkan.`
              }
            </p>
          </div>
        </div>
      </div>

      {/* Lookup Status Banner */}
      {lookupStatus !== "idle" && (
        <div className="rounded-xl border border-border/80 bg-muted/30 px-3.5 py-2.5 text-xs text-muted-foreground flex items-center gap-2 animate-fade-in-up">
          {lookupStatus === "loading" && (
            <>
              <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-primary"></div>
              <span>Mencari data produk di Honda Cengkareng...</span>
            </>
          )}
          {lookupStatus === "found" && (
            <>
              <Sparkles className="h-3.5 w-3.5 text-emerald-500 animate-pulse" />
              <span>Form telah diisi otomatis. Silakan verifikasi kembali sebelum menyimpan.</span>
            </>
          )}
          {lookupStatus === "not-found" && (
            <>
              <Info className="h-3.5 w-3.5 text-muted-foreground" />
              <span>Pencarian otomatis tidak menemukan produk. Cari di katalog manual atau isi sendiri.</span>
            </>
          )}
        </div>
      )}

      {/* Catalog search/picker */}
      {lookupStatus === "not-found" && catalog.length > 0 && (
        <div className="space-y-2.5 bg-muted/20 p-3.5 rounded-xl border border-border/50 animate-fade-in-up shadow-sm">
          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Pilih dari Katalog Honda Cengkareng
          </Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={catalogSearch}
              onChange={(e) => setCatalogSearch(e.target.value)}
              placeholder="Cari produk dari hasil katalog..."
              className="h-9 pl-9 text-xs border-border/60 shadow-sm focus-visible:ring-primary"
            />
          </div>
          
          <div className="max-h-36 overflow-y-auto rounded-lg border border-border/60 bg-background divide-y divide-border/40 scrollbar-thin shadow-inner">
            {filteredCatalog && filteredCatalog.length > 0 ? (
              filteredCatalog.map((item, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleSelectCatalogItem(item)}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-accent/60 transition-colors truncate flex items-center justify-between group"
                >
                  <span className="font-medium text-muted-foreground group-hover:text-foreground transition-colors truncate">
                    {item.name}
                  </span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground/0 group-hover:text-primary group-hover:translate-x-0.5 transition-all flex-shrink-0" />
                </button>
              ))
            ) : (
              <div className="px-3 py-4 text-xs text-muted-foreground text-center">
                {catalogSearch ? "Tidak ditemukan produk yang cocok" : "Daftar produk katalog kosong"}
              </div>
            )}
          </div>
        </div>
      )}

      {!writable && (
        <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl flex items-center gap-2 text-amber-600 shadow-sm animate-fade-in-up">
          <Info className="h-4 w-4 flex-shrink-0" />
          <span className="text-xs">Akun Anda (Viewer) hanya dapat melihat data scan dan tidak memiliki hak akses tulis.</span>
        </div>
      )}

      {/* Add New Product Form */}
      <div className="space-y-4 animate-fade-in-up">
        <div className="flex items-center gap-2 pb-1 border-b border-border/40">
          <PackageOpen className="h-4 w-4 text-primary animate-pulse" />
          <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
            Form Detail Produk Baru
          </h4>
        </div>

        <div className="grid gap-3.5">
          {/* Barcode (Readonly) */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground">Barcode</Label>
            <div className="relative">
              <Barcode className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={barcode || ""}
                className="h-10 pl-9 font-mono text-xs bg-muted/45 border-border/50 text-muted-foreground cursor-not-allowed select-all rounded-lg shadow-sm"
                disabled
                readOnly
              />
            </div>
          </div>

          {/* Product Name */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground">Nama Produk <span className="text-destructive">*</span></Label>
            <div className="relative">
              <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={newProduct.name}
                onChange={(e) => setNewProduct(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Masukkan nama lengkap produk / sparepart"
                className="h-10 pl-9 text-xs border-border/60 focus-visible:ring-primary rounded-lg shadow-sm"
                disabled={isLoading || !writable}
                required
              />
            </div>
          </div>

          {/* Quantities (Stock and MinStock) */}
          <div className="grid grid-cols-2 gap-3.5">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground">Stok Awal</Label>
              <div className="relative">
                <Database className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="number"
                  value={newProduct.quantity}
                  onChange={(e) => setNewProduct(prev => ({ ...prev, quantity: Math.max(0, parseInt(e.target.value) || 0) }))}
                  placeholder="0"
                  className="h-10 pl-9 text-xs border-border/60 focus-visible:ring-primary rounded-lg shadow-sm"
                  min="0"
                  disabled={isLoading || !writable}
                />
              </div>
            </div>
            
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground">Min. Stok</Label>
              <div className="relative">
                <AlertCircle className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="number"
                  value={newProduct.minStock}
                  onChange={(e) => setNewProduct(prev => ({ ...prev, minStock: Math.max(0, parseInt(e.target.value) || 0) }))}
                  placeholder="0"
                  className="h-10 pl-9 text-xs border-border/60 focus-visible:ring-primary rounded-lg shadow-sm"
                  min="0"
                  disabled={isLoading || !writable}
                />
              </div>
            </div>
          </div>

          {/* Category */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground">Kategori</Label>
            <div className="relative">
              <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={newProduct.category}
                onChange={(e) => setNewProduct(prev => ({ ...prev, category: e.target.value }))}
                placeholder="Contoh: Mesin, Transmisi, Oli & Pelumas"
                className="h-10 pl-9 text-xs border-border/60 focus-visible:ring-primary rounded-lg shadow-sm"
                disabled={isLoading || !writable}
              />
            </div>
          </div>

          {/* Location */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground">Lokasi Rak / Box</Label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={newProduct.location}
                onChange={(e) => setNewProduct(prev => ({ ...prev, location: e.target.value }))}
                placeholder="Contoh: Rak A-02, Box C"
                className="h-10 pl-9 text-xs border-border/60 focus-visible:ring-primary rounded-lg shadow-sm"
                disabled={isLoading || !writable}
              />
            </div>
          </div>

          {/* Supplier */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground">Supplier / Pemasok</Label>
            <div className="relative">
              <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={newProduct.supplier || ""}
                onChange={(e) => setNewProduct(prev => ({ ...prev, supplier: e.target.value }))}
                placeholder="Nama perusahaan / dealer pemasok"
                className="h-10 pl-9 text-xs border-border/60 focus-visible:ring-primary rounded-lg shadow-sm"
                disabled={isLoading || !writable}
              />
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground">Deskripsi / Catatan</Label>
            <div className="relative">
              <FileText className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Textarea
                value={newProduct.description}
                onChange={(e) => setNewProduct(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Spesifikasi teknis, kecocokan part, atau informasi tambahan"
                className="min-h-20 pl-9 text-xs border-border/60 focus-visible:ring-primary rounded-lg shadow-sm"
                disabled={isLoading || !writable}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Add Button */}
      <Button
        onClick={handleAddNewProduct}
        disabled={isLoading || !newProduct.name.trim() || !writable}
        className={`w-full h-11 text-xs font-bold text-white rounded-xl shadow-lg transition-all duration-200 active:scale-[0.98] ${
          lookupStatus === "found" 
            ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/10" 
            : "bg-primary hover:bg-primary/95 text-primary-foreground shadow-primary/10"
        }`}
      >
        {isLoading ? (
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
        ) : (
          <Plus className="h-4 w-4 mr-2" />
        )}
        {lookupStatus === "found" ? "Tambah Barang Otomatis" : "Daftarkan Produk Baru"}
      </Button>
    </div>
  )

    // Dynamic sizing based on device type
  const dialogContentClass = `w-[95vw] ${isMobile ? "max-w-sm" : "max-w-md"} mx-auto p-0 rounded-2xl max-h-[85vh] border border-border/80 shadow-2xl backdrop-blur-md bg-background/95 flex flex-col overflow-hidden animate-scale-in`

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className={`${dialogContentClass} [&>button]:hidden`}>
        {/* Header */}
        <DialogHeader className={`border-b border-border/60 relative overflow-hidden shrink-0 ${isMobile ? "p-5 pb-4" : "p-6 pb-4"}`}>
          {/* Decorative glowing gradient effect behind title */}
          <div className="absolute top-0 left-1/4 right-1/4 h-[1px] bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
          <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-32 h-16 bg-primary/10 rounded-full blur-2xl" />
          
          <div className="flex items-center justify-between relative z-10">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shadow-inner">
                <Zap className="h-4.5 w-4.5 text-primary animate-pulse" />
              </div>
              <div>
                <DialogTitle className="text-sm font-bold tracking-tight bg-gradient-to-r from-foreground via-foreground/90 to-muted-foreground bg-clip-text text-transparent">
                  Aksi Cepat ESP32
                </DialogTitle>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                    Mode: {scanMode === "in" ? "Auto Masuk" : scanMode === "out" ? "Auto Keluar" : "Manual / Ask"}
                  </span>
                </div>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-8 w-8 rounded-full hover:bg-accent/80 transition-colors flex-shrink-0"
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

        {/* Scrollable Content Area */}
        <div className={`flex-1 overflow-y-auto scrollbar-thin ${isMobile ? "px-5 pb-5" : "px-6 pb-6"}`}>
          {product 
            ? renderExistingProduct() 
            : (scanMode === "out" ? renderUnknownProductWarning() : renderAddNewProduct())
          }
        </div>
        
        {/* ESP32 Indicator */}
        <div className="flex items-center justify-center gap-2 py-3.5 border-t border-border/40 shrink-0 bg-muted/20">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
            ESP32 Scanner Aktif - {isMobile ? "Mobile View" : "Desktop View"}
          </span>
        </div>
      </DialogContent>
    </Dialog>
  )
}
