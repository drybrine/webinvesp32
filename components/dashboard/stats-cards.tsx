"use client"

import {
  Package,
  AlertCircle,
  Smartphone,
  BatteryFull,
  BatteryMedium,
  BatteryLow,
  BatteryWarning,
} from "lucide-react"
import { InventoryItem } from "@/hooks/use-firebase"
import { DeviceStatus } from "@/hooks/use-realtime-device-status"
import { cn } from "@/lib/utils"

interface StatsCardsProps {
  totalItems: number
  lowStockItems: InventoryItem[]
  onlineDevices: number
  totalDevices: number
  devices: DeviceStatus[]
}

export default function StatsCards({
  totalItems,
  lowStockItems,
  onlineDevices,
  totalDevices,
  devices,
}: StatsCardsProps) {
  const criticalItems = lowStockItems.filter(item => item.quantity === 0)
  const warningItems = lowStockItems.filter(item => item.quantity > 0 && item.quantity <= item.minStock)

  const hasOnlineDevices = onlineDevices > 0
  const batteryLevels = devices
    .filter((device) => device.status === "online")
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
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 stagger-children">
      {/* Total Items */}
      <div className="relative overflow-hidden rounded-lg border border-border/80 bg-card/95 p-4 shadow-sm ring-1 ring-border/30 card-hover">
        <div className="absolute inset-x-0 top-0 h-1 bg-primary/70" />
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Total Item</span>
          <Package className="h-3.5 w-3.5 text-primary/50" />
        </div>
        <div className="text-3xl font-bold text-foreground tabular-nums">{totalItems}</div>
        <p className="text-[11px] text-muted-foreground mt-0.5">Jenis barang unik</p>
      </div>

      {/* Low Stock */}
      <div className={cn(
        "relative overflow-hidden rounded-lg border border-border/80 bg-card/95 p-4 shadow-sm ring-1 ring-border/30 card-hover",
        lowStockItems.length > 0 && "border-amber-200/80 bg-amber-50/50 ring-amber-200/50"
      )}>
        <div className={cn("absolute inset-x-0 top-0 h-1", lowStockItems.length > 0 ? "bg-amber-500" : "bg-muted-foreground/25")} />
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Stok Rendah</span>
          <AlertCircle className={cn("h-3.5 w-3.5", lowStockItems.length > 0 ? "text-amber-500" : "text-muted-foreground")} />
        </div>
        <div className={cn("text-3xl font-bold tabular-nums", lowStockItems.length > 0 ? "text-amber-600" : "text-foreground")}>
          {lowStockItems.length}
        </div>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          {lowStockItems.length > 0 ? `${criticalItems.length} habis · ${warningItems.length} rendah` : 'Semua stok aman'}
        </p>
      </div>

      {/* Device Status */}
      <div className={cn(
        "relative overflow-hidden rounded-lg border border-border/80 bg-card/95 p-4 shadow-sm ring-1 ring-border/30 card-hover",
        hasOnlineDevices && "border-emerald-200/80 bg-emerald-50/40 ring-emerald-200/50"
      )}>
        <div className={cn("absolute inset-x-0 top-0 h-1", hasOnlineDevices ? "bg-emerald-500" : "bg-muted-foreground/25")} />
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Scanner</span>
          <div className="flex items-center gap-1.5">
            {hasOnlineDevices && <BatteryIcon className={cn("h-3.5 w-3.5", batteryColor)} />}
            <Smartphone className={cn("h-3.5 w-3.5", hasOnlineDevices ? "text-emerald-500" : "text-muted-foreground")} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-3xl font-bold text-foreground tabular-nums">
            {onlineDevices}<span className="text-base text-muted-foreground font-normal">/{totalDevices}</span>
          </div>
          {hasOnlineDevices && (
            <div className={cn("inline-flex min-h-6 items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-semibold", batteryBadgeClass)}>
              <BatteryIcon className="h-3.5 w-3.5 shrink-0" />
              <span>{batteryLabel}</span>
            </div>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          {hasOnlineDevices ? 'Device online' : 'Semua offline'}
        </p>
      </div>
    </div>
  )
}
