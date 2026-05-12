"use client"

import { useMemo, useState } from "react"
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
import {
  buildDailySeriesFromTransactions,
  predictStock,
  type StockDataPoint,
} from "@/lib/stock-prediction"
import PredictionChart from "@/components/prediction-chart"

const MS_PER_DAY = 24 * 60 * 60 * 1000

function fmt(ts: number): string {
  return new Date(ts).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
  })
}

export default function PrediksiPage() {
  const { items: inventory, loading: inventoryLoading } = useFirebaseInventory()
  const { transactions, loading: txLoading } = useFirebaseTransactions()

  const [selectedId, setSelectedId] = useState<string>("")
  const [horizonDays, setHorizonDays] = useState<number>(14)
  const [trainRatio, setTrainRatio] = useState<number>(0.8)

  const activeInventory = useMemo(
    () => inventory.filter((i) => !i.deleted),
    [inventory],
  )

  const selectedItem = useMemo(
    () => activeInventory.find((i) => i.id === selectedId) ?? null,
    [activeInventory, selectedId],
  )

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

  const prediction = useMemo(() => {
    if (history.length < 2) return null
    try {
      return predictStock(history, { horizonDays, trainRatio })
    } catch {
      return null
    }
  }, [history, horizonDays, trainRatio])

  const chartData = useMemo(() => {
    if (!prediction || history.length === 0) return []
    const hist = history.map((h) => ({
      date: fmt(h.timestamp),
      timestamp: h.timestamp,
      actual: h.quantity,
      predicted: null as number | null,
    }))
    const fc = prediction.forecast.map((f) => ({
      date: fmt(f.timestamp),
      timestamp: f.timestamp,
      actual: null as number | null,
      predicted: Number(f.predictedQuantity.toFixed(2)),
    }))
    return [...hist, ...fc]
  }, [history, prediction])

  const loading = inventoryLoading || txLoading

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <Link href="/" className="inline-flex items-center gap-1 hover:text-foreground">
              <ArrowLeft className="w-3 h-3" /> Kembali
            </Link>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Prediksi Stok</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Linear regression untuk memperkirakan level stok ke depan berdasarkan riwayat transaksi.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Parameter Model</CardTitle>
          <CardDescription>Pilih barang dan atur horizon prediksi</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="item">Barang</Label>
            <Select value={selectedId} onValueChange={setSelectedId} disabled={loading}>
              <SelectTrigger id="item">
                <SelectValue placeholder={loading ? "Memuat..." : "Pilih barang"} />
              </SelectTrigger>
              <SelectContent>
                {activeInventory.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name} {item.barcode ? `— ${item.barcode}` : ""}
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

          <div className="space-y-2">
            <Label htmlFor="ratio">Rasio Train ({(trainRatio * 100).toFixed(0)}%)</Label>
            <Input
              id="ratio"
              type="range"
              min={0.5}
              max={0.95}
              step={0.05}
              value={trainRatio}
              onChange={(e) => setTrainRatio(Number(e.target.value))}
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
              icon={<AlertTriangle className={`w-4 h-4 ${prediction.stockoutDate ? "text-amber-500" : "text-muted-foreground"}`} />}
              label="Perkiraan Habis"
              value={
                prediction.stockoutDate
                  ? prediction.stockoutDate.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })
                  : "—"
              }
              hint={
                prediction.stockoutDate
                  ? `${Math.round((prediction.stockoutDate.getTime() - Date.now()) / MS_PER_DAY)} hari lagi`
                  : "Tren tidak menurun"
              }
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Grafik Historis & Forecast</CardTitle>
              <CardDescription>
                Garis padat = data historis, garis putus = prediksi {horizonDays} hari
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
                Prediksi kuantitas {horizonDays} hari ke depan
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2">
                {prediction.forecast.map((f) => {
                  const below = f.predictedQuantity < selectedItem.minStock
                  return (
                    <div
                      key={f.timestamp}
                      className="rounded-md border p-2 text-center text-xs space-y-1"
                    >
                      <div className="text-muted-foreground">{fmt(f.timestamp)}</div>
                      <div className="font-semibold text-base">
                        {f.predictedQuantity.toFixed(1)}
                      </div>
                      {below && (
                        <Badge variant="destructive" className="text-[10px]">
                          di bawah min
                        </Badge>
                      )}
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
                Detail parameter fit dan metrik evaluasi (train/test split kronologis)
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <KV k="Slope" v={`${prediction.model.slope.toFixed(4)} /hari`} />
              <KV k="Intercept" v={prediction.model.intercept.toFixed(4)} />
              <KV k="n train" v={String(prediction.model.n)} />
              <KV k="n test" v={String(Math.max(0, history.length - prediction.model.n))} />
              <KV k="MAE" v={prediction.metrics.mae.toFixed(3)} />
              <KV k="RMSE" v={prediction.metrics.rmse.toFixed(3)} />
              <KV k="R²" v={prediction.metrics.r2.toFixed(3)} />
              <KV k="Horizon" v={`${horizonDays} hari`} />
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
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {icon}
          <span>{label}</span>
        </div>
        <div className="text-2xl font-bold mt-1">{value}</div>
        {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
      </CardContent>
    </Card>
  )
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{k}</div>
      <div className="font-mono font-medium">{v}</div>
    </div>
  )
}
