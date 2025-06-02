"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card" //
import { Button } from "@/components/ui/button" //
import { Input } from "@/components/ui/input" //
import { Label } from "@/components/ui/label" //
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select" //
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog" //
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table" //
import { Badge } from "@/components/ui/badge" //
import { Plus, Search, Eye, Download, TrendingUp, TrendingDown, Calendar, DollarSign } from "lucide-react" //
import { useToast } from "@/hooks/use-toast" //
import { useFirebaseInventory } from "@/hooks/use-firebase" //
import { saveAs } from "file-saver"; //

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
  timestamp: string
  notes?: string
}

export default function TransaksiPage() {
  // Ambil data inventaris secara realtime
  const { items: inventory, loading: inventoryLoading } = useFirebaseInventory() //

  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedType, setSelectedType] = useState("all")
  const [selectedPeriod, setSelectedPeriod] = useState("all")
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
  const { toast } = useToast() //

  // Data transaksi akan dikelola secara lokal atau dari database di masa mendatang.
  // Untuk saat ini, kita mulai dengan daftar transaksi kosong.
  useEffect(() => {
    // Hapus data mock, biarkan kosong atau implementasikan pengambilan data dari Firebase
    setTransactions([]);
    // Jika Anda memiliki fungsi untuk mengambil data transaksi dari Firebase, panggil di sini.
    // Contoh: fetchTransactionsFromFirebase().then(data => setTransactions(data));
  }, [])

  const filteredTransactions = transactions.filter((transaction) => {
    const matchesSearch =
      transaction.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      transaction.productBarcode.includes(searchTerm) ||
      transaction.operator.toLowerCase().includes(searchTerm.toLowerCase()) ||
      transaction.reason.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesType = selectedType === "all" || transaction.type === selectedType

    let matchesPeriod = true
    if (selectedPeriod !== "all") {
      const transactionDate = new Date(transaction.timestamp)
      const now = new Date()
      const daysDiff = Math.floor((now.getTime() - transactionDate.getTime()) / (1000 * 60 * 60 * 24))

      switch (selectedPeriod) {
        case "today":
          matchesPeriod = daysDiff === 0
          break
        case "week":
          matchesPeriod = daysDiff <= 7
          break
        case "month":
          matchesPeriod = daysDiff <= 30
          break
      }
    }

    return matchesSearch && matchesType && matchesPeriod
  })

  const handleAddTransaction = () => {
    if (
      !formData.productBarcode ||
      !formData.productName ||
      !formData.quantity ||
      !formData.unitPrice ||
      !formData.reason
    ) {
      toast({
        title: "Error",
        description: "Mohon lengkapi semua field yang wajib diisi",
        variant: "destructive",
      })
      return
    }

    const quantity = Number.parseInt(formData.quantity)
    const unitPrice = Number.parseFloat(formData.unitPrice)
    const totalAmount =
      formData.type === "out" || formData.type === "adjustment" ? -(quantity * unitPrice) : quantity * unitPrice

    const newTransaction: Transaction = {
      id: Date.now().toString(),
      type: formData.type as "in" | "out" | "adjustment",
      productName: formData.productName,
      productBarcode: formData.productBarcode,
      quantity: formData.type === "out" || formData.type === "adjustment" ? -quantity : quantity,
      unitPrice,
      totalAmount,
      reason: formData.reason,
      operator: "Admin", // In real app, get from auth
      timestamp: new Date().toISOString(),
      notes: formData.notes,
    }

    // TODO: Idealnya, simpan transaksi ini ke Firebase atau backend Anda
    // Untuk saat ini, hanya menambah ke state lokal
    setTransactions([newTransaction, ...transactions])
    setIsAddDialogOpen(false)
    resetForm()
    toast({
      title: "Berhasil",
      description: "Transaksi berhasil ditambahkan",
    })
  }

  const resetForm = () => {
    setFormData({
      type: "in",
      productBarcode: "",
      productName: "",
      quantity: "",
      unitPrice: "",
      reason: "",
      notes: "",
    })
  }

  const openViewDialog = (transaction: Transaction) => {
    setSelectedTransaction(transaction)
    setIsViewDialogOpen(true)
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
    }).format(amount)
  }

  const formatDateTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleString("id-ID", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  const getTypeLabel = (type: string) => {
    switch (type) {
      case "in":
        return "Masuk"
      case "out":
        return "Keluar"
      case "adjustment":
        return "Penyesuaian"
      default:
        return type
    }
  }

  const getTypeVariant = (type: string) => {
    switch (type) {
      case "in":
        return "default" as const
      case "out":
        return "secondary" as const
      case "adjustment":
        return "destructive" as const
      default:
        return "default" as const
    }
  }

  // Calculate statistics
  const totalIn = transactions.filter((t) => t.type === "in").reduce((sum, t) => sum + t.totalAmount, 0) //

  const totalOut = transactions.filter((t) => t.type === "out").reduce((sum, t) => sum + Math.abs(t.totalAmount), 0) //

  const totalAdjustment = transactions
    .filter((t) => t.type === "adjustment")
    .reduce((sum, t) => sum + Math.abs(t.totalAmount), 0) //

  const todayTransactions = transactions.filter((t) => {
    const transactionDate = new Date(t.timestamp)
    const today = new Date()
    return transactionDate.toDateString() === today.toDateString()
  }).length //

  const getCurrentStock = (barcode: string) => {
    const item = inventory.find((i) => i.barcode === barcode)
    return item ? item.quantity : "-"
  }

  function exportTransactionsToCSV(transactions: Transaction[]) {
    if (!transactions.length) return

    const header = [
      "ID",
      "Jenis",
      "Nama Produk",
      "Barcode",
      "Jumlah",
      "Harga Satuan",
      "Total",
      "Alasan",
      "Operator",
      "Waktu",
      "Catatan",
    ]
    const rows = transactions.map((t) => [
      t.id,
      t.type,
      t.productName,
      t.productBarcode,
      t.quantity,
      t.unitPrice,
      t.totalAmount,
      t.reason,
      t.operator,
      t.timestamp,
      t.notes ?? "",
    ])

    const csvContent =
      [header, ...rows]
        .map((row) => row.map((field) => `"${String(field).replace(/"/g, '""')}"`).join(","))
        .join("\r\n")

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    saveAs(blob, `transaksi-${new Date().toISOString().slice(0, 10)}.csv`) //
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Riwayat Transaksi</h1>
          <p className="text-gray-600 mt-2">Kelola dan pantau semua transaksi stok</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Masuk</CardTitle>
              <TrendingUp className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{formatCurrency(totalIn)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Keluar</CardTitle>
              <TrendingDown className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{formatCurrency(totalOut)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Penyesuaian</CardTitle>
              <DollarSign className="h-4 w-4 text-orange-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">{formatCurrency(totalAdjustment)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Transaksi Hari Ini</CardTitle>
              <Calendar className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{todayTransactions}</div>
            </CardContent>
          </Card>
        </div>

        {/* Filters and Actions */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="flex flex-col sm:flex-row gap-4 flex-1">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                  <Input
                    placeholder="Cari transaksi..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Select value={selectedType} onValueChange={setSelectedType}>
                  <SelectTrigger className="w-full sm:w-[180px]">
                    <SelectValue placeholder="Jenis Transaksi" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Jenis</SelectItem>
                    <SelectItem value="in">Stok Masuk</SelectItem>
                    <SelectItem value="out">Stok Keluar</SelectItem>
                    <SelectItem value="adjustment">Penyesuaian</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                  <SelectTrigger className="w-full sm:w-[150px]">
                    <SelectValue placeholder="Periode" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Waktu</SelectItem>
                    <SelectItem value="today">Hari Ini</SelectItem>
                    <SelectItem value="week">7 Hari Terakhir</SelectItem>
                    <SelectItem value="month">30 Hari Terakhir</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2 w-full sm:w-auto">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => exportTransactionsToCSV(filteredTransactions)}
                  className="flex-1 sm:flex-initial"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </Button>
                <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="flex-1 sm:flex-initial">
                      <Plus className="h-4 w-4 mr-2" />
                      Tambah Transaksi
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-lg">
                    <DialogHeader>
                      <DialogTitle>Tambah Transaksi Baru</DialogTitle>
                      <DialogDescription>Catat transaksi stok masuk, keluar, atau penyesuaian</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto pr-2">
                      <div className="space-y-2">
                        <Label htmlFor="type">Jenis Transaksi *</Label>
                        <Select
                          value={formData.type}
                          onValueChange={(value) => setFormData({ ...formData, type: value })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="in">Stok Masuk</SelectItem>
                            <SelectItem value="out">Stok Keluar</SelectItem>
                            <SelectItem value="adjustment">Penyesuaian</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="productBarcode">Barcode Produk *</Label>
                        <Input
                          id="productBarcode"
                          value={formData.productBarcode}
                          onChange={(e) => setFormData({ ...formData, productBarcode: e.target.value })}
                          placeholder="Scan atau masukkan barcode"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="productName">Nama Produk *</Label>
                        <Input
                          id="productName"
                          value={formData.productName}
                          onChange={(e) => setFormData({ ...formData, productName: e.target.value })}
                          placeholder="Masukkan nama produk"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="quantity">Jumlah *</Label>
                          <Input
                            id="quantity"
                            type="number"
                            value={formData.quantity}
                            onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                            placeholder="0"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="unitPrice">Harga Satuan *</Label>
                          <Input
                            id="unitPrice"
                            type="number"
                            value={formData.unitPrice}
                            onChange={(e) => setFormData({ ...formData, unitPrice: e.target.value })}
                            placeholder="0"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="reason">Alasan *</Label>
                        <Input
                          id="reason"
                          value={formData.reason}
                          onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                          placeholder="Masukkan alasan transaksi"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="notes">Catatan</Label>
                        <Input
                          id="notes"
                          value={formData.notes}
                          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                          placeholder="Catatan tambahan (opsional)"
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                        Batal
                      </Button>
                      <Button onClick={handleAddTransaction}>Tambah Transaksi</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Transactions Table */}
        <Card>
          <CardHeader>
            <CardTitle>Riwayat Transaksi ({filteredTransactions.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[150px]">Waktu</TableHead>
                    <TableHead className="min-w-[120px]">Jenis</TableHead>
                    <TableHead className="min-w-[200px]">Produk</TableHead>
                    <TableHead className="text-center min-w-[80px]">Jumlah</TableHead>
                    <TableHead className="text-right min-w-[150px]">Total</TableHead>
                    <TableHead className="min-w-[100px]">Operator</TableHead>
                    <TableHead className="text-center min-w-[100px]">Stok Saat Ini</TableHead>
                    <TableHead className="text-right min-w-[80px]">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTransactions.length === 0 ? (
                     <TableRow>
                        <TableCell colSpan={8} className="text-center py-8">
                           <p className="text-gray-500">Tidak ada transaksi yang sesuai dengan filter.</p>
                        </TableCell>
                     </TableRow>
                  ) : (
                    filteredTransactions.map((transaction) => (
                      <TableRow key={transaction.id}>
                        <TableCell>
                          <div className="text-sm">{formatDateTime(transaction.timestamp)}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={getTypeVariant(transaction.type)}>{getTypeLabel(transaction.type)}</Badge>
                        </TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{transaction.productName}</div>
                            <div className="text-sm text-gray-500 font-mono">{transaction.productBarcode}</div>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className={transaction.quantity < 0 ? "text-red-600" : "text-green-600"}>
                            {transaction.quantity > 0 ? "+" : ""}
                            {transaction.quantity}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={transaction.totalAmount < 0 ? "text-red-600" : "text-green-600"}>
                            {formatCurrency(transaction.totalAmount)}
                          </span>
                        </TableCell>
                        <TableCell>{transaction.operator}</TableCell>
                        <TableCell className="text-center">
                          {getCurrentStock(transaction.productBarcode)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" onClick={() => openViewDialog(transaction)}>
                            <Eye className="h-4 w-4" />
                          </Button>
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
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Detail Transaksi</DialogTitle>
            </DialogHeader>
            {selectedTransaction && (
              <div className="space-y-4 py-4 max-h-[70vh] overflow-y-auto pr-2">
                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-medium text-gray-500">ID Transaksi</Label>
                    <p className="text-sm font-mono">{selectedTransaction.id}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-medium text-gray-500">Jenis</Label>
                    <Badge variant={getTypeVariant(selectedTransaction.type)}>
                      {getTypeLabel(selectedTransaction.type)}
                    </Badge>
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs font-medium text-gray-500">Produk</Label>
                    <p className="text-sm font-semibold">{selectedTransaction.productName}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-medium text-gray-500">Barcode</Label>
                    <p className="text-sm font-mono">{selectedTransaction.productBarcode}</p>
                  </div>
                   <div className="space-y-1">
                    <Label className="text-xs font-medium text-gray-500">Waktu Transaksi</Label>
                    <p className="text-sm">{formatDateTime(selectedTransaction.timestamp)}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-medium text-gray-500">Jumlah</Label>
                    <p
                      className={`text-sm font-semibold ${selectedTransaction.quantity < 0 ? "text-red-600" : "text-green-600"}`}
                    >
                      {selectedTransaction.quantity > 0 ? "+" : ""}
                      {selectedTransaction.quantity} unit
                    </p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-medium text-gray-500">Harga Satuan</Label>
                    <p className="text-sm">{formatCurrency(selectedTransaction.unitPrice)}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-medium text-gray-500">Total</Label>
                    <p
                      className={`text-sm font-semibold ${selectedTransaction.totalAmount < 0 ? "text-red-600" : "text-green-600"}`}
                    >
                      {formatCurrency(selectedTransaction.totalAmount)}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-medium text-gray-500">Operator</Label>
                    <p className="text-sm">{selectedTransaction.operator}</p>
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs font-medium text-gray-500">Alasan</Label>
                    <p className="text-sm">{selectedTransaction.reason}</p>
                  </div>
                  {selectedTransaction.notes && (
                    <div className="col-span-2 space-y-1">
                      <Label className="text-xs font-medium text-gray-500">Catatan</Label>
                      <p className="text-sm">{selectedTransaction.notes}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsViewDialogOpen(false)}>
                Tutup
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}