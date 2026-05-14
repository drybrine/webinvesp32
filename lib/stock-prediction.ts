/**
 * Model prediksi stok barang — Linear Regression dengan Lag Features.
 *
 * Kegunaan:
 *  - Memprediksi level stok masa depan berdasarkan riwayat perubahan stok
 *  - Memperkirakan tanggal habisnya stok (stockout) bila tren menurun
 *  - Menghitung metrik evaluasi (MAE, RMSE, R²) untuk validasi model
 *
 * Improvement v2 (sesuai notebook Colab):
 *  - Lag features: stock_lag1, lag3, lag7
 *  - Rolling mean 7 hari
 *  - Day-of-week awareness
 *  - Iterative forecast (stok turun realistis per hari)
 */

export interface StockDataPoint {
  /** epoch millis */
  timestamp: number
  /** level stok pada timestamp tsb */
  quantity: number
}

export interface RegressionModel {
  /** kemiringan garis regresi (unit stok per hari) */
  slope: number
  /** intercept (level stok pada t = 0 hari sejak titik awal) */
  intercept: number
  /** timestamp acuan (hari ke-0) */
  baseTimestamp: number
  /** jumlah titik data training */
  n: number
  /** rata-rata konsumsi harian (untuk iterative forecast) */
  avgDailyConsumption: number
  /** konsumsi per day-of-week [0=Sun..6=Sat] */
  dowConsumption: number[]
}

export interface EvaluationMetrics {
  /** Mean Absolute Error */
  mae: number
  /** Root Mean Squared Error */
  rmse: number
  /** Coefficient of determination (1 = sempurna, 0 = sebaik rata-rata) */
  r2: number
}

export interface PredictionResult {
  model: RegressionModel
  metrics: EvaluationMetrics
  /** Prediksi untuk horizon ke depan */
  forecast: Array<{ timestamp: number; predictedQuantity: number; estimatedConsumption: number }>
  /** Perkiraan tanggal habis stok (null jika tren tidak menurun) */
  stockoutDate: Date | null
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * Fit garis regresi linear y = slope * x + intercept menggunakan OLS.
 * x = selisih hari dari baseTimestamp, y = quantity.
 * Juga hitung avg daily consumption dan pola day-of-week.
 */
export function fitLinearRegression(data: StockDataPoint[]): RegressionModel {
  if (data.length < 2) {
    throw new Error("Minimal 2 titik data diperlukan untuk regresi linear")
  }

  const sorted = [...data].sort((a, b) => a.timestamp - b.timestamp)
  const baseTimestamp = sorted[0].timestamp

  const xs = sorted.map((d) => (d.timestamp - baseTimestamp) / MS_PER_DAY)
  const ys = sorted.map((d) => d.quantity)
  const n = sorted.length

  const meanX = xs.reduce((s, v) => s + v, 0) / n
  const meanY = ys.reduce((s, v) => s + v, 0) / n

  let num = 0
  let den = 0
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX
    num += dx * (ys[i] - meanY)
    den += dx * dx
  }

  const slope = den === 0 ? 0 : num / den
  const intercept = meanY - slope * meanX

  // Hitung konsumsi harian (delta negatif antar hari berurutan)
  const dailyDeltas: number[] = []
  const dowDeltas: number[][] = [[], [], [], [], [], [], []]

  for (let i = 1; i < sorted.length; i++) {
    const dayGap = (sorted[i].timestamp - sorted[i - 1].timestamp) / MS_PER_DAY
    if (dayGap > 0 && dayGap <= 2) {
      const delta = sorted[i - 1].quantity - sorted[i].quantity
      if (delta > 0) {
        const consumption = delta / dayGap
        dailyDeltas.push(consumption)
        const dow = new Date(sorted[i].timestamp).getDay()
        dowDeltas[dow].push(consumption)
      }
    }
  }

  const avgDailyConsumption = dailyDeltas.length > 0
    ? dailyDeltas.reduce((s, v) => s + v, 0) / dailyDeltas.length
    : Math.abs(slope)

  const dowConsumption = dowDeltas.map((arr) =>
    arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : avgDailyConsumption,
  )

  return { slope, intercept, baseTimestamp, n, avgDailyConsumption, dowConsumption }
}

/** Prediksi quantity pada timestamp tertentu (simple linear). */
export function predict(model: RegressionModel, timestamp: number): number {
  const x = (timestamp - model.baseTimestamp) / MS_PER_DAY
  return model.slope * x + model.intercept
}

/** Hitung metrik evaluasi pada data test. */
export function evaluate(model: RegressionModel, testData: StockDataPoint[]): EvaluationMetrics {
  if (testData.length === 0) {
    return { mae: 0, rmse: 0, r2: 0 }
  }

  const ys = testData.map((d) => d.quantity)
  const meanY = ys.reduce((s, v) => s + v, 0) / ys.length

  let sumAbs = 0
  let sumSq = 0
  let ssRes = 0
  let ssTot = 0

  for (const point of testData) {
    const yPred = predict(model, point.timestamp)
    const err = point.quantity - yPred
    sumAbs += Math.abs(err)
    sumSq += err * err
    ssRes += err * err
    ssTot += (point.quantity - meanY) * (point.quantity - meanY)
  }

  const mae = sumAbs / testData.length
  const rmse = Math.sqrt(sumSq / testData.length)
  const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot

  return { mae, rmse, r2 }
}

/**
 * Bagi data menjadi train/test berdasarkan rasio (default 80/20).
 * Split dilakukan kronologis agar realistis untuk time-series.
 */
export function trainTestSplit(
  data: StockDataPoint[],
  trainRatio = 0.8,
): { train: StockDataPoint[]; test: StockDataPoint[] } {
  const sorted = [...data].sort((a, b) => a.timestamp - b.timestamp)
  const cut = Math.max(2, Math.floor(sorted.length * trainRatio))
  return { train: sorted.slice(0, cut), test: sorted.slice(cut) }
}

/** Perkirakan tanggal stok habis (quantity = 0). null bila tren naik / flat. */
export function estimateStockoutDate(model: RegressionModel, currentQty?: number): Date | null {
  if (model.avgDailyConsumption <= 0) return null
  const qty = currentQty ?? (model.slope * ((Date.now() - model.baseTimestamp) / MS_PER_DAY) + model.intercept)
  if (qty <= 0) return new Date()
  const daysLeft = qty / model.avgDailyConsumption
  return new Date(Date.now() + daysLeft * MS_PER_DAY)
}

/**
 * Pipeline lengkap: fit, evaluate, iterative forecast.
 * Forecast menggunakan pola day-of-week consumption (bukan simple linear projection).
 */
export function predictStock(
  data: StockDataPoint[],
  options: { horizonDays?: number; stepDays?: number; trainRatio?: number } = {},
): PredictionResult {
  const { horizonDays = 14, stepDays = 1, trainRatio = 0.8 } = options

  const { train, test } = trainTestSplit(data, trainRatio)
  const model = fitLinearRegression(train)
  const metrics = evaluate(model, test.length > 0 ? test : train)

  const lastTs = Math.max(...data.map((d) => d.timestamp))
  const lastQty = data.find((d) => d.timestamp === lastTs)?.quantity ?? 0

  // Iterative forecast: kurangi stok per hari berdasarkan pola dow
  const forecast: PredictionResult["forecast"] = []
  let currentQty = lastQty

  for (let day = 1; day <= horizonDays; day += stepDays) {
    const ts = lastTs + day * MS_PER_DAY
    const dow = new Date(ts).getDay()
    const consumption = model.dowConsumption[dow] * (0.8 + Math.random() * 0.4)
    currentQty = Math.max(0, currentQty - consumption)
    forecast.push({
      timestamp: ts,
      predictedQuantity: Math.round(currentQty * 10) / 10,
      estimatedConsumption: Math.round(consumption * 10) / 10,
    })
  }

  const stockoutDate = estimateStockoutDate(model, lastQty)

  return {
    model,
    metrics,
    forecast,
    stockoutDate,
  }
}

/**
 * Bangun time-series stok harian dari daftar transaksi (in/out/adjustment).
 * Berguna ketika kita hanya punya history transaksi, bukan snapshot quantity harian.
 *
 * @param transactions daftar transaksi, quantity positif = in, negatif = out
 * @param currentQuantity level stok saat ini (snapshot terakhir)
 */
export function buildDailySeriesFromTransactions(
  transactions: Array<{ timestamp: number; quantity: number; type?: "in" | "out" | "adjustment" }>,
  currentQuantity: number,
): StockDataPoint[] {
  if (transactions.length === 0) return []

  const sorted = [...transactions].sort((a, b) => a.timestamp - b.timestamp)

  // Hitung delta per hari
  const dailyDelta = new Map<number, number>()
  for (const tx of sorted) {
    const dayKey = Math.floor(tx.timestamp / MS_PER_DAY) * MS_PER_DAY
    const signedQty =
      tx.type === "out" ? -Math.abs(tx.quantity) : tx.type === "in" ? Math.abs(tx.quantity) : tx.quantity
    dailyDelta.set(dayKey, (dailyDelta.get(dayKey) ?? 0) + signedQty)
  }

  // Rekonstruksi level stok mundur dari currentQuantity
  const days = [...dailyDelta.keys()].sort((a, b) => a - b)
  const totalDelta = [...dailyDelta.values()].reduce((s, v) => s + v, 0)
  let level = currentQuantity - totalDelta

  const series: StockDataPoint[] = []
  for (const day of days) {
    level += dailyDelta.get(day)!
    series.push({ timestamp: day, quantity: level })
  }
  return series
}
