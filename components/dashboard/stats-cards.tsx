"use client"

import {
  Package,
  DollarSign,
  AlertCircle,
  Smartphone,
  BatteryFull,
  BatteryMedium,
  BatteryLow,
  BatteryWarning,
} from "lucide-react"
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
  const batteryLevels = devices
    .map((device) => Number(device.batteryLevel))
    .filter((level) => Number.isFinite(level))
    .map((level) => Math.max(0, Math.min(100, Math.round(level))))
  const lowestBatteryLevel = batteryLevels.length > 0 ? Math.min(...batteryLevels) : null
  const BatteryIcon =
    lowestBatteryLevel === null
      ? BatteryWarning
      : lowestBatteryLevel >= 60
        ? BatteryFull
        : lowestBatteryLevel >= 20
          ? BatteryMedium
          : lowestBatteryLevel > 5
            ? BatteryLow
            : BatteryWarning
  const batteryColor =
    lowestBatteryLevel === null
      ? "text-muted-foreground"
      : lowestBatteryLevel >= 60
        ? "text-emerald-600"
        : lowestBatteryLevel >= 20
          ? "text-amber-600"
          : "text-red-600"
  const batteryBadgeClass =
    lowestBatteryLevel === null
      ? "border-border bg-muted/40 text-muted-foreground"
      : lowestBatteryLevel >= 60
        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
        : lowestBatteryLevel >= 20
          ? "border-amber-200 bg-amber-50 text-amber-700"
          : "border-red-200 bg-red-50 text-red-700"
  const batteryLabel = lowestBatteryLevel === null ? "Belum terbaca" : `${lowestBatteryLevel}%`

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
          <div className="flex items-center gap-2">
            <BatteryIcon className={`h-4 w-4 ${batteryColor}`} />
            <Smartphone className={`h-3.5 w-3.5 ${onlineDevices > 0 ? 'text-emerald-500' : 'text-muted-foreground'}`} />
          </div>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <div className="text-3xl font-bold text-foreground">
            {onlineDevices}<span className="text-lg text-muted-foreground font-normal">/{totalDevices}</span>
          </div>
          <div className={`inline-flex min-h-7 items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-semibold ${batteryBadgeClass}`}>
            <BatteryIcon className="h-4 w-4 shrink-0" />
            <span>{batteryLabel}</span>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {onlineDevices > 0 ? 'Device online' : 'Semua offline'}
        </p>
      </div>
    </div>
  )
}
