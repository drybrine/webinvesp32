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
import { StaggerItem } from "./motion-wrapper"

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
  const criticalItems = lowStockItems.filter((item) => item.quantity === 0)
  const warningItems = lowStockItems.filter(
    (item) => item.quantity > 0 && item.quantity <= item.minStock
  )

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
      ? "border-border bg-surface-secondary text-muted"
      : lowestBatteryLevel >= 60
        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
        : lowestBatteryLevel >= 20
          ? "border-amber-200 bg-amber-50 text-amber-700"
          : "border-red-200 bg-red-50 text-red-700"
  const batteryLabel = lowestBatteryLevel === null ? "Belum terbaca" : `${lowestBatteryLevel}%`

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <StaggerItem>
        <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-white p-5 shadow-[0_4px_20px_-8px_rgba(0,0,0,0.08)] card-hover">
          <div className="absolute inset-x-0 top-0 h-1 bg-emerald-500/80" />
          <div className="mb-3 flex items-center justify-between">
            <span className="text-label">Total Item</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50">
              <Package className="h-4 w-4 text-emerald-600" />
            </div>
          </div>
          <div className="stat-value">{totalItems}</div>
          <p className="mt-1 text-xs text-muted-foreground">Jenis barang unik</p>
        </div>
      </StaggerItem>

      <StaggerItem>
        <div
          className={cn(
            "relative overflow-hidden rounded-2xl border bg-white p-5 shadow-[0_4px_20px_-8px_rgba(0,0,0,0.08)] card-hover",
            lowStockItems.length > 0
              ? "border-amber-200/80 bg-amber-50/20"
              : "border-border/60"
          )}
        >
          <div
            className={cn(
              "absolute inset-x-0 top-0 h-1",
              lowStockItems.length > 0 ? "bg-amber-500" : "bg-default"
            )}
          />
          <div className="mb-3 flex items-center justify-between">
            <span className="text-label">Stok Rendah</span>
            <div
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full",
                lowStockItems.length > 0 ? "bg-amber-100" : "bg-default"
              )}
            >
              <AlertCircle
                className={cn(
                  "h-4 w-4",
                  lowStockItems.length > 0 ? "text-amber-600" : "text-muted-foreground"
                )}
              />
            </div>
          </div>
          <div
            className={cn(
              "stat-value",
              lowStockItems.length > 0 ? "text-amber-600" : "text-foreground"
            )}
          >
            {lowStockItems.length}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {lowStockItems.length > 0
              ? `${criticalItems.length} habis · ${warningItems.length} rendah`
              : "Semua stok aman"}
          </p>
        </div>
      </StaggerItem>

      <StaggerItem className="sm:col-span-2 lg:col-span-1">
        <div
          className={cn(
            "relative overflow-hidden rounded-2xl border bg-white p-5 shadow-[0_4px_20px_-8px_rgba(0,0,0,0.08)] card-hover",
            hasOnlineDevices ? "border-emerald-200/80 bg-emerald-50/20" : "border-border/60"
          )}
        >
          <div
            className={cn(
              "absolute inset-x-0 top-0 h-1",
              hasOnlineDevices ? "bg-emerald-500" : "bg-default"
            )}
          />
          <div className="mb-3 flex items-center justify-between">
            <span className="text-label">Scanner</span>
            <div
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full",
                hasOnlineDevices ? "bg-emerald-100" : "bg-default"
              )}
            >
              <Smartphone
                className={cn(
                  "h-4 w-4",
                  hasOnlineDevices ? "text-emerald-600" : "text-muted-foreground"
                )}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="stat-value">
              {onlineDevices}
              <span className="text-base font-normal text-muted-foreground">
                /{totalDevices}
              </span>
            </div>
            {hasOnlineDevices && (
              <div
                className={cn(
                  "inline-flex min-h-6 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                  batteryBadgeClass
                )}
              >
                <BatteryIcon className={cn("h-3.5 w-3.5 shrink-0", batteryColor)} />
                <span>{batteryLabel}</span>
              </div>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {hasOnlineDevices ? "Device online" : "Semua offline"}
          </p>
        </div>
      </StaggerItem>
    </div>
  )
}
