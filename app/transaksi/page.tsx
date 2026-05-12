"use client"

import { useState, useMemo } from "react"
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
import { Plus, Search, Eye, Download, TrendingUp, TrendingDown, Calendar, DollarSign, FileText } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { useFirebaseInventory, useFirebaseTransactions } from "@/hooks/use-firebase"
import { firebaseHelpers } from "@/lib/firebase"

interface Transaction {
  id: string
  type: "in" | "out" | "adjustment"
  productName: string
  productBarcode: string
  quantity: number
  unitPrice: number
  totalAmount: number
  reason: string
  operator: string
  timestamp: string | number
  notes?: string
}

export default function TransaksiPage() {
  const { items: inventory, loading: inventoryLoading, updateItem: updateInventoryItem } = useFirebaseInventory()
  const {
    transactions,
    loading: transactionsLoading,
    error: transactionsError,
  } = useFirebaseTransactions()

  const [searchTerm, setSearchTerm] = useState("")
  const [selectedType, setSelectedType] = useState("all")
  const [selectedPeriod, setSelectedPeriod] = useState("all")
  const [selectedSource, setSelectedSource] = useState("all")
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false)
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null)
  const [formData, setFormData] = useState({
    type: "in",
    productBarcode: "",
    productName: "",
    quantity: "",
    unitPrice: "",
    reason: "",
    notes: "",
  })
  const { toast } = useToast()

  const isManualSource = (t: Transaction) => {
    const op = (t.operator || "").toLowerCase()
    return op === "dashboard" || op === "manual" || op === ""
  }

  const filteredTransactions = useMemo(() => {
    return transactions.filter((transaction) => {
      const matchesSearch =
        transaction.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        transaction.productBarcode.includes(searchTerm) ||
        transaction.operator.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (transaction.reason && transaction.reason.toLowerCase().includes(searchTerm.toLowerCase()))
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

  const handleAddTransaction = async () => {
    if (!formData.productBarcode || !formData.productName || !formData.quantity || !formData.unitPrice || !formData.reason) {
      toast({ title: "Error", description: "Mohon lengkapi semua field wajib.", variant: "destructive" })
      return
    }

    const quantityNum = Number.parseInt(formData.quantity)
    const unitPriceNum = Number.parseFloat(formData.unitPrice)

    if (isNaN(quantityNum) || isNaN(unitPriceNum)) {
      toast({ title: "Error", description: "Jumlah dan harga harus berupa angka.", variant: "destructive" });
      return;
    }

    let finalQuantity = quantityNum;
    let totalAmount = quantityNum * unitPriceNum;

    if (formData.type === "out") {
      finalQuantity = -Math.abs(quantityNum);
      totalAmount = finalQuantity * unitPriceNum;
    } else if (formData.type === "adjustment") {
      totalAmount = finalQuantity * unitPriceNum;
    } else {
      finalQuantity = Math.abs(quantityNum);
      totalAmount = finalQuantity * unitPriceNum;
    }

    const newTransactionData = {
      type: formData.type as "in" | "out" | "adjustment",
      productName: formData.productName,
      productBarcode: formData.productBarcode,
      quantity: finalQuantity,
      unitPrice: unitPriceNum,
      totalAmount: totalAmount,
      reason: formData.reason,
      operator: "Admin",
      notes: formData.notes,
    }

    try {
      await firebaseHelpers.addTransaction(newTransactionData);

      const itemToUpdate = inventory.find(item => item.barcode === formData.productBarcode);
      if (itemToUpdate) {
        const currentStock = itemToUpdate.quantity || 0;
        const newStock = currentStock + finalQuantity;
        await updateInventoryItem(itemToUpdate.id, { quantity: newStock });
        toast({ title: "Berhasil", description: "Transaksi berhasil ditambahkan." });
      } else {
        toast({ title: "Peringatan", description: `Produk dengan barcode ${formData.productBarcode} tidak ditemukan.` });
      }

      setIsAddDialogOpen(false)
      resetForm()
    } catch (error) {
      console.error("Error:", error);
      toast({ title: "Error", description: "Gagal menambahkan transaksi.", variant: "destructive" })
    }
  }

  const resetForm = () => {
    setFormData({ type: "in", productBarcode: "", productName: "", quantity: "", unitPrice: "", reason: "", notes: "" })
  }

  const openViewDialog = (transaction: Transaction) => {
    setSelectedTransaction(transaction)
    setIsViewDialogOpen(true)
  }

  const formatCurrency = (amount: number) => {
    const validAmount = Number(amount) || 0;
    return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(validAmount)
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

  const totalIn = useMemo(() =>
    transactions.filter((t) => t.type === "in").reduce((sum, t) => sum + (Number(t.totalAmount) || 0), 0),
    [transactions]
  );

  const totalOut = useMemo(() =>
    transactions.filter((t) => t.type === "out").reduce((sum, t) => sum + Math.abs(Number(t.totalAmount) || 0), 0),
    [transactions]
  );

  const totalAdjustment = useMemo(() =>
    transactions.filter((t) => t.type === "adjustment").reduce((sum, t) => sum + (Number(t.totalAmount) || 0), 0),
    [transactions]
  );

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
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary border-t-transparent mx-auto mb-4"></div>
          <p className="text-muted-foreground">Memuat data...</p>
        </div>
      </div>
    );
  }

  if (transactionsError) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-destructive text-center">{transactionsError}</CardContent>
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
      const headers = ["ID", "Waktu", "Jenis", "Nama Produk", "Barcode", "Jumlah", "Harga", "Total", "Alasan", "Operator"]
      const csvData = filteredTransactions.map(transaction => [
        transaction.id || '', formatDateTime(transaction.timestamp || ''), getTypeLabel(transaction.type || ''),
        transaction.productName || '', transaction.productBarcode || '', (transaction.quantity || 0).toString(),
        (transaction.unitPrice || 0).toString(), (transaction.totalAmount || 0).toString(),
        transaction.reason || '', transaction.operator || ''
      ])
      const csvContent = [headers.join(","), ...csvData.map(row => row.map(cell => `"${(cell || '').toString().replace(/"/g, '""')}"`).join(","))].join("\n")
      const blob = new Blob(["﻿" + csvContent], { type: "text/csv;charset=utf-8;" })
      const fileName = `transaksi_${new Date().toISOString().split('T')[0]}.csv`
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = fileName; link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      setTimeout(() => { document.body.removeChild(link); window.URL.revokeObjectURL(url); }, 100);
      toast({ title: "Export Berhasil", description: `${filteredTransactions.length} transaksi diekspor.` })
    } catch (error) {
      toast({ title: "Export Gagal", description: "Terjadi kesalahan.", variant: "destructive" })
    }
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3 animate-fade-in-up">
          <div className="p-2 bg-primary/10 rounded-lg">
            <DollarSign className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Riwayat Transaksi</h1>
            <p className="text-sm text-muted-foreground">Kelola dan pantau semua transaksi stok</p>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-in-up">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Masuk</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl sm:text-2xl font-bold text-emerald-600">{formatCurrency(totalIn)}</div>
              <p className="text-xs text-muted-foreground flex items-center gap-1"><TrendingUp className="h-3 w-3" /> Semua waktu</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Keluar</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl sm:text-2xl font-bold text-red-600">{formatCurrency(totalOut)}</div>
              <p className="text-xs text-muted-foreground flex items-center gap-1"><TrendingDown className="h-3 w-3" /> Semua waktu</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Penyesuaian</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl sm:text-2xl font-bold text-amber-600">{formatCurrency(totalAdjustment)}</div>
              <p className="text-xs text-muted-foreground">Total penyesuaian</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Hari Ini</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl sm:text-2xl font-bold">{todayTransactionsCount}</div>
              <p className="text-xs text-muted-foreground flex items-center gap-1"><Calendar className="h-3 w-3" /> Transaksi</p>
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
                <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
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
                            if (item) { setFormData(prev => ({ ...prev, productName: item.name, unitPrice: item.price.toString() })); }
                            else { setFormData(prev => ({ ...prev, productName: "", unitPrice: "" })); }
                          }} />
                      </div>
                      <div className="space-y-2">
                        <Label>Nama Produk</Label>
                        <Input placeholder="Nama produk" value={formData.productName} onChange={(e) => setFormData({ ...formData, productName: e.target.value })} />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2"><Label>Jumlah</Label><Input type="number" placeholder="0" value={formData.quantity} onChange={(e) => setFormData({ ...formData, quantity: e.target.value })} /></div>
                        <div className="space-y-2"><Label>Harga Satuan</Label><Input type="number" placeholder="0" value={formData.unitPrice} onChange={(e) => setFormData({ ...formData, unitPrice: e.target.value })} /></div>
                      </div>
                      <div className="space-y-2"><Label>Alasan</Label><Input placeholder="Alasan transaksi" value={formData.reason} onChange={(e) => setFormData({ ...formData, reason: e.target.value })} /></div>
                      <div className="space-y-2"><Label>Catatan</Label><Input placeholder="Catatan (opsional)" value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} /></div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>Batal</Button>
                      <Button onClick={handleAddTransaction}>Simpan</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Transactions Table */}
        <Card className="animate-fade-in-up">
          <CardHeader>
            <CardTitle>Riwayat Transaksi ({filteredTransactions.length})</CardTitle>
            <CardDescription>Daftar transaksi yang telah dilakukan</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-[150px]">Waktu</TableHead>
                    <TableHead className="w-[100px]">Jenis</TableHead>
                    <TableHead className="w-[200px]">Produk</TableHead>
                    <TableHead className="text-center w-[80px]">Jumlah</TableHead>
                    <TableHead className="text-right w-[130px]">Total</TableHead>
                    <TableHead className="w-[100px]">Operator</TableHead>
                    <TableHead className="text-right w-[80px]">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTransactions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-12">
                        <FileText className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                        <p className="text-muted-foreground">Tidak ada transaksi</p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredTransactions.map((transaction) => (
                      <TableRow key={transaction.id}>
                        <TableCell className="text-sm">{formatDateTime(transaction.timestamp)}</TableCell>
                        <TableCell><Badge variant={getTypeVariant(transaction.type)}>{getTypeLabel(transaction.type)}</Badge></TableCell>
                        <TableCell>
                          <div className="font-medium">{transaction.productName}</div>
                          <div className="text-xs text-muted-foreground font-mono">{transaction.productBarcode}</div>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className={transaction.quantity < 0 ? "text-red-600" : "text-emerald-600"}>
                            {transaction.quantity > 0 ? "+" : ""}{transaction.quantity}
                          </span>
                        </TableCell>
                        <TableCell className={`text-right font-medium ${transaction.totalAmount < 0 ? "text-red-600" : "text-emerald-600"}`}>
                          {formatCurrency(transaction.totalAmount)}
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
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => openViewDialog(transaction)}><Eye className="h-4 w-4" /></Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
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
                  <div><Label className="text-xs text-muted-foreground">Jumlah</Label><p className={`font-semibold ${selectedTransaction.quantity < 0 ? "text-red-600" : "text-emerald-600"}`}>{selectedTransaction.quantity > 0 ? "+" : ""}{selectedTransaction.quantity} unit</p></div>
                  <div><Label className="text-xs text-muted-foreground">Total</Label><p className={`font-semibold ${selectedTransaction.totalAmount < 0 ? "text-red-600" : "text-emerald-600"}`}>{formatCurrency(selectedTransaction.totalAmount)}</p></div>
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