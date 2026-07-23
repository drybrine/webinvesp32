"use client"

import { useState, useMemo, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Plus, Search, Eye, Download, TrendingUp, TrendingDown, Calendar, FileText } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { useFirebaseInventory, useFirebaseTransactions } from "@/hooks/use-firebase"
import { firebaseHelpers } from "@/lib/firebase"
import { downloadCsv } from "@/lib/csv"
import { useAuth } from "@/components/auth-provider"
import { canWrite } from "@/types/security"
import { LoadingSpinner } from "@/components/loading-spinner"

interface Transaction {
  id: string
  type: "in" | "out" | "adjustment"
  productName: string
  productBarcode: string
  quantity: number
  reason: string
  operator: string
  timestamp: string | number
  notes?: string
}

export default function TransaksiPage() {
  const { role } = useAuth()
  const writable = canWrite(role)
  const { items: inventory, loading: inventoryLoading } = useFirebaseInventory()
  const {
    transactions,
    loading: transactionsLoading,
    error: transactionsError,
  } = useFirebaseTransactions(null)

  const [searchTerm, setSearchTerm] = useState("")
  const [selectedType, setSelectedType] = useState("all")
  const [selectedPeriod, setSelectedPeriod] = useState("all")
  const [selectedSource, setSelectedSource] = useState("all")
  const [currentPage, setCurrentPage] = useState(1)
  const PAGE_SIZE = 50
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false)
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [formData, setFormData] = useState({
    type: "in",
    productBarcode: "",
    productName: "",
    quantity: "",
    reason: "",
    notes: "",
  })
  const { toast } = useToast()

  const isManualSource = (t: Transaction) => {
    const op = (t.operator || "").toLowerCase()
    return op === "dashboard" || op === "manual" || op === "admin" || op === ""
  }

  const filteredTransactions = useMemo(() => {
    return transactions.filter((transaction) => {
      const term = searchTerm.toLowerCase()
      const matchesSearch =
        (transaction.productName || "").toLowerCase().includes(term) ||
        (transaction.productBarcode || "").includes(searchTerm) ||
        (transaction.operator || "").toLowerCase().includes(term) ||
        (transaction.reason || "").toLowerCase().includes(term)
      const matchesType = selectedType === "all" || transaction.type === selectedType
      const matchesSource =
        selectedSource === "all" ||
        (selectedSource === "manual" && isManualSource(transaction)) ||
        (selectedSource === "scanner" && !isManualSource(transaction))

      let matchesPeriod = true
      if (selectedPeriod !== "all" && transaction.timestamp) {
        const transactionTimestamp = typeof transaction.timestamp === 'string'
          ? new Date(transaction.timestamp).getTime()
          : transaction.timestamp;
        const transactionDate = new Date(transactionTimestamp)
        const now = new Date()
        const daysDiff = Math.floor((now.getTime() - transactionDate.getTime()) / (1000 * 60 * 60 * 24))

        switch (selectedPeriod) {
          case "today":
            matchesPeriod = daysDiff === 0 && transactionDate.getDate() === now.getDate() && transactionDate.getMonth() === now.getMonth() && transactionDate.getFullYear() === now.getFullYear();
            break
          case "week":
            matchesPeriod = daysDiff >= 0 && daysDiff <= 7
            break
          case "month":
            matchesPeriod = daysDiff >= 0 && daysDiff <= 30
            break
        }
      }
      return matchesSearch && matchesType && matchesSource && matchesPeriod
    })
  }, [transactions, searchTerm, selectedType, selectedSource, selectedPeriod])

  // Reset ke page 1 saat filter berubah
  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, selectedType, selectedSource, selectedPeriod])

  const totalPages = Math.max(1, Math.ceil(filteredTransactions.length / PAGE_SIZE))

  // Clamp currentPage ketika data menyusut (pencarian/filter) agar tidak
  // berada di halaman yang sudah tidak valid.
  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages)
  }, [currentPage, totalPages])

  const pagedTransactions = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE
    return filteredTransactions.slice(start, start + PAGE_SIZE)
  }, [filteredTransactions, currentPage])

  const handleAddTransaction = async () => {
    if (isSaving) return
    if (!formData.productBarcode || !formData.productName || !formData.quantity || !formData.reason) {
      toast({ title: "Gagal", description: "Mohon lengkapi semua field wajib.", variant: "destructive" })
      return
    }

    const quantityNum = Number.parseInt(formData.quantity)

    if (isNaN(quantityNum) || quantityNum === 0) {
      toast({ title: "Gagal", description: "Jumlah harus berupa angka bukan nol.", variant: "destructive" });
      return;
    }

    let finalQuantity = quantityNum;

    if (formData.type === "out") {
      finalQuantity = -Math.abs(quantityNum);

      // Cek stok cukup sebelum proses
      const item = inventory.find(i => i.barcode === formData.productBarcode);
      if (item && (item.quantity || 0) + finalQuantity < 0) {
        toast({ title: "Gagal", description: `Stok tidak cukup. Stok saat ini: ${item.quantity}`, variant: "destructive" });
        return;
      }
    } else {
      finalQuantity = Math.abs(quantityNum);
    }

    // quantity always absolute; sign lives in type + adjustStock delta
    const newTransactionData = {
      type: formData.type as "in" | "out" | "adjustment",
      productName: formData.productName,
      productBarcode: formData.productBarcode,
      quantity: Math.abs(quantityNum),
      reason: formData.reason,
      operator: "Dashboard",
      notes: formData.notes,
    }

    setIsSaving(true)
    try {
      const itemToUpdate = inventory.find(item => item.barcode === formData.productBarcode);
      if (!itemToUpdate) {
        toast({ title: "Gagal", description: `Produk dengan barcode ${formData.productBarcode} tidak ditemukan di inventori.`, variant: "destructive" });
        return;
      }

      // Atomic: stock increment + transaction record in a single multi-path update.
      // finalQuantity is the signed delta (negative for "out").
      await firebaseHelpers.adjustStock(itemToUpdate.id, finalQuantity, newTransactionData);
      toast({ title: "Berhasil", description: "Transaksi berhasil ditambahkan." });

      setIsAddDialogOpen(false)
      resetForm()
    } catch (error) {
      console.error("Error:", error);
      toast({ title: "Gagal", description: "Gagal menambahkan transaksi.", variant: "destructive" })
    } finally {
      setIsSaving(false)
    }
  }

  /** Display signed qty: prefer type (abs ledger), fall back to signed legacy rows. */
  const displayQty = (t: Transaction) => {
    const abs = Math.abs(Number(t.quantity) || 0)
    if (t.type === "out") return -abs
    if (t.type === "in") return abs
    return Number(t.quantity) || 0
  }

  const resetForm = () => {
    setFormData({ type: "in", productBarcode: "", productName: "", quantity: "", reason: "", notes: "" })
  }

  const openViewDialog = (transaction: Transaction) => {
    setSelectedTransaction(transaction)
    setIsViewDialogOpen(true)
  }

  const formatNumber = (n: number) => {
    return (Number(n) || 0).toLocaleString("id-ID")
  }

  const formatDateTime = (timestamp: string | number) => {
    if (!timestamp) return "N/A";
    return new Date(timestamp).toLocaleString("id-ID", {
      year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    })
  }

  const getTypeLabel = (type: string) => {
    switch (type) {
      case "in": return "Masuk";
      case "out": return "Keluar";
      case "adjustment": return "Penyesuaian";
      default: return type;
    }
  }

  const getTypeVariant = (type: string) => {
    switch (type) {
      case "in": return "default" as const;
      case "out": return "secondary" as const;
      case "adjustment": return "destructive" as const;
      default: return "default" as const;
    }
  }

  const totalIn = useMemo(() => {
    const matched = transactions.filter((t) => t.type === "in");
    return {
      count: matched.length,
      units: matched.reduce((sum, t) => sum + Math.abs(Number(t.quantity) || 0), 0),
    };
  }, [transactions]);

  const totalOut = useMemo(() => {
    const matched = transactions.filter((t) => t.type === "out");
    return {
      count: matched.length,
      units: matched.reduce((sum, t) => sum + Math.abs(Number(t.quantity) || 0), 0),
    };
  }, [transactions]);

  const totalAdjustment = useMemo(() => {
    const matched = transactions.filter((t) => t.type === "adjustment");
    return {
      count: matched.length,
    };
  }, [transactions]);

  const todayTransactionsCount = useMemo(() => {
    const today = new Date();
    return transactions.filter((t) => {
      if (!t.timestamp) return false;
      const transactionDate = new Date(t.timestamp);
      return transactionDate.getDate() === today.getDate() && transactionDate.getMonth() === today.getMonth() && transactionDate.getFullYear() === today.getFullYear();
    }).length;
  }, [transactions]);

  const getCurrentStock = (barcode: string) => {
    const item = inventory.find((i) => i.barcode === barcode)
    return item ? item.quantity : "N/A"
  }

  if (inventoryLoading || transactionsLoading) {
    return <LoadingSpinner fullScreen label="Memuat data..." />
  }

  if (transactionsError) {
    return (
      <div className="min-h-[100dvh] bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center space-y-4">
            <p className="text-destructive">{transactionsError}</p>
            <Button onClick={() => window.location.reload()}>Muat Ulang</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const exportTransactionsToCSV = (filteredTransactions: Transaction[]) => {
    if (filteredTransactions.length === 0) {
      toast({ title: "Tidak Ada Data", description: "Tidak ada transaksi untuk diekspor.", variant: "destructive" })
      return
    }
    try {
      const headers = ["ID", "Waktu", "Jenis", "Nama Produk", "Barcode", "Jumlah", "Alasan", "Operator", "Catatan"]
      const csvData = filteredTransactions.map(transaction => [
        transaction.id || '', formatDateTime(transaction.timestamp || ''), getTypeLabel(transaction.type || ''),
        transaction.productName || '', transaction.productBarcode || '', (transaction.quantity || 0).toString(),
        transaction.reason || '', transaction.operator || '', transaction.notes || ''
      ])
      const fileName = `riwayat_${new Date().toISOString().split('T')[0]}.csv`
      downloadCsv(fileName, [headers, ...csvData])
      toast({ title: "Export Berhasil", description: `${filteredTransactions.length} transaksi diekspor.` })
    } catch (error) {
      toast({ title: "Export Gagal", description: "Terjadi kesalahan.", variant: "destructive" })
    }
  }

  return (
    <div className="min-h-[100dvh] bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-10 space-y-8">
        {/* Header */}
        <div className="animate-fade-in-up space-y-1">
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Riwayat</p>
          <h1 className="heading-1">Riwayat</h1>
          <p className="text-body max-w-2xl pt-1">Ledger bersifat permanen; koreksi dicatat sebagai transaksi pembalik baru.</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 stagger-children">
          <Card className="card-hover">
            <CardHeader className="pb-2">
              <CardTitle className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Transaksi Masuk</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-emerald-700 tabular-nums">{totalIn.count}</div>
              <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5"><TrendingUp className="h-3 w-3" /> {formatNumber(totalIn.units)} unit</p>
            </CardContent>
          </Card>

          <Card className="card-hover">
            <CardHeader className="pb-2">
              <CardTitle className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Transaksi Keluar</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600 tabular-nums">{totalOut.count}</div>
              <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5"><TrendingDown className="h-3 w-3" /> {formatNumber(totalOut.units)} unit</p>
            </CardContent>
          </Card>

          <Card className="card-hover">
            <CardHeader className="pb-2">
              <CardTitle className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Penyesuaian</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-600 tabular-nums">{totalAdjustment.count}</div>
              <p className="text-[11px] text-muted-foreground mt-0.5">Jumlah event</p>
            </CardContent>
          </Card>

          <Card className="card-hover">
            <CardHeader className="pb-2">
              <CardTitle className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Hari Ini</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tabular-nums">{todayTransactionsCount}</div>
              <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5"><Calendar className="h-3 w-3" /> Transaksi</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="animate-fade-in-up">
          <CardHeader>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="flex flex-col sm:flex-row gap-3 flex-1 w-full">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Cari transaksi..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" />
                </div>
                <Select value={selectedType} onValueChange={setSelectedType}>
                  <SelectTrigger className="w-full sm:w-[160px]"><SelectValue placeholder="Jenis" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Jenis</SelectItem>
                    <SelectItem value="in">Stok Masuk</SelectItem>
                    <SelectItem value="out">Stok Keluar</SelectItem>
                    <SelectItem value="adjustment">Penyesuaian</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={selectedSource} onValueChange={setSelectedSource}>
                  <SelectTrigger className="w-full sm:w-[160px]"><SelectValue placeholder="Sumber" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Sumber</SelectItem>
                    <SelectItem value="manual">Manual (Dashboard)</SelectItem>
                    <SelectItem value="scanner">Scanner ESP32</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                  <SelectTrigger className="w-full sm:w-[150px]"><SelectValue placeholder="Periode" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Waktu</SelectItem>
                    <SelectItem value="today">Hari Ini</SelectItem>
                    <SelectItem value="week">7 Hari</SelectItem>
                    <SelectItem value="month">30 Hari</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2 w-full sm:w-auto">
                <Button variant="outline" size="sm" onClick={() => exportTransactionsToCSV(filteredTransactions)} disabled={filteredTransactions.length === 0}>
                  <Download className="h-4 w-4 mr-2" />Export
                </Button>
                {writable && <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm"><Plus className="h-4 w-4 mr-2" />Tambah</Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-lg">
                    <DialogHeader>
                      <DialogTitle>Tambah Transaksi</DialogTitle>
                      <DialogDescription>Catat transaksi stok masuk, keluar, atau penyesuaian.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
                      <div className="space-y-2">
                        <Label>Jenis Transaksi</Label>
                        <Select value={formData.type} onValueChange={(value) => setFormData({ ...formData, type: value })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="in">Stok Masuk</SelectItem>
                            <SelectItem value="out">Stok Keluar</SelectItem>
                            <SelectItem value="adjustment">Penyesuaian</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Barcode Produk</Label>
                        <Input placeholder="Scan atau masukkan barcode" value={formData.productBarcode}
                          onChange={(e) => {
                            const barcode = e.target.value;
                            setFormData({ ...formData, productBarcode: barcode });
                            const item = inventory.find(i => i.barcode === barcode);
                            if (item) { setFormData(prev => ({ ...prev, productName: item.name })); }
                            else { setFormData(prev => ({ ...prev, productName: "" })); }
                          }} />
                      </div>
                      <div className="space-y-2">
                        <Label>Nama Produk</Label>
                        <Input placeholder="Nama produk" value={formData.productName} onChange={(e) => setFormData({ ...formData, productName: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <Label>Jumlah</Label>
                        <Input type="number" placeholder="0" value={formData.quantity} onChange={(e) => setFormData({ ...formData, quantity: e.target.value })} />
                      </div>
                      <div className="space-y-2"><Label>Alasan</Label><Input placeholder="Alasan transaksi" value={formData.reason} onChange={(e) => setFormData({ ...formData, reason: e.target.value })} /></div>
                      <div className="space-y-2"><Label>Catatan</Label><Input placeholder="Catatan (opsional)" value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} /></div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setIsAddDialogOpen(false)} disabled={isSaving}>Batal</Button>
                      <Button onClick={handleAddTransaction} disabled={isSaving}>{isSaving ? "Menyimpan..." : "Simpan"}</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>}
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Transactions Table */}
        <Card className="animate-fade-in-up">
          <CardHeader>
            <CardTitle>Riwayat ({filteredTransactions.length})</CardTitle>
            <CardDescription>Daftar transaksi yang telah dilakukan</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {/* Mobile cards */}
            <div className="block sm:hidden divide-y">
              {filteredTransactions.length === 0 ? (
                <div className="text-center py-12 px-4">
                  <FileText className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                  <p className="text-muted-foreground">Tidak ada transaksi</p>
                </div>
              ) : (
                pagedTransactions.map((transaction) => {
                  const qty = displayQty(transaction)
                  return (
                    <div key={transaction.id} className="p-4 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">{transaction.productName || "—"}</p>
                          <p className="text-xs font-mono text-muted-foreground">{transaction.productBarcode || "—"}</p>
                        </div>
                        <span className={`font-semibold text-sm shrink-0 ${qty < 0 ? "text-red-600" : "text-emerald-600"}`}>
                          {qty > 0 ? "+" : ""}{qty}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant={getTypeVariant(transaction.type)}>{getTypeLabel(transaction.type)}</Badge>
                        <Badge variant={isManualSource(transaction) ? "outline" : "secondary"} className="text-[10px]">
                          {isManualSource(transaction) ? "Manual" : "Scanner"}
                        </Badge>
                        <span>{formatDateTime(transaction.timestamp)}</span>
                      </div>
                      <Button variant="outline" size="sm" className="w-full h-9" onClick={() => openViewDialog(transaction)}>
                        <Eye className="h-4 w-4 mr-1" /> Lihat detail
                      </Button>
                    </div>
                  )
                })
              )}
            </div>

            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[150px]">Waktu</TableHead>
                    <TableHead className="w-[100px]">Jenis</TableHead>
                    <TableHead className="w-[200px]">Produk</TableHead>
                    <TableHead className="text-center w-[80px]">Jumlah</TableHead>
                    <TableHead className="w-[100px]">Operator</TableHead>
                    <TableHead className="text-right w-[80px]">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTransactions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-12">
                        <FileText className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                        <p className="text-muted-foreground">Tidak ada transaksi</p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    pagedTransactions.map((transaction) => {
                      const qty = displayQty(transaction)
                      return (
                        <TableRow key={transaction.id}>
                          <TableCell className="text-sm">{formatDateTime(transaction.timestamp)}</TableCell>
                          <TableCell><Badge variant={getTypeVariant(transaction.type)}>{getTypeLabel(transaction.type)}</Badge></TableCell>
                          <TableCell>
                            <div className="font-medium">{transaction.productName}</div>
                            <div className="text-xs text-muted-foreground font-mono">{transaction.productBarcode}</div>
                          </TableCell>
                          <TableCell className="text-center">
                            <span className={qty < 0 ? "text-red-600" : "text-emerald-600"}>
                              {qty > 0 ? "+" : ""}{qty}
                            </span>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            <div className="flex flex-col gap-1">
                              <span>{transaction.operator}</span>
                              <Badge
                                variant={isManualSource(transaction) ? "outline" : "secondary"}
                                className="text-[10px] w-fit"
                              >
                                {isManualSource(transaction) ? "Manual" : "Scanner"}
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="sm" className="h-9 w-9 p-0" onClick={() => openViewDialog(transaction)} aria-label="Lihat detail transaksi">
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      )
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            {filteredTransactions.length > PAGE_SIZE && (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between px-4 py-3 border-t">
                <div className="text-sm text-muted-foreground">
                  Menampilkan {((currentPage - 1) * PAGE_SIZE) + 1}-{Math.min(currentPage * PAGE_SIZE, filteredTransactions.length)} dari {filteredTransactions.length}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    Sebelumnya
                  </Button>
                  <span className="text-sm font-medium">
                    {currentPage} / {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                  >
                    Berikutnya
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* View Dialog */}
        <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Detail Transaksi</DialogTitle></DialogHeader>
            {selectedTransaction && (
              <div className="space-y-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div><Label className="text-xs text-muted-foreground">Jenis</Label><Badge variant={getTypeVariant(selectedTransaction.type)}>{getTypeLabel(selectedTransaction.type)}</Badge></div>
                  <div><Label className="text-xs text-muted-foreground">Waktu</Label><p className="text-sm">{formatDateTime(selectedTransaction.timestamp)}</p></div>
                  <div className="col-span-2"><Label className="text-xs text-muted-foreground">Produk</Label><p className="font-semibold">{selectedTransaction.productName}</p></div>
                  <div><Label className="text-xs text-muted-foreground">Barcode</Label><p className="text-sm font-mono">{selectedTransaction.productBarcode}</p></div>
                  <div><Label className="text-xs text-muted-foreground">Stok Sekarang</Label><p>{getCurrentStock(selectedTransaction.productBarcode)}</p></div>
                  <div><Label className="text-xs text-muted-foreground">Jumlah</Label><p className={`font-semibold ${displayQty(selectedTransaction) < 0 ? "text-red-600" : "text-emerald-600"}`}>{displayQty(selectedTransaction) > 0 ? "+" : ""}{displayQty(selectedTransaction)} unit</p></div>
                  <div className="col-span-2"><Label className="text-xs text-muted-foreground">Alasan</Label><p className="text-sm">{selectedTransaction.reason}</p></div>
                  {selectedTransaction.notes && <div className="col-span-2"><Label className="text-xs text-muted-foreground">Catatan</Label><p className="text-sm">{selectedTransaction.notes}</p></div>}
                </div>
              </div>
            )}
            <DialogFooter><Button variant="outline" onClick={() => setIsViewDialogOpen(false)}>Tutup</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
