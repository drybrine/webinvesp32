/**
 * Script test untuk model prediksi stok (linear regression).
 *
 * Cara pakai:
 *   npx tsx scripts/test-stock-prediction.ts
 *   npx tsx scripts/test-stock-prediction.ts --export barcodescanesp32-default-rtdb-export.json
 *
 * Output:
 *  - Parameter model (slope, intercept)
 *  - Metrik evaluasi (MAE, RMSE, R²)
 *  - Forecast 14 hari ke depan
 *  - Perkiraan tanggal stockout (jika ada)
 */

import { readFileSync, existsSync } from "node:fs"
import { resolve } from "node:path"
import {
  buildDailySeriesFromTransactions,
  predictStock,
  type StockDataPoint,
} from "../lib/stock-prediction"

const MS_PER_DAY = 24 * 60 * 60 * 1000

function fmtDate(ts: number | Date): string {
  const d = ts instanceof Date ? ts : new Date(ts)
  return d.toISOString().slice(0, 10)
}

function printDivider(title: string): void {
  console.log("\n" + "═".repeat(60))
  console.log(`  ${title}`)
  console.log("═".repeat(60))
}

/** Dataset dummy: stok menurun dengan noise realistis */
function buildDummyDataset(): { name: string; history: StockDataPoint[] } {
  const now = Date.now()
  const history: StockDataPoint[] = []
  const startQty = 100
  const avgDailyOut = 2.3

  for (let day = 29; day >= 0; day--) {
    const ts = now - day * MS_PER_DAY
    const noise = (Math.sin(day * 0.7) + Math.cos(day * 1.3)) * 1.5
    const qty = Math.max(0, Math.round(startQty - (29 - day) * avgDailyOut + noise))
    history.push({ timestamp: ts, quantity: qty })
  }

  return { name: "76 Apel (dummy)", history }
}

/** Coba baca dari export Firebase bila path diberikan lewat --export. */
function tryLoadFromExport(path: string): Array<{ name: string; history: StockDataPoint[] }> | null {
  if (!existsSync(path)) {
    console.warn(`[warn] file tidak ditemukan: ${path}`)
    return null
  }
  const raw = JSON.parse(readFileSync(path, "utf-8"))
  const inventory = raw.inventory ?? {}
  const transactions = raw.transactions ?? {}

  const txByBarcode = new Map<string, Array<{ timestamp: number; quantity: number; type?: "in" | "out" | "adjustment" }>>()
  for (const tx of Object.values(transactions) as any[]) {
    const key = tx.productBarcode ?? tx.barcode ?? ""
    if (!key) continue
    if (!txByBarcode.has(key)) txByBarcode.set(key, [])
    txByBarcode.get(key)!.push({
      timestamp: Number(tx.timestamp) || Date.now(),
      quantity: Number(tx.quantity) || 0,
      type: tx.type,
    })
  }

  const datasets: Array<{ name: string; history: StockDataPoint[] }> = []
  for (const item of Object.values(inventory) as any[]) {
    const txs = txByBarcode.get(item.barcode) ?? []
    if (txs.length < 2) continue
    const series = buildDailySeriesFromTransactions(txs, Number(item.quantity) || 0)
    if (series.length >= 2) {
      datasets.push({ name: `${item.name} (${item.barcode})`, history: series })
    }
  }

  return datasets.length > 0 ? datasets : null
}

function runTest(dataset: { name: string; history: StockDataPoint[] }): void {
  printDivider(`Item: ${dataset.name}`)

  console.log(`Jumlah titik data : ${dataset.history.length}`)
  console.log(`Rentang           : ${fmtDate(dataset.history[0].timestamp)} → ${fmtDate(dataset.history.at(-1)!.timestamp)}`)
  console.log(`Stok awal → akhir : ${dataset.history[0].quantity} → ${dataset.history.at(-1)!.quantity}`)

  const result = predictStock(dataset.history, { horizonDays: 14, trainRatio: 0.8 })

  console.log("\n  Parameter Model")
  console.log(`    slope     : ${result.model.slope.toFixed(4)} unit/hari`)
  console.log(`    intercept : ${result.model.intercept.toFixed(4)}`)
  console.log(`    n_train   : ${result.model.n}`)

  console.log("\n  Metrik Evaluasi")
  console.log(`    MAE       : ${result.metrics.mae.toFixed(3)}`)
  console.log(`    RMSE      : ${result.metrics.rmse.toFixed(3)}`)
  console.log(`    R²        : ${result.metrics.r2.toFixed(3)}`)

  console.log("\n  Forecast 14 hari ke depan")
  for (const f of result.forecast) {
    const bar = "▇".repeat(Math.max(0, Math.round(f.predictedQuantity / 2)))
    console.log(`    ${fmtDate(f.timestamp)}  ${f.predictedQuantity.toFixed(1).padStart(6)}  ${bar}`)
  }

  if (result.stockoutDate) {
    const lastHistoryTs = dataset.history.at(-1)!.timestamp
    const days = Math.round((result.stockoutDate.getTime() - lastHistoryTs) / MS_PER_DAY)
    console.log(`\n  ⚠ Stockout diperkirakan : ${fmtDate(result.stockoutDate)} (hari ke-${days} dari histori terakhir)`)
  } else {
    console.log("\n  ✓ Tren tidak menurun — stockout tidak diprediksi")
  }
}

function main(): void {
  const exportArg = process.argv.indexOf("--export")
  const exportPath = exportArg !== -1 ? process.argv[exportArg + 1] : null

  printDivider("Stock Prediction Model — Linear Regression")

  let datasets: Array<{ name: string; history: StockDataPoint[] }> = []

  if (exportPath) {
    const loaded = tryLoadFromExport(resolve(exportPath))
    if (loaded) {
      console.log(`Loaded ${loaded.length} item dari ${exportPath}`)
      datasets = loaded
    } else {
      console.log("Gagal load export, fallback ke dataset dummy.")
      datasets = [buildDummyDataset()]
    }
  } else {
    console.log("Menggunakan dataset dummy (tambahkan --export <path.json> untuk data real).")
    datasets = [buildDummyDataset()]
  }

  for (const ds of datasets) runTest(ds)

  printDivider("Selesai")
}

main()
