"use client"

import { useState, useEffect, useMemo } from "react" // Ditambahkan useMemo
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
import { useFirebaseInventory, useFirebaseTransactions } from "@/hooks/use-firebase" // Diganti
import { firebaseHelpers } from "@/lib/firebase" // Ditambahkan
import { saveAs } from "file-saver";

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
  timestamp: string | number // Bisa string (ISO) atau number (epoch)
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

  const filteredTransactions = useMemo(() => {
    return transactions.filter((transaction) => {
      const matchesSearch =
        transaction.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        transaction.productBarcode.includes(searchTerm) ||
        transaction.operator.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (transaction.reason && transaction.reason.toLowerCase().includes(searchTerm.toLowerCase()))
      const matchesType = selectedType === "all" || transaction.type === selectedType

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
      return matchesSearch && matchesType && matchesPeriod
    })
  }, [transactions, searchTerm, selectedType, selectedPeriod])

  const handleAddTransaction = async () => {
    if (
      !formData.productBarcode ||
      !formData.productName ||
      !formData.quantity ||
      !formData.unitPrice ||
      !formData.reason
    ) {
      toast({
        title: "Error Validasi",
        description: "Mohon lengkapi semua field yang wajib diisi (*).",
        variant: "destructive",
      })
      return
    }

    const quantityNum = Number.parseInt(formData.quantity)
    const unitPriceNum = Number.parseFloat(formData.unitPrice)

    if (isNaN(quantityNum) || isNaN(unitPriceNum)) {
        toast({ title: "Error Input", description: "Jumlah dan Harga Satuan harus berupa angka.", variant: "destructive" });
        return;
    }
    
    let finalQuantity = quantityNum;
    let totalAmount = quantityNum * unitPriceNum;

    if (formData.type === "out") {
      finalQuantity = -Math.abs(quantityNum); // Pastikan negatif
      totalAmount = finalQuantity * unitPriceNum;
    } else if (formData.type === "adjustment") {
      // finalQuantity bisa positif atau negatif sesuai input pengguna
      totalAmount = finalQuantity * unitPriceNum;
    } else { // 'in'
      finalQuantity = Math.abs(quantityNum); // Pastikan positif
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
      operator: "Admin", // Default operator
      notes: formData.notes,
      // timestamp akan diatur oleh serverTimestamp di firebaseHelpers
    }

    try {
      await firebaseHelpers.addTransaction(newTransactionData);

      const itemToUpdate = inventory.find(item => item.barcode === formData.productBarcode);
      if (itemToUpdate) {
        const currentStock = itemToUpdate.quantity || 0;
        const newStock = currentStock + finalQuantity; // finalQuantity sudah memiliki tanda yang benar
        await updateInventoryItem(itemToUpdate.id, { quantity: newStock });
         toast({
          title: "Berhasil",
          description: "Transaksi berhasil ditambahkan dan stok inventaris diperbarui.",
        });
      } else {
         toast({
          title: "Peringatan",
          description: `Produk dengan barcode ${formData.productBarcode} tidak ditemukan. Transaksi dicatat, namun stok tidak diperbarui.`,
          variant: "default", // atau "destructive" jika ini adalah error
        });
      }

      setIsAddDialogOpen(false)
      resetForm()
    } catch (error) {
      console.error("Error adding transaction or updating inventory:", error);
      toast({
        title: "Error",
        description: "Gagal menambahkan transaksi atau memperbarui inventaris.",
        variant: "destructive",
      })
    }
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
    // Handle NaN, undefined, null, or invalid numbers
    const validAmount = Number(amount) || 0;
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(validAmount)
  }

  const formatDateTime = (timestamp: string | number) => {
    if (!timestamp) return "N/A";
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
      case "in": return "Masuk";
      case "out": return "Keluar";
      case "adjustment": return "Penyesuaian";
      default: return type;
    }
  }

  const getTypeVariant = (type: string) => {
    switch (type) {
      case "in": return "default" as const;
      case "out": return "secondary" as const; // Mungkin destructive lebih cocok untuk out?
      case "adjustment": return "destructive" as const; // Atau outline/secondary
      default: return "default" as const;
    }
  }

  const totalIn = useMemo(() => 
    transactions
      .filter((t) => t.type === "in")
      .reduce((sum, t) => sum + (Number(t.totalAmount) || 0), 0), 
    [transactions]
  );
  
  const totalOut = useMemo(() => 
    transactions
      .filter((t) => t.type === "out")
      .reduce((sum, t) => sum + Math.abs(Number(t.totalAmount) || 0), 0), 
    [transactions]
  );
  
  const totalAdjustment = useMemo(() => 
    transactions
      .filter((t) => t.type === "adjustment")
      .reduce((sum, t) => sum + (Number(t.totalAmount) || 0), 0), 
    [transactions]
  );

  const todayTransactionsCount = useMemo(() => {
    const today = new Date();
    return transactions.filter((t) => {
        if (!t.timestamp) return false;
        const transactionDate = new Date(t.timestamp);
        return transactionDate.getDate() === today.getDate() &&
               transactionDate.getMonth() === today.getMonth() &&
               transactionDate.getFullYear() === today.getFullYear();
    }).length;
  }, [transactions]);


  const getCurrentStock = (barcode: string) => {
    const item = inventory.find((i) => i.barcode === barcode)
    return item ? item.quantity : "N/A"
  }
  
  if (inventoryLoading || transactionsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        <p className="ml-4 text-gray-600">Memuat data...</p>
      </div>
    );
  }

  if (transactionsError) {
    return <div className="p-4 text-red-500">Error memuat transaksi: {transactionsError}</div>;
  }
  
  const exportTransactionsToCSV = (filteredTransactions: Transaction[]) => {
    if (filteredTransactions.length === 0) {
      toast({
        title: "Tidak Ada Data",
        description: "Tidak ada transaksi untuk diekspor.",
        variant: "destructive",
      })
      return
    }

    const headers = [
      "ID Transaksi",
      "Waktu",
      "Jenis",
      "Nama Produk",
      "Barcode",
      "Jumlah",
      "Harga Satuan",
      "Total",
      "Alasan",
      "Operator",
      "Catatan"
    ]

    const csvData = filteredTransactions.map(transaction => [
      transaction.id,
      formatDateTime(transaction.timestamp),
      getTypeLabel(transaction.type),
      transaction.productName,
      transaction.productBarcode,
      transaction.quantity.toString(),
      transaction.unitPrice.toString(),
      transaction.totalAmount.toString(),
      transaction.reason,
      transaction.operator,
      transaction.notes || ""
    ])

    const csvContent = [
      headers.join(","),
      ...csvData.map(row => 
        row.map(cell => `"${cell.toString().replace(/"/g, '""')}"`).join(",")
      )
    ].join("\n")

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const fileName = `transaksi_${new Date().toISOString().split('T')[0]}.csv`
    
    saveAs(blob, fileName)
    
    toast({
      title: "Export Berhasil",
      description: `${filteredTransactions.length} transaksi berhasil diekspor ke ${fileName}`,
    })
  }
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Modern Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 rounded-xl bg-gradient-to-r from-emerald-500 to-blue-600 text-white shadow-lg">
              <DollarSign className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-transparent">
                Riwayat Transaksi
              </h1>
              <p className="text-gray-600 mt-1">Kelola dan pantau semua transaksi stok</p>
            </div>
          </div>
        </div>

        {/* Modern Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card className="glass-card border-emerald-200/50 hover:shadow-xl transition-all duration-300 group">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-700">Total Masuk</CardTitle>
              <div className="p-2 rounded-lg bg-gradient-to-r from-emerald-500 to-green-600 group-hover:scale-110 transition-transform duration-300">
                <TrendingUp className="h-4 w-4 text-white" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold bg-gradient-to-r from-emerald-600 to-green-600 bg-clip-text text-transparent">
                {formatCurrency(totalIn)}
              </div>
              <p className="text-xs text-gray-500 mt-1">↗ 12% dari bulan lalu</p>
            </CardContent>
          </Card>
          
          <Card className="glass-card border-red-200/50 hover:shadow-xl transition-all duration-300 group">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-700">Total Keluar</CardTitle>
              <div className="p-2 rounded-lg bg-gradient-to-r from-red-500 to-pink-600 group-hover:scale-110 transition-transform duration-300">
                <TrendingDown className="h-4 w-4 text-white" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold bg-gradient-to-r from-red-600 to-pink-600 bg-clip-text text-transparent">
                {formatCurrency(totalOut)}
              </div>
              <p className="text-xs text-gray-500 mt-1">↘ 8% dari bulan lalu</p>
            </CardContent>
          </Card>
          
          <Card className="glass-card border-amber-200/50 hover:shadow-xl transition-all duration-300 group">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-700">Total Penyesuaian</CardTitle>
              <div className="p-2 rounded-lg bg-gradient-to-r from-amber-500 to-orange-600 group-hover:scale-110 transition-transform duration-300">
                <DollarSign className="h-4 w-4 text-white" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold bg-gradient-to-r from-amber-600 to-orange-600 bg-clip-text text-transparent">
                {formatCurrency(totalAdjustment)}
              </div>
              <p className="text-xs text-gray-500 mt-1">± 3% dari bulan lalu</p>
            </CardContent>
          </Card>
          
          <Card className="glass-card border-blue-200/50 hover:shadow-xl transition-all duration-300 group">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-700">Transaksi Hari Ini</CardTitle>
              <div className="p-2 rounded-lg bg-gradient-to-r from-blue-500 to-indigo-600 group-hover:scale-110 transition-transform duration-300">
                <Calendar className="h-4 w-4 text-white" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                {todayTransactionsCount}
              </div>
              <p className="text-xs text-gray-500 mt-1">📈 +5 dari kemarin</p>
            </CardContent>
          </Card>
        </div>

        {/* Modern Filters and Actions */}
        <Card className="glass-card mb-6 border-gray-200/50">
          <CardHeader>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="flex flex-col sm:flex-row gap-4 flex-1">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-600 dark:text-gray-300 h-4 w-4" />
                  <Input
                    placeholder="Cari transaksi..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 modern-input"
                  />
                </div>
                <Select value={selectedType} onValueChange={setSelectedType}>
                  <SelectTrigger className="w-full sm:w-[180px] modern-input">
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
                  <SelectTrigger className="w-full sm:w-[150px] modern-input">
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
                  className="flex-1 sm:flex-initial modern-button bg-white hover:bg-gray-50"
                  disabled={filteredTransactions.length === 0}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </Button>
                <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="flex-1 sm:flex-initial modern-button-primary">
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
                          onChange={(e) => {
                            const barcode = e.target.value;
                            setFormData({ ...formData, productBarcode: barcode });
                            const item = inventory.find(i => i.barcode === barcode);
                            if (item) {
                              setFormData(prev => ({ ...prev, productName: item.name, unitPrice: item.price.toString() }));
                            } else {
                               setFormData(prev => ({ ...prev, productName: "", unitPrice: "" }));
                            }
                          }}
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
                          // readOnly={!!inventory.find(i => i.barcode === formData.productBarcode)} // Optional: make readOnly if barcode found
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
                            // readOnly={!!inventory.find(i => i.barcode === formData.productBarcode)} // Optional
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

        {/* Modern Transactions Table */}
        <Card className="glass-card border-gray-200/50">
          <CardHeader className="border-b border-gray-100">
            <CardTitle className="text-lg font-semibold text-gray-900">
              Riwayat Transaksi ({filteredTransactions.length})
            </CardTitle>
            <CardDescription>
              Daftar transaksi yang telah dilakukan
            </CardDescription>
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
                        <TableCell colSpan={8} className="text-center py-12">
                          <div className="flex flex-col items-center gap-3">
                            <div className="p-4 rounded-full bg-gray-100">
                              <FileText className="h-8 w-8 text-gray-600 dark:text-gray-300" />
                            </div>
                            <div>
                              <p className="text-gray-900 font-medium">Tidak ada transaksi</p>
                              <p className="text-gray-500 text-sm">Tidak ada transaksi yang sesuai dengan filter yang dipilih</p>
                            </div>
                          </div>
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