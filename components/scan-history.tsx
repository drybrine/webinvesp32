"use client"

import { useState } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Clock, Search, Filter, Download } from "lucide-react"

interface ScanRecord {
  id: string
  barcode: string
  deviceId: string
  timestamp: any
  processed: boolean
  itemFound?: boolean
  itemId?: string
  location?: string
  productName?: string
}

interface ScanHistoryProps {
  scans: ScanRecord[]
  loading?: boolean
}

export function ScanHistory({ scans, loading = false }: ScanHistoryProps) {
  const [searchTerm, setSearchTerm] = useState("")
  const [filterDevice, setFilterDevice] = useState<string>("all")
  const [filterStatus, setFilterStatus] = useState<string>("all")

  // Get unique device IDs for filter
  const deviceIds = Array.from(new Set(scans.map((scan) => scan.deviceId)))

  // Filter scans based on search and filters
  const filteredScans = scans.filter((scan) => {
    // Search term filter
    const matchesSearch =
      searchTerm === "" ||
      scan.barcode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (scan.productName && scan.productName.toLowerCase().includes(searchTerm.toLowerCase())) ||
      scan.deviceId.toLowerCase().includes(searchTerm.toLowerCase())

    // Device filter
    const matchesDevice = filterDevice === "all" || scan.deviceId === filterDevice

    // Status filter
    const matchesStatus =
      filterStatus === "all" ||
      (filterStatus === "found" && scan.itemFound) ||
      (filterStatus === "notfound" && !scan.itemFound)

    return matchesSearch && matchesDevice && matchesStatus
  })

  // Format date for display
  const formatDate = (timestamp: number | string) => {
    if (!timestamp) return "Unknown"
    const date = new Date(timestamp)
    return date.toLocaleString("id-ID", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
  }

  // Export to CSV
  const exportToCSV = () => {
    // Create CSV content
    const headers = ["Barcode", "Device", "Timestamp", "Status", "Product", "Location"]
    const csvContent = [
      headers.join(","),
      ...filteredScans.map((scan) =>
        [
          scan.barcode,
          scan.deviceId,
          formatDate(scan.timestamp),
          scan.itemFound ? "Found" : "Not Found",
          scan.productName || "",
          scan.location || "",
        ]
          .map((v) => `"${v}"`)
          .join(","),
      ),
    ].join("\n")

    // Create download link
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.setAttribute("href", url)
    link.setAttribute("download", `scan_history_${new Date().toISOString().split("T")[0]}.csv`)
    link.style.visibility = "hidden"
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex-1 w-full sm:max-w-md">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
            <Input
              placeholder="Cari barcode atau produk..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-gray-500" />
            <Select value={filterDevice} onValueChange={setFilterDevice}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter Device" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Device</SelectItem>
                {deviceIds.map((deviceId) => (
                  <SelectItem key={deviceId} value={deviceId}>
                    {deviceId}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Status</SelectItem>
                <SelectItem value="found">Ditemukan</SelectItem>
                <SelectItem value="notfound">Tidak Ditemukan</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button variant="outline" size="icon" onClick={exportToCSV} title="Export to CSV">
            <Download className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Barcode</TableHead>
              <TableHead>Waktu</TableHead>
              <TableHead>Device</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Produk</TableHead>
              <TableHead>Lokasi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8">
                  <div className="flex flex-col items-center justify-center">
                    <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin mb-2"></div>
                    <p className="text-gray-500">Memuat data...</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : filteredScans.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8">
                  <p className="text-gray-500">Tidak ada data pemindaian</p>
                </TableCell>
              </TableRow>
            ) : (
              filteredScans.map((scan) => (
                <TableRow key={scan.id}>
                  <TableCell className="font-mono">{scan.barcode}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      <Clock className="w-4 h-4 text-gray-500" />
                      {formatDate(scan.timestamp)}
                    </div>
                  </TableCell>
                  <TableCell>{scan.deviceId}</TableCell>
                  <TableCell>
                    <Badge variant={scan.itemFound ? "default" : "secondary"}>
                      {scan.itemFound ? "Ditemukan" : "Tidak Ada"}
                    </Badge>
                  </TableCell>
                  <TableCell>{scan.productName || "-"}</TableCell>
                  <TableCell>{scan.location || "-"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
