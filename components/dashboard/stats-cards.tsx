"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6 animate-fade-in-up">
      {/* Total Items Card */}
      <Card className="hover:shadow-md transition-shadow">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Item</CardTitle>
            <div className="p-2 bg-primary/10 rounded-lg">
              <Package className="h-4 w-4 text-primary" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="text-2xl sm:text-3xl font-bold text-foreground">{totalItems}</div>
            <p className="text-xs text-muted-foreground">Jenis barang unik</p>
            <div className="w-full bg-muted rounded-full h-1.5">
              <div className="bg-primary h-1.5 rounded-full transition-all" style={{ width: `${Math.min(totalItems * 5, 100)}%` }} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Total Value Card */}
      <Card className="hover:shadow-md transition-shadow">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Nilai</CardTitle>
            <div className="p-2 bg-emerald-500/10 rounded-lg">
              <DollarSign className="h-4 w-4 text-emerald-600" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="text-xl sm:text-2xl lg:text-3xl font-bold text-foreground">
              Rp {totalValue.toLocaleString('id-ID')}
            </div>
            <p className="text-xs text-muted-foreground">Nilai inventory total</p>
            <div className="w-full bg-muted rounded-full h-1.5">
              <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: `${Math.min(totalValue / 1000000, 100)}%` }} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Low Stock Card */}
      <Card className="hover:shadow-md transition-shadow">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground">Stok Rendah</CardTitle>
            <div className={`p-2 rounded-lg ${lowStockItems.length > 0 ? 'bg-amber-500/10' : 'bg-emerald-500/10'}`}>
              <AlertCircle className={`h-4 w-4 ${lowStockItems.length > 0 ? 'text-amber-600' : 'text-emerald-600'}`} />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className={`text-2xl sm:text-3xl font-bold ${lowStockItems.length > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
              {lowStockItems.length}
            </div>
            <p className="text-xs text-muted-foreground">
              {lowStockItems.length > 0 ? 'Item perlu diisi ulang' : 'Semua stok aman'}
            </p>
            {lowStockItems.length > 0 && (
              <div className="flex gap-2 text-xs">
                {criticalItems.length > 0 && (
                  <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full font-medium">
                    Habis: {criticalItems.length}
                  </span>
                )}
                {warningItems.length > 0 && (
                  <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full font-medium">
                    Rendah: {warningItems.length}
                  </span>
                )}
              </div>
            )}
            <div className="w-full bg-muted rounded-full h-1.5">
              <div
                className={`h-1.5 rounded-full transition-all ${lowStockItems.length > 0 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                style={{ width: `${stockHealthPercent}%` }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Device Status Card */}
      <Card className="hover:shadow-md transition-shadow">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground">Status Device</CardTitle>
            <div className={`p-2 rounded-lg ${onlineDevices > 0 ? 'bg-primary/10' : 'bg-muted'}`}>
              <Smartphone className={`h-4 w-4 ${onlineDevices > 0 ? 'text-primary' : 'text-muted-foreground'}`} />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="text-2xl sm:text-3xl font-bold text-foreground">
              {onlineDevices}/{totalDevices}
            </div>
            <p className="text-xs text-muted-foreground">
              {onlineDevices > 0 ? 'Scanner aktif' : 'Semua device offline'}
            </p>
            {onlineDevices > 0 && devices && devices.length > 0 && (
              <div className="text-xs text-muted-foreground space-y-1">
                {devices
                  .filter(device => device.status === 'online')
                  .slice(0, 2)
                  .map((device, index) => (
                    <div key={device.deviceId || index} className="flex items-center justify-between">
                      <span className="truncate">{device.deviceId || 'Unknown'}</span>
                      <div className="flex items-center gap-2 ml-2">
                        {device.batteryLevel != null && (
                          <span className={`text-xs font-medium ${
                            device.batteryLevel >= 60 ? 'text-emerald-600' :
                            device.batteryLevel >= 20 ? 'text-amber-500' : 'text-red-500'
                          }`}>
                            {device.batteryLevel}%
                          </span>
                        )}
                        <span className="text-emerald-600 font-medium">{device.ipAddress || 'N/A'}</span>
                      </div>
                    </div>
                  ))}
                {devices.filter(device => device.status === 'online').length > 2 && (
                  <span className="text-muted-foreground">
                    +{devices.filter(device => device.status === 'online').length - 2} lainnya
                  </span>
                )}
              </div>
            )}
            <div className="w-full bg-muted rounded-full h-1.5">
              <div
                className={`h-1.5 rounded-full transition-all ${onlineDevices > 0 ? 'bg-emerald-500' : 'bg-red-500'}`}
                style={{ width: `${deviceHealthPercent}%` }}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}