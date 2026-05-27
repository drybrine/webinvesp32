"use client"

import { Package, DollarSign, AlertCircle, Smartphone } from "lucide-react"
import { InventoryItem } from "@/hooks/use-firebase"
import { DeviceStatus } from "@/hooks/use-realtime-device-status"

interface StatsCardsProps {
  totalItems: number
  totalValue: number
  lowStockItems: InventoryItem[]
  inventory: InventoryItem[]
  onlineDevices: number
  totalDevices: number
  devices: DeviceStatus[]
}

export default function StatsCards({
  totalItems,
  totalValue,
  lowStockItems,
  inventory,
  onlineDevices,
  totalDevices,
  devices,
}: StatsCardsProps) {
  const criticalItems = lowStockItems.filter(item => item.quantity === 0)
  const warningItems = lowStockItems.filter(item => item.quantity > 0 && item.quantity <= item.minStock)

  const stockHealthPercent = inventory.length > 0
    ? Math.round(((inventory.length - lowStockItems.length) / inventory.length) * 100)
    : 100

  const deviceHealthPercent = totalDevices > 0
    ? Math.round((onlineDevices / totalDevices) * 100)
    : 0

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 animate-fade-in-up">
      {/* Total Items */}
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Total Item</span>
          <Package className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
        <div className="text-3xl font-bold text-foreground">{totalItems}</div>
        <p className="text-xs text-muted-foreground mt-1">Jenis barang unik</p>
      </div>

      {/* Total Value */}
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Total Nilai</span>
          <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
        <div className="text-xl font-bold text-foreground leading-tight">
          Rp {totalValue.toLocaleString('id-ID')}
        </div>
        <p className="text-xs text-muted-foreground mt-1">Nilai inventory total</p>
      </div>

      {/* Low Stock */}
      <div className={`rounded-lg border bg-card p-4 ${lowStockItems.length > 0 ? 'border-amber-200' : 'border-border'}`}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Stok Rendah</span>
          <AlertCircle className={`h-3.5 w-3.5 ${lowStockItems.length > 0 ? 'text-amber-500' : 'text-muted-foreground'}`} />
        </div>
        <div className={`text-3xl font-bold ${lowStockItems.length > 0 ? 'text-amber-600' : 'text-foreground'}`}>
          {lowStockItems.length}
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {lowStockItems.length > 0 ? `${criticalItems.length} habis · ${warningItems.length} rendah` : 'Semua stok aman'}
        </p>
      </div>

      {/* Device Status */}
      <div className={`rounded-lg border bg-card p-4 ${onlineDevices > 0 ? 'border-emerald-200' : 'border-border'}`}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Scanner</span>
          <Smartphone className={`h-3.5 w-3.5 ${onlineDevices > 0 ? 'text-emerald-500' : 'text-muted-foreground'}`} />
        </div>
        <div className="text-3xl font-bold text-foreground">{onlineDevices}<span className="text-lg text-muted-foreground font-normal">/{totalDevices}</span></div>
        <p className="text-xs text-muted-foreground mt-1">
          {onlineDevices > 0 ? 'Device online' : 'Semua offline'}
        </p>
      </div>
    </div>
  )
}