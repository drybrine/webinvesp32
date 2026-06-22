"use client"

import { useMemo, useState, useEffect } from "react"
import Link from "next/link"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AlertTriangle, TrendingDown, TrendingUp, Activity, ArrowLeft } from "lucide-react"

import { useFirebaseInventory, useFirebaseTransactions } from "@/hooks/use-firebase"
import { firebaseHelpers } from "@/lib/firebase"
import {
  buildDailySeriesFromTransactions,
  predictStock,
  type StockDataPoint,
  type PredictionResult,
} from "@/lib/stock-prediction"
import PredictionChart from "@/components/prediction-chart"
import { useAuth } from "@/components/auth-provider"

const MS_PER_DAY = 24 * 60 * 60 * 1000

function fmt(ts: number): string {
  return new Date(ts).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
  })
}

export default function PrediksiPage() {
  const { getIdToken } = useAuth()
  const { items: inventory, loading: inventoryLoading } = useFirebaseInventory()
  const { transactions, loading: txLoading } = useFirebaseTransactions(500)

  const [selectedId, setSelectedId] = useState<string>("")
  const [horizonDays, setHorizonDays] = useState<number>(14)
  const trainRatio = 0.85  // optimal dari TSCV tuning (notebook honda_tune_model)

  const activeInventory = useMemo(
    () => inventory.filter((i) => !i.deleted),
    [inventory],
  )

  const selectedItem = useMemo(
    () => activeInventory.find((i) => i.id === selectedId) ?? null,
    [activeInventory, selectedId],
  )

  const [predictionSource, setPredictionSource] = useState<"server" | "client" | null>(null)
  const [predictionError, setPredictionError] = useState<string | null>(null)

  const history: StockDataPoint[] = useMemo(() => {
    if (!selectedItem) return []
    const itemTx = transactions
      .filter((t) => t.productBarcode === selectedItem.barcode)
      .map((t) => ({
        timestamp: Number(t.timestamp) || Date.now(),
        quantity: Number(t.quantity) || 0,
        type: t.type as "in" | "out" | "adjustment",
      }))
    return buildDailySeriesFromTransactions(itemTx, Number(selectedItem.quantity) || 0)
  }, [selectedItem, transactions])

  const [prediction, setPrediction] = useState<PredictionResult | null>(null)

  useEffect(() => {
    if (history.length < 2 || !selectedItem) {
      setPrediction(null)
      setPredictionSource(null)
      setPredictionError(null)
      return
    }

    const controller = new AbortController()

    const fetchFromAPI = async () => {
      setPredictionError(null)
      try {
        // One-time fetch of all transactions for accurate prediction
        const allTxData = await firebaseHelpers.fetchAllTransactions()
        const allTxs = allTxData as Array<Record<string, unknown>>
        const itemTx = allTxs
          .filter((t: Record<string, unknown>) => t.productBarcode === selectedItem.barcode)
          .map((t: Record<string, unknown>) => ({
            timestamp: Number(t.timestamp) || Date.now(),
            quantity: Number(t.quantity) || 0,
            type: t.type as "in" | "out" | "adjustment",
          }))

        if (itemTx.length < 2) {
          setPrediction(null)
          setPredictionSource(null)
          return
        }
        const token = await getIdToken()
        const res = await fetch("/api/predict", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            transactions: itemTx,
            currentQuantity: Number(selectedItem.quantity) || 0,
            horizonDays,
            trainRatio,
          }),
          signal: controller.signal,
        })
        if (!res.ok) throw new Error(`Server error: HTTP ${res.status}`)
        const data = await res.json()
        if (data.error) throw new Error(data.error)

        setPrediction({
          model: {
            slope: data.model.slope,
            intercept: data.model.intercept,
            baseTimestamp: Date.now(),
            n: data.model.n,
            avgDailyConsumption: data.model.avgDailyConsumption,
            dowConsumption: data.model.dowConsumption,
            consumptionSlope: data.model.consumptionSlope,
            consumptionIntercept: data.model.consumptionIntercept,
            lastConsumption: data.model.lastConsumption,
          },
          metrics: { mae: data.metrics.mae, rmse: data.metrics.rmse, r2: data.metrics.r2 },
          forecast: data.forecast,
          stockoutDate: data.stockoutDate ? new Date(data.stockoutDate) : null,
        })
        setPredictionSource("server")
      } catch (err) {
        if ((err as Error).name === "AbortError") return

        try {
          const fallback = predictStock(history, { horizonDays, trainRatio })
          setPrediction(fallback)
          setPredictionSource("client")
          setPredictionError(null)
        } catch (fallbackErr) {
          setPrediction(null)
          setPredictionSource(null)
          setPredictionError((fallbackErr as Error).message || "Gagal menghitung prediksi.")
        }
      }
    }

    fetchFromAPI()
    return () => controller.abort()
  }, [getIdToken, history, horizonDays, trainRatio, selectedItem, transactions])

  const chartData = useMemo(() => {
    if (!prediction || history.length === 0) return []
    // Limit historical data to last 30 days for readability
    const HISTORY_DAYS = 30
    const cutoff = Date.now() - HISTORY_DAYS * MS_PER_DAY
    const recentHistory = history.filter(h => h.timestamp >= cutoff)
    const hist = recentHistory.map((h) => ({
      date: fmt(h.timestamp),
      timestamp: h.timestamp,
      actual: h.quantity,
      predicted: null as number | null,
    }))
    const fc = prediction.forecast.map((f: { timestamp: number; predictedQuantity: number; estimatedConsumption: number }) => ({
      date: fmt(f.timestamp),
      timestamp: f.timestamp,
      actual: null as number | null,
      predicted: Number(f.predictedQuantity.toFixed(2)),
    }))
    return [...hist, ...fc]
  }, [history, prediction])

  const forecastStockout = useMemo(() => {
    if (!prediction) return null

    const stockoutIndex = prediction.forecast.findIndex(
      (point: { predictedQuantity: number }) => point.predictedQuantity <= 0,
    )
    if (stockoutIndex === -1) return null

    const point = prediction.forecast[stockoutIndex]
    return {
      date: new Date(point.timestamp),
      daysFromForecastStart: stockoutIndex + 1,
    }
  }, [prediction])

  const loading = inventoryLoading || txLoading

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <Link href="/" className="inline-flex items-center gap-1 hover:text-foreground transition-colors">
              <ArrowLeft className="w-3 h-3" /> Kembali
            </Link>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Prediksi Stok</h1>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-sm text-muted-foreground">
              Linear regression untuk memperkirakan level stok ke depan.
            </p>
            {predictionSource && (
              <Badge variant="secondary" className="text-[10px] font-semibold">
                {predictionSource === "server" ? "Server" : "Client"}
              </Badge>
            )}
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Parameter Model</CardTitle>
          <CardDescription>Pilih barang dan atur horizon prediksi</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2 min-w-0">
            <Label htmlFor="item">Barang</Label>
            <Select value={selectedId} onValueChange={setSelectedId} disabled={loading}>
              <SelectTrigger id="item" className="min-w-0">
                <SelectValue placeholder={loading ? "Memuat..." : "Pilih barang"} />
              </SelectTrigger>
              <SelectContent
                align="start"
                side="bottom"
                sideOffset={4}
                className="max-h-[min(14rem,var(--radix-select-content-available-height))] w-[var(--radix-select-trigger-width)] max-w-[calc(100vw-2rem)]"
              >
                {activeInventory.map((item) => (
                  <SelectItem key={item.id} value={item.id} title={`${item.name}${item.barcode ? ` - ${item.barcode}` : ""}`}>
                    <span className="block min-w-0 truncate">
                      {item.name}
                      {item.barcode ? <span className="text-muted-foreground"> - {item.barcode}</span> : null}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="horizon">Horizon (hari)</Label>
            <Input
              id="horizon"
              type="number"
              min={1}
              max={90}
              value={horizonDays}
              onChange={(e) => setHorizonDays(Math.max(1, Math.min(90, Number(e.target.value) || 14)))}
            />
          </div>
        </CardContent>
      </Card>

      {!selectedItem && !loading && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Pilih barang untuk mulai memprediksi.
          </CardContent>
        </Card>
      )}

      {selectedItem && history.length < 2 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Data transaksi untuk <strong>{selectedItem.name}</strong> belum cukup (minimal 2 titik).
            Tambahkan transaksi in/out lebih dulu agar model dapat fit.
          </CardContent>
        </Card>
      )}

      {predictionError && selectedItem && history.length >= 2 && (
        <Card>
          <CardContent className="py-12 text-center text-destructive">
            <p className="font-medium">Gagal memuat prediksi</p>
            <p className="text-sm mt-1 text-muted-foreground">{predictionError}</p>
          </CardContent>
        </Card>
      )}

      {prediction && selectedItem && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <MetricCard
              icon={<Activity className="w-4 h-4" />}
              label="Stok Saat Ini"
              value={`${selectedItem.quantity}`}
              hint={`Min stok: ${selectedItem.minStock}`}
            />
            <MetricCard
              icon={prediction.model.slope < 0 ? <TrendingDown className="w-4 h-4 text-red-500" /> : <TrendingUp className="w-4 h-4 text-green-600" />}
              label="Tren"
              value={`${prediction.model.slope >= 0 ? "+" : ""}${prediction.model.slope.toFixed(2)}/hari`}
              hint={prediction.model.slope < 0 ? "Stok menurun" : "Stok naik/stabil"}
            />
            <MetricCard
              label="Akurasi (R²)"
              value={prediction.metrics.r2.toFixed(3)}
              hint={`MAE ${prediction.metrics.mae.toFixed(2)} · RMSE ${prediction.metrics.rmse.toFixed(2)}`}
            />
            <MetricCard
              icon={<AlertTriangle className={`w-4 h-4 ${forecastStockout ? "text-amber-500" : "text-muted-foreground"}`} />}
              label="Perkiraan Habis"
              value={
                forecastStockout
                  ? forecastStockout.date.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })
                  : "—"
              }
              hint={
                forecastStockout
                  ? `Hari ke-${forecastStockout.daysFromForecastStart} pada forecast`
                  : `Tidak habis dalam ${horizonDays} hari forecast`
              }
            />
          </div>

          <Card className="border-primary/10">
            <CardHeader>
              <CardTitle className="text-base font-bold tracking-tight">Grafik Historis & Forecast</CardTitle>
              <CardDescription>
                Garis padat = data 30 hari terakhir, garis putus = prediksi {horizonDays} hari
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PredictionChart data={chartData} minStock={selectedItem.minStock} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Tabel Forecast</CardTitle>
              <CardDescription>
                Prediksi kuantitas {horizonDays} hari ke depan (iterative, tanpa restock)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2">
                {prediction.forecast.map((f: { timestamp: number; predictedQuantity: number; estimatedConsumption: number }) => {
                  const below = f.predictedQuantity < selectedItem.minStock
                  const habis = f.predictedQuantity <= 0
                  return (
                    <div
                      key={f.timestamp}
                      className="rounded-md border p-2 text-center text-xs space-y-1"
                    >
                      <div className="text-muted-foreground">{fmt(f.timestamp)}</div>
                      <div className="font-semibold text-base">
                        {f.predictedQuantity.toFixed(1)}
                      </div>
                      <div className="text-muted-foreground">
                        -{f.estimatedConsumption.toFixed(1)}/hari
                      </div>
                      {habis ? (
                        <Badge variant="destructive" className="text-[10px]">
                          habis
                        </Badge>
                      ) : below ? (
                        <Badge variant="secondary" className="text-[10px]">
                          rendah
                        </Badge>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Testing Model</CardTitle>
              <CardDescription>
                Detail regresi linear konsumsi harian dan metrik evaluasi (train/test split kronologis)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Key metrics — visually prominent */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border border-primary/10 bg-primary/[0.03] p-3 text-center">
                  <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">R²</div>
                  <div className="text-xl font-bold text-primary mt-1 tabular-nums">{prediction.metrics.r2.toFixed(3)}</div>
                </div>
                <div className="rounded-lg border border-border bg-card p-3 text-center">
                  <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">MAE</div>
                  <div className="text-lg font-bold text-foreground mt-1 tabular-nums">{prediction.metrics.mae.toFixed(3)}</div>
                </div>
                <div className="rounded-lg border border-border bg-card p-3 text-center">
                  <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">RMSE</div>
                  <div className="text-lg font-bold text-foreground mt-1 tabular-nums">{prediction.metrics.rmse.toFixed(3)}</div>
                </div>
              </div>
              {/* Technical parameters — secondary */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-3 text-sm pt-2 border-t border-border">
                <KV k="Slope" v={`${prediction.model.slope.toFixed(4)} /hari`} />
                <KV k="Intercept" v={prediction.model.intercept.toFixed(4)} />
                <KV k="Avg Konsumsi" v={`${prediction.model.avgDailyConsumption.toFixed(2)} /hari`} />
                <KV k="n train" v={String(prediction.model.n)} />
                <KV k="n test" v={String(Math.max(0, history.length - prediction.model.n))} />
                <KV k="Horizon" v={`${horizonDays} hari`} />
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

function MetricCard({
  icon,
  label,
  value,
  hint,
}: {
  icon?: React.ReactNode
  label: string
  value: string
  hint?: string
}) {
  return (
    <Card className="card-hover">
      <CardContent className="p-4">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
          {icon}
          <span>{label}</span>
        </div>
        <div className="text-xl font-bold mt-1.5 tabular-nums">{value}</div>
        {hint && <div className="text-[11px] text-muted-foreground mt-0.5">{hint}</div>}
      </CardContent>
    </Card>
  )
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{k}</div>
      <div className="font-mono font-semibold text-sm mt-0.5">{v}</div>
    </div>
  )
}
