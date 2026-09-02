/**
 * Bandingkan model SEBELUM tuning (alpha EMA 0.05) vs SESUDAH (auto-tune)
 * pada export RTDB real. Protokol: validasi kronologis one-step-ahead
 * pada 20% akhir deret lag-pairs (out-of-sample, adil untuk kedua model).
 */
import { readFileSync } from "node:fs"
import {
  buildDailySeriesFromTransactions,
  buildConsumptionSeries,
  smoothConsumptionSeries,
  tuneEmaAlpha,
} from "../lib/stock-prediction"

/** OLS sederhana (mirror lib, yang tidak diekspor). */
function linearRegression(x: number[], y: number[]): { intercept: number; slope: number } {
  const n = x.length
  const mx = x.reduce((a, b) => a + b, 0) / n
  const my = y.reduce((a, b) => a + b, 0) / n
  let num = 0
  let den = 0
  for (let i = 0; i < n; i++) {
    num += (x[i] - mx) * (y[i] - my)
    den += (x[i] - mx) ** 2
  }
  if (den === 0) return { intercept: my, slope: 0 }
  const slope = num / den
  return { intercept: my - slope * mx, slope }
}

const path = process.argv[2]
if (!path) {
  console.error("usage: npx tsx scripts/compare-tuning.ts <export.json>")
  process.exit(1)
}

const raw = JSON.parse(readFileSync(path, "utf-8"))
const inventory = raw.inventory ?? {}
const transactions = raw.transactions ?? {}

const txByBarcode = new Map<string, Array<{ timestamp: number; quantity: number; type?: "in" | "out" | "adjustment" }>>()
for (const tx of Object.values(transactions) as any[]) {
  const key = tx.productBarcode ?? tx.barcode ?? ""
  if (!key) continue
  const ts = Number(tx.timestamp)
  const qty = Number(tx.quantity)
  if (!Number.isFinite(ts) || !Number.isFinite(qty)) continue
  if (!txByBarcode.has(key)) txByBarcode.set(key, [])
  txByBarcode.get(key)!.push({ timestamp: ts, quantity: qty, type: tx.type })
}

interface Row {
  name: string
  points: number
  alphaDefault: number
  alphaTuned: number
  maeBefore: number
  maeAfter: number
  rmseBefore: number
  rmseAfter: number
}

function evalAlpha(series: ReturnType<typeof buildDailySeriesFromTransactions>, alpha: number) {
  const pairs = (() => {
    const c = smoothConsumptionSeries(buildConsumptionSeries(series), alpha)
    const x: number[] = []
    const y: number[] = []
    for (let i = 1; i < c.length; i++) {
      x.push(c[i - 1].consumption)
      y.push(c[i].consumption)
    }
    return { x, y }
  })()
  const trainEnd = Math.max(4, Math.floor(pairs.x.length * 0.8))
  const valCount = pairs.x.length - trainEnd
  if (valCount < 2) return null
  const { intercept, slope } = linearRegression(pairs.x.slice(0, trainEnd), pairs.y.slice(0, trainEnd))
  let sumAbs = 0
  let sumSq = 0
  for (let i = trainEnd; i < pairs.x.length; i++) {
    const p = Math.max(0, intercept + slope * pairs.x[i])
    const e = pairs.y[i] - p
    sumAbs += Math.abs(e)
    sumSq += e * e
  }
  return { mae: sumAbs / valCount, rmse: Math.sqrt(sumSq / valCount), valCount }
}

const rows: Row[] = []
for (const item of Object.values(inventory) as any[]) {
  const txs = txByBarcode.get(item.barcode) ?? []
  const series = buildDailySeriesFromTransactions(txs, Number(item.quantity) || 0)
  const rawConsumption = buildConsumptionSeries(series)
  if (rawConsumption.length < 12) continue // tuning & validasi butuh data cukup

  const alphaTuned = tuneEmaAlpha(series)
  const before = evalAlpha(series, 0.05)
  const after = evalAlpha(series, alphaTuned)
  if (!before || !after) continue

  rows.push({
    name: String(item.name).slice(0, 42),
    points: rawConsumption.length,
    alphaDefault: 0.05,
    alphaTuned,
    maeBefore: before.mae,
    maeAfter: after.mae,
    rmseBefore: before.rmse,
    rmseAfter: after.rmse,
  })
}

console.log(`\n${"Item".padEnd(44)} n    alpha     MAE 0.05   MAE tune    ΔMAE    RMSE 0.05  RMSE tune`)
console.log("-".repeat(110))
let sumB = 0, sumA = 0, sumRb = 0, sumRa = 0, changed = 0
for (const r of rows) {
  const dMae = ((r.maeBefore - r.maeAfter) / r.maeBefore) * 100
  if (r.alphaTuned !== 0.05) changed++
  sumB += r.maeBefore; sumA += r.maeAfter; sumRb += r.rmseBefore; sumRa += r.rmseAfter
  console.log(
    `${r.name.padEnd(44)} ${String(r.points).padStart(3)}  ${r.alphaTuned.toFixed(2)}    ` +
    `${r.maeBefore.toFixed(4)}     ${r.maeAfter.toFixed(4)}   ${dMae >= 0 ? "+" : ""}${dMae.toFixed(1)}%   ` +
    `${r.rmseBefore.toFixed(4)}      ${r.rmseAfter.toFixed(4)}`,
  )
}
console.log("-".repeat(110))
console.log(`Item dievaluasi        : ${rows.length}`)
console.log(`Alpha berubah (tuned)  : ${changed}/${rows.length}`)
console.log(`Rata-rata MAE  before  : ${(sumB / rows.length).toFixed(4)}`)
console.log(`Rata-rata MAE  after   : ${(sumA / rows.length).toFixed(4)}  (${(((sumB - sumA) / sumB) * 100).toFixed(1)}% lebih baik)`)
console.log(`Rata-rata RMSE before  : ${(sumRb / rows.length).toFixed(4)}`)
console.log(`Rata-rata RMSE after   : ${(sumRa / rows.length).toFixed(4)}  (${(((sumRb - sumRa) / sumRb) * 100).toFixed(1)}% lebih baik)`)
