"use client"

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react"
import { useToast } from "@/hooks/use-toast"
import { useRealtimeDeviceStatus } from "@/hooks/use-realtime-device-status"
import { useFirebaseInventory, useFirebaseTransactions } from "@/hooks/use-firebase"
import { useAuth } from "@/components/auth-provider"
import { firebaseHelpers } from "@/lib/firebase"
import {
  buildConsumptionFromTransactions,
  predictStock,
} from "@/lib/stock-prediction"

interface StockRisk {
  itemId: string
  itemName: string
  currentQuantity: number
  daysToStockout: number | null
  avgDailyConsumption: number
}

// Raw prediction batch result shared across consumers
export interface PredictionBatchItem {
  itemId: string
  predictedLowest: number
  daysToStockout: number | null
  avgDailyConsumption: number
  slope: number
  forecast: Array<{ timestamp: number; predictedQuantity: number; estimatedConsumption: number }>
}

interface PredictionContextValue {
  risks: PredictionBatchItem[]
  loading: boolean
}

const PredictionContext = createContext<PredictionContextValue>({ risks: [], loading: false })
export const usePredictionContext = () => useContext(PredictionContext)

const PREDICTION_HORIZON_DAYS = 14
const PREDICTION_TRAIN_RATIO = 0.85
const PREDICTION_TOP_N = 3
const PREDICTION_RECENT_DAYS = 90

function isScannerOperator(operator: unknown): boolean {
  if (typeof operator !== "string") return false
  const value = operator.trim().toLowerCase()
  return value === "scanner" || value === "esp32 scanner" || value.includes("scanner")
}

function toTimestamp(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value)
  return Number.isFinite(n) ? n : 0
}

function buildClientBatchRisks(
  items: Array<{ id: string; barcode?: string; name: string; quantity: number; minStock?: number; deleted?: boolean }>,
  transactions: Array<{ productBarcode: unknown; timestamp: number; quantity: number; type?: string }>,
): PredictionBatchItem[] {
  const txByBarcode = new Map<string, typeof transactions>()
  for (const tx of transactions) {
    if (typeof tx.productBarcode !== "string" || tx.productBarcode.length === 0) continue
    const existing = txByBarcode.get(tx.productBarcode) ?? []
    existing.push(tx)
    txByBarcode.set(tx.productBarcode, existing)
  }

  const risks: PredictionBatchItem[] = []
  for (const item of items) {
    if (!item.barcode || item.deleted) continue
    const itemTx = txByBarcode.get(item.barcode) ?? []
    const currentStock = Number(item.quantity) || 0
    const consumptionData = buildConsumptionFromTransactions(
      itemTx.map((tx) => ({
        timestamp: toTimestamp(tx.timestamp),
        quantity: Number(tx.quantity) || 0,
        type: tx.type as "in" | "out" | "adjustment" | undefined,
      })),
    )
    if (consumptionData.length < 2) continue

    try {
      const result = predictStock(consumptionData, currentStock, {
        horizonDays: PREDICTION_HORIZON_DAYS,
        trainRatio: PREDICTION_TRAIN_RATIO,
      })
      const predictedLowest = Math.min(...result.forecast.map((point) => point.predictedQuantity))
      const stockoutIndex = result.forecast.findIndex((point) => point.predictedQuantity <= 0)
      let daysToStockout: number | null = stockoutIndex === -1 ? null : stockoutIndex + 1
      // Mirror server: extrapolate beyond horizon when b > 0
      if (daysToStockout === null) {
        const avgDaily = result.model.avgDailyConsumption
        if (avgDaily > 0 && currentStock > 0) {
          daysToStockout = Math.ceil(currentStock / avgDaily)
        }
      }

      risks.push({
        itemId: item.id,
        predictedLowest,
        daysToStockout,
        avgDailyConsumption: result.model.avgDailyConsumption,
        slope: result.model.slope,
        forecast: result.forecast,
      })
    } catch {
      // skip item
    }
  }

  risks.sort((a, b) => {
    if (a.daysToStockout != null && b.daysToStockout != null) return a.daysToStockout - b.daysToStockout
    if (a.daysToStockout != null) return -1
    if (b.daysToStockout != null) return 1
    return a.predictedLowest - b.predictedLowest
  })

  return risks.slice(0, PREDICTION_TOP_N)
}

export function AlertProvider({ children }: { children: React.ReactNode }) {
  const { getIdToken } = useAuth()
  const { toast } = useToast()
  const { devices, loading: devicesLoading } = useRealtimeDeviceStatus()
  const { items: inventory, loading: inventoryLoading } = useFirebaseInventory()
  // Cukup 500 terbaru untuk toast scanner; prediksi batch pakai fetchAllTransactions(90)
  const { transactions, loading: transactionsLoading } = useFirebaseTransactions(500)

  const [stockRisks, setStockRisks] = useState<StockRisk[]>([])
  const [predictionRisks, setPredictionRisks] = useState<PredictionBatchItem[]>([])
  const [predictionLoading, setPredictionLoading] = useState(false)

  // Signature stok inventory — re-fetch prediksi hanya saat qty/minStock berubah, bukan tiap TX event
  const inventorySignature = useMemo(() => {
    return inventory
      .filter((i) => !i.deleted && i.barcode)
      .map((i) => `${i.id}:${i.quantity}:${i.minStock ?? 0}:${i.barcode}`)
      .sort()
      .join("|")
  }, [inventory])

  // ============================================================
  // 1. BATTERY LOW ALERT
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
  // 2. STOCKOUT RISK + DASHBOARD PREDICTION SUMMARY
  // ============================================================
  useEffect(() => {
    if (inventoryLoading) {
      setPredictionLoading(true)
      return
    }

    const activeItems = inventory.filter((i) => !i.deleted && i.barcode)
    if (activeItems.length === 0) {
      setStockRisks([])
      setPredictionRisks([])
      setPredictionLoading(false)
      return
    }

    const controller = new AbortController()
    setPredictionLoading(true)

    const applyRisks = (rawRisks: PredictionBatchItem[]) => {
      setPredictionRisks(rawRisks)
      const risks = rawRisks
        .map((r) => {
          const inv = inventory.find((i) => i.id === r.itemId)
          if (!inv) return null
          return {
            itemId: r.itemId,
            itemName: inv.name,
            currentQuantity: Number(inv.quantity) || 0,
            daysToStockout: r.daysToStockout,
            avgDailyConsumption: Number(r.avgDailyConsumption) || 0,
          }
        })
        .filter((r): r is StockRisk => r !== null)
      setStockRisks(risks)
    }

    const fetchRisks = async () => {
      try {
        const items = activeItems.map((i) => ({
          id: i.id,
          barcode: i.barcode,
          name: i.name,
          quantity: Number(i.quantity) || 0,
          minStock: Number(i.minStock) || 0,
        }))

        const allTxData = await firebaseHelpers.fetchAllTransactions(PREDICTION_RECENT_DAYS)
        const txs = (allTxData as Array<Record<string, unknown>>).map((t) => ({
          productBarcode: t.productBarcode,
          type: t.type as string | undefined,
          quantity: Number(t.quantity) || 0,
          timestamp: toTimestamp(t.timestamp),
        }))

        let rawRisks: PredictionBatchItem[] = []
        try {
          const token = await getIdToken()
          if (!token) throw new Error("Token kosong")

          const res = await fetch("/api/predict", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              mode: "batch",
              items,
              transactions: txs,
              horizonDays: PREDICTION_HORIZON_DAYS,
              trainRatio: PREDICTION_TRAIN_RATIO,
              topN: PREDICTION_TOP_N,
              recentDays: PREDICTION_RECENT_DAYS,
            }),
            signal: controller.signal,
          })

          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          const data = await res.json()
          if (data.error) throw new Error(data.error)
          rawRisks = (data.risks || []) as PredictionBatchItem[]
        } catch (serverErr) {
          if ((serverErr as Error).name === "AbortError") return
          console.warn("[AlertProvider] batch predict server failed, using client fallback:", serverErr)
          rawRisks = buildClientBatchRisks(activeItems, txs)
        }

        if (controller.signal.aborted) return
        applyRisks(rawRisks)
      } catch (err) {
        if ((err as Error).name === "AbortError") return
        console.warn("[AlertProvider] batch predict failed:", err)
        // Last resort: client-only from empty tx list still clears UI honestly
        setStockRisks([])
        setPredictionRisks([])
      } finally {
        if (!controller.signal.aborted) {
          setPredictionLoading(false)
        }
      }
    }

    fetchRisks()
    return () => controller.abort()
    // Jangan depend ke array `transactions` realtime — tiap scan membatalkan request prediksi.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- inventorySignature covers stock changes
  }, [getIdToken, inventoryLoading, inventorySignature])

  // Toast stockout risk (session-deduped)
  useEffect(() => {
    if (inventoryLoading || predictionLoading) return
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
  }, [stockRisks, inventoryLoading, predictionLoading, toast])

  // ============================================================
  // 3. AUTO SCANNER TRANSACTION ALERT
  // ============================================================
  const scannerBootstrapRef = useRef(false)

  useEffect(() => {
    if (transactionsLoading) return
    if (typeof window === "undefined") return

    const today = new Date().toISOString().slice(0, 10)
    const seenTsKey = `scanner-tx-last-seen-${today}`

    // Normalize timestamps (Firebase kadang string)
    const normalized = transactions
      .map((tx) => ({
        ...tx,
        timestamp: toTimestamp(tx.timestamp),
        operator: tx.operator,
      }))
      .filter((tx) => tx.timestamp > 0)

    const scannerAll = normalized
      .filter((tx) => isScannerOperator(tx.operator))
      .sort((a, b) => a.timestamp - b.timestamp)

    // Bootstrap sekali per session/hari: set watermark ke max existing tanpa spam toast historis
    if (!scannerBootstrapRef.current) {
      scannerBootstrapRef.current = true
      const stored = parseInt(sessionStorage.getItem(seenTsKey) || "0", 10)
      if (!stored && scannerAll.length > 0) {
        const maxTs = scannerAll[scannerAll.length - 1].timestamp
        sessionStorage.setItem(seenTsKey, String(maxTs))
        return
      }
    }

    const lastSeen = parseInt(sessionStorage.getItem(seenTsKey) || "0", 10)
    const scannerTxs = scannerAll.filter((tx) => tx.timestamp > lastSeen)

    if (scannerTxs.length === 0) return

    // Toast maksimal 5 transaksi terbaru per batch (limit toast hook = 5)
    scannerTxs.slice(-5).forEach((tx) => {
      const isIn = tx.type === "in"
      const qty = Number(tx.quantity) || 0
      toast({
        title: isIn ? "Barang Masuk (Scanner)" : "Barang Keluar (Scanner)",
        description: `${tx.productName || tx.productBarcode || "Item"} — ${isIn ? "+" : "−"}${qty} stok via ${tx.operator || "Scanner"}`,
        variant: "default",
        duration: 5000,
      })
    })

    const maxTs = Math.max(...scannerTxs.map((tx) => tx.timestamp), lastSeen)
    sessionStorage.setItem(seenTsKey, String(maxTs))
  }, [transactions, transactionsLoading, toast])

  return (
    <PredictionContext.Provider value={{ risks: predictionRisks, loading: predictionLoading }}>
      {children}
    </PredictionContext.Provider>
  )
}
