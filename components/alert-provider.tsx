"use client"

import { useEffect, useRef, useState } from "react"
import { useToast } from "@/hooks/use-toast"
import { useRealtimeDeviceStatus, type DeviceStatus } from "@/hooks/use-realtime-device-status"
import { useFirebaseInventory, useFirebaseTransactions } from "@/hooks/use-firebase"
import { useAuth } from "@/components/auth-provider"
import { firebaseHelpers } from "@/lib/firebase"

interface StockRisk {
  itemId: string
  itemName: string
  currentQuantity: number
  daysToStockout: number | null
  avgDailyConsumption: number
}

export function AlertProvider({ children }: { children: React.ReactNode }) {
  const { role, getIdToken } = useAuth()
  const { toast } = useToast()
  const { devices, loading: devicesLoading } = useRealtimeDeviceStatus()
  const { items: inventory, loading: inventoryLoading } = useFirebaseInventory()
  const { transactions, loading: transactionsLoading } = useFirebaseTransactions(500)
  
  const [stockRisks, setStockRisks] = useState<StockRisk[]>([])
  const stockRisksRef = useRef<StockRisk[]>([])
  const [stockRisksLoading, setStockRisksLoading] = useState(false)

  // Update ref ketika stockRisks berubah
  useEffect(() => {
    stockRisksRef.current = stockRisks
  }, [stockRisks])

  // ============================================================
  // 1. BATTERY LOW ALERT - Monitor device battery levels
  // ============================================================
  useEffect(() => {
    if (devicesLoading || devices.length === 0) return

    const lowBattery = devices.filter(
      (d) => d.status === "online" && d.batteryLevel != null && d.batteryLevel < 20,
    )
    if (lowBattery.length === 0) return

    const today = new Date().toISOString().slice(0, 10)
    if (typeof window !== "undefined") {
      const notifiedIds = new Set(
        (sessionStorage.getItem(`battery-notified-${today}`) || "").split(",").filter(Boolean),
      )
      const newOnes = lowBattery.filter((d) => !notifiedIds.has(d.deviceId))
      if (newOnes.length === 0) return

      newOnes.forEach((d) => {
        toast({
          title: `Baterai rendah: ${d.name || d.deviceId}`,
          description: `Level ${d.batteryLevel}% — segera charge perangkat.`,
          variant: "destructive",
        })
        notifiedIds.add(d.deviceId)
      })
      sessionStorage.setItem(`battery-notified-${today}`, Array.from(notifiedIds).join(","))
    }
  }, [devices, devicesLoading, toast])

  // ============================================================
  // 2. STOCKOUT RISK ALERT - Monitor inventory prediction
  // ============================================================
  useEffect(() => {
    if (inventoryLoading || transactionsLoading) {
      setStockRisksLoading(true)
      return
    }
    if (inventory.length === 0) {
      setStockRisks([])
      setStockRisksLoading(false)
      return
    }

    const controller = new AbortController()
    setStockRisksLoading(true)

    const fetchRisks = async () => {
      try {
        const items = inventory
          .filter(i => !i.deleted && i.barcode)
          .map(i => ({
            id: i.id,
            barcode: i.barcode,
            name: i.name,
            quantity: Number(i.quantity) || 0,
            minStock: Number(i.minStock) || 0,
          }))

        const allTxData = await firebaseHelpers.fetchAllTransactions()
        const txs = (allTxData as Array<Record<string, unknown>>).map(t => ({
          productBarcode: t.productBarcode,
          type: t.type,
          quantity: Number(t.quantity) || 0,
          timestamp: Number(t.timestamp) || Date.now(),
        }))

        const token = await getIdToken()
        const res = await fetch("/api/predict", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            mode: "batch",
            items,
            transactions: txs,
            horizonDays: 14,
            trainRatio: 0.85,
            topN: 3,
            recentDays: 90,
          }),
          signal: controller.signal,
        })

        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        if (data.error) throw new Error(data.error)

        const risks = (data.risks || [])
          .map((r: { itemId: string; predictedLowest: number; daysToStockout: number | null; avgDailyConsumption: number; slope: number }) => {
            const inv = inventory.find(i => i.id === r.itemId)
            if (!inv) return null
            return {
              itemId: r.itemId,
              itemName: inv.name,
              currentQuantity: inv.quantity,
              daysToStockout: r.daysToStockout,
              avgDailyConsumption: r.avgDailyConsumption,
            }
          })
          .filter((r: StockRisk | null): r is StockRisk => r !== null)

        setStockRisks(risks)
      } catch (err) {
        if ((err as Error).name === "AbortError") return
        console.warn("[AlertProvider] batch predict failed:", err)
        setStockRisks([])
      } finally {
        if (!controller.signal.aborted) {
          setStockRisksLoading(false)
        }
      }
    }

    fetchRisks()
    return () => controller.abort()
  }, [getIdToken, inventory, transactions, inventoryLoading, transactionsLoading])

  // Trigger toast untuk stockout risk
  useEffect(() => {
    if (inventoryLoading || transactionsLoading) return
    if (stockRisks.length === 0) return

    const urgent = stockRisks.filter(
      (r) => r.daysToStockout !== null && r.daysToStockout <= 7,
    )
    if (urgent.length === 0) return

    const today = new Date().toISOString().slice(0, 10)
    const notifiedKey = `stockout-notified-${today}`
    if (typeof window !== "undefined") {
      const notified = sessionStorage.getItem(notifiedKey)
      const notifiedIds = notified ? new Set(notified.split(",")) : new Set<string>()
      const newOnes = urgent.filter((r) => !notifiedIds.has(r.itemId))
      if (newOnes.length === 0) return

      newOnes.forEach((r) => {
        toast({
          title: `Stok akan habis: ${r.itemName}`,
          description: `Perkiraan ${r.daysToStockout} hari lagi (tren ${r.avgDailyConsumption.toFixed(2)}/hari). Stok sekarang ${r.currentQuantity}.`,
          variant: "destructive",
        })
        notifiedIds.add(r.itemId)
      })
      sessionStorage.setItem(notifiedKey, Array.from(notifiedIds).join(","))
    }
  }, [stockRisks, inventoryLoading, transactionsLoading, toast])

  // ============================================================
  // 3. AUTO SCANNER TRANSACTION ALERT - Monitor scanner activity
  // ============================================================
  useEffect(() => {
    if (transactionsLoading || transactions.length === 0) return

    const today = new Date().toISOString().slice(0, 10)
    const seenTsKey = `scanner-tx-last-seen-${today}`
    const lastSeen = parseInt(
      (typeof window !== "undefined" ? sessionStorage.getItem(seenTsKey) : null) || "0",
      10
    )

    const scannerTxs = transactions
      .filter((tx) => tx.operator === "Scanner" && typeof tx.timestamp === "number" && tx.timestamp > lastSeen)
      .sort((a, b) => a.timestamp - b.timestamp)

    if (scannerTxs.length === 0) return

    // Toast maksimal 3 transaksi terbaru per batch
    scannerTxs.slice(-3).forEach((tx) => {
      const isIn = tx.type === "in"
      toast({
        title: isIn ? "Barang Masuk (Auto)" : "Barang Keluar (Auto)",
        description: `${tx.productName} — ${isIn ? "+" : ""}${tx.quantity} stok via Scanner`,
        variant: "default",
        duration: 5000,
      })
    })

    const maxTs = Math.max(
      ...transactions
        .filter((tx) => tx.operator === "Scanner" && typeof tx.timestamp === "number")
        .map((tx) => tx.timestamp)
    )
    sessionStorage.setItem(seenTsKey, String(maxTs))
  }, [transactions, transactionsLoading, toast])

  return <>{children}</>
}
