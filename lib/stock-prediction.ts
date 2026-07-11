/**
 * Model prediksi stok barang - Simple Linear Regression.
 *
 * Pendekatan berbasis konsumsi: agregasi transaksi "out" harian,
 * regresi OLS pada kumulatif konsumsi terhadap waktu (ΣC(t) = a + b*t),
 * dan forecast stok iteratif dari stok saat ini dikurangi avgDailyConsumption.
 *
 * Tidak lagi merekonstruksi histori stok dari currentQuantity yang
 * mungkin rusak/outdated di node inventory Firebase.
 */

export interface StockDataPoint {
  /** epoch millis */
  timestamp: number
  /** level stok pada timestamp tsb */
  quantity: number
}

export interface DailyConsumptionPoint {
  /** epoch millis (start of day) */
  timestamp: number
  /** total konsumsi (out) pada hari tsb */
  consumption: number
}

export interface RegressionModel {
  /** estimasi perubahan stok per hari, negatif bila stok menurun */
  slope: number
  /** intercept regresi kumulatif konsumsi */
  intercept: number
  /** timestamp acuan (hari ke-0 dari data pertama) */
  baseTimestamp: number
  /** jumlah titik data konsumsi untuk training */
  n: number
  /** rata-rata konsumsi harian historis (slope regresi kumulatif) */
  avgDailyConsumption: number
  /** total konsumsi historis */
  totalConsumption: number
  /** konsumsi per day-of-week [0=Sun..6=Sat], untuk kompatibilitas UI lama */
  dowConsumption: number[]
  /** @deprecated — tidak digunakan di model konsumsi */
  consumptionSlope?: number
  /** @deprecated — tidak digunakan di model konsumsi */
  consumptionIntercept?: number
  /** @deprecated — tidak digunakan di model konsumsi */
  lastConsumption?: number
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
  /** Perkiraan tanggal habis stok (null jika konsumsi tidak terprediksi) */
  stockoutDate: Date | null
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

function dayTimestamp(timestamp = Date.now()): number {
  return Math.floor(timestamp / MS_PER_DAY) * MS_PER_DAY
}

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length
}

function linearRegression(x: number[], y: number[]): { intercept: number; slope: number } {
  const n = x.length
  if (n === 0) return { intercept: 0, slope: 0 }
  if (n === 1) return { intercept: y[0], slope: 0 }

  const mx = mean(x)
  const my = mean(y)

  let numerator = 0
  let denominator = 0
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx
    numerator += dx * (y[i] - my)
    denominator += dx * dx
  }

  if (denominator === 0) return { intercept: my, slope: 0 }

  const slope = numerator / denominator
  const intercept = my - slope * mx
  return { intercept, slope }
}

function calculateMetrics(actual: number[], predicted: number[]): EvaluationMetrics {
  if (actual.length === 0 || predicted.length === 0) {
    return { mae: 0, rmse: 0, r2: 0 }
  }

  const meanActual = mean(actual)
  let sumAbs = 0
  let sumSq = 0
  let ssTot = 0

  for (let i = 0; i < actual.length; i++) {
    const error = actual[i] - predicted[i]
    sumAbs += Math.abs(error)
    sumSq += error * error
    ssTot += (actual[i] - meanActual) ** 2
  }

  const mae = sumAbs / actual.length
  const rmse = Math.sqrt(sumSq / actual.length)
  const r2 = ssTot === 0 ? (sumSq === 0 ? 1 : 0) : 1 - sumSq / ssTot

  return { mae, rmse, r2 }
}

/**
 * Agregasi transaksi "out" menjadi konsumsi harian.
 * Tidak merekonstruksi stok — hanya menghitung total barang keluar per hari.
 */
export function buildConsumptionFromTransactions(
  transactions: Array<{ timestamp: number; quantity: number; type?: "in" | "out" | "adjustment" }>,
): DailyConsumptionPoint[] {
  const dailyConsumption = new Map<number, number>()
  for (const tx of transactions) {
    if (tx.type !== "out") continue
    const dayKey = Math.floor(tx.timestamp / MS_PER_DAY) * MS_PER_DAY
    dailyConsumption.set(dayKey, (dailyConsumption.get(dayKey) ?? 0) + Math.abs(tx.quantity))
  }
  const days = [...dailyConsumption.keys()].sort((a, b) => a - b)
  return days.map((day) => ({ timestamp: day, consumption: dailyConsumption.get(day)! }))
}

/**
 * Konversi data konsumsi harian ke perkiraan level stok untuk keperluan chart.
 * Bekerja mundur dari currentStock: stok[t] = stok[t+1] + konsumsi[t].
 * Titik paling akhir = currentStock.
 */
export function consumptionToStockLevels(
  data: DailyConsumptionPoint[],
  currentStock: number,
): StockDataPoint[] {
  if (data.length === 0) return []
  const sorted = [...data].sort((a, b) => a.timestamp - b.timestamp)
  let stock = currentStock
  const result: StockDataPoint[] = []
  for (let i = sorted.length - 1; i >= 0; i--) {
    result.unshift({ timestamp: sorted[i].timestamp, quantity: stock })
    stock += sorted[i].consumption
  }
  return result
}

/**
 * Bangun deret kumulatif konsumsi dari data harian untuk regresi OLS.
 * ΣC(t) = a + b*t, dengan t = indeks hari relatif terhadap data pertama.
 */
function buildCumulativeSeries(data: DailyConsumptionPoint[]): { days: number[]; cumulative: number[] } {
  const baseTs = data[0].timestamp
  let total = 0
  const days: number[] = []
  const cumulative: number[] = []
  for (const point of data) {
    const dayIndex = Math.round((point.timestamp - baseTs) / MS_PER_DAY)
    total += point.consumption
    days.push(dayIndex)
    cumulative.push(total)
  }
  return { days, cumulative }
}

/**
 * Fit Simple Linear Regression pada kumulatif konsumsi terhadap waktu.
 * slope = avgDailyConsumption (laju konsumsi per hari).
 */
export function fitLinearRegression(data: DailyConsumptionPoint[]): RegressionModel {
  if (data.length < 2) {
    throw new Error("Minimal 2 titik data diperlukan untuk regresi linear")
  }

  const sorted = [...data].sort((a, b) => a.timestamp - b.timestamp)
  const baseTimestamp = sorted[0].timestamp
  const { days, cumulative } = buildCumulativeSeries(sorted)
  const { slope, intercept } = linearRegression(days, cumulative)
  const avgDailyConsumption = slope

  const dowTotals: number[][] = [[], [], [], [], [], [], []]
  for (const point of sorted) {
    dowTotals[new Date(point.timestamp).getDay()].push(point.consumption)
  }
  const dowConsumption = dowTotals.map((items) => (items.length > 0 ? mean(items) : avgDailyConsumption))

  return {
    slope: -avgDailyConsumption,
    intercept,
    baseTimestamp,
    n: sorted.length,
    avgDailyConsumption,
    totalConsumption: cumulative[cumulative.length - 1] ?? 0,
    dowConsumption,
  }
}

/**
 * Prediksi konsumsi hari berikutnya (sama dengan rata-rata harian).
 */
export function predict(model: RegressionModel): number {
  return model.avgDailyConsumption
}

/**
 * Evaluasi model: bandingkan konsumsi aktual harian di testData
 * terhadap prediksi laju konstan (avgDailyConsumption).
 */
export function evaluate(model: RegressionModel, testData: DailyConsumptionPoint[]): EvaluationMetrics {
  if (testData.length === 0) return { mae: 0, rmse: 0, r2: 0 }
  const actualDaily = testData.map((p) => p.consumption)
  const predictedDaily = testData.map(() => model.avgDailyConsumption)
  return calculateMetrics(actualDaily, predictedDaily)
}

/**
 * Bagi data konsumsi harian menjadi train/test berdasarkan rasio.
 * Split kronologis (untuk time-series).
 */
export function trainTestSplit(
  data: DailyConsumptionPoint[],
  trainRatio = 0.85,
): { train: DailyConsumptionPoint[]; test: DailyConsumptionPoint[] } {
  const sorted = [...data].sort((a, b) => a.timestamp - b.timestamp)
  const cut = Math.min(sorted.length, Math.max(2, Math.floor(sorted.length * trainRatio)))
  return { train: sorted.slice(0, cut), test: sorted.slice(cut) }
}

/** Perkirakan tanggal stok habis dari stok saat ini. */
export function estimateStockoutDate(
  model: RegressionModel,
  currentQty?: number,
  baseTimestamp = Date.now(),
): Date | null {
  const quantity = currentQty ?? 0
  if (quantity <= 0) return new Date(baseTimestamp)

  const dailyConsumption = model.avgDailyConsumption
  if (dailyConsumption <= 0) return null

  const daysToStockout = quantity / dailyConsumption
  return new Date(baseTimestamp + Math.round(daysToStockout) * MS_PER_DAY)
}

/**
 * Pipeline lengkap: fit Linear Regression pada konsumsi kumulatif,
 * evaluate, forecast stok iteratif dari currentStock.
 *
 * Forecast linear menurun: stok dikurangi avgDailyConsumption per hari.
 */
export function predictStock(
  data: DailyConsumptionPoint[],
  currentStock: number,
  options: { horizonDays?: number; trainRatio?: number; currentTimestamp?: number } = {},
): PredictionResult {
  const { horizonDays = 14, trainRatio = 0.85, currentTimestamp = Date.now() } = options

  const sorted = [...data].sort((a, b) => a.timestamp - b.timestamp)
  const { train, test } = trainTestSplit(sorted, trainRatio)
  const model = fitLinearRegression(train)
  const metrics = evaluate(model, test.length >= 2 ? test : sorted)

  const lastTimestamp = sorted.length > 0 ? sorted[sorted.length - 1].timestamp : dayTimestamp(currentTimestamp)
  const forecastBaseTimestamp = Math.max(lastTimestamp, dayTimestamp(currentTimestamp))

  const dailyConsumption = model.avgDailyConsumption
  let forecastQty = currentStock

  const forecast: PredictionResult["forecast"] = []
  for (let day = 1; day <= horizonDays; day++) {
    const timestamp = forecastBaseTimestamp + day * MS_PER_DAY
    forecastQty = Math.max(0, forecastQty - dailyConsumption)

    forecast.push({
      timestamp,
      predictedQuantity: Math.round(forecastQty * 10) / 10,
      estimatedConsumption: Math.round(dailyConsumption * 10) / 10,
    })
  }

  return {
    model,
    metrics,
    forecast,
    stockoutDate: estimateStockoutDate(model, currentStock, forecastBaseTimestamp),
  }
}

/**
 * @deprecated Gunakan buildConsumptionFromTransactions() untuk model konsumsi.
 * Dipertahankan untuk backward-compat dengan script generator/test.
 *
 * Bangun time-series stok harian dari daftar transaksi (in/out/adjustment).
 */
export function buildDailySeriesFromTransactions(
  transactions: Array<{ timestamp: number; quantity: number; type?: "in" | "out" | "adjustment" }>,
  currentQuantity: number,
): StockDataPoint[] {
  if (transactions.length === 0) return []

  const sorted = [...transactions].sort((a, b) => a.timestamp - b.timestamp)

  const dailyDelta = new Map<number, number>()
  for (const tx of sorted) {
    const dayKey = Math.floor(tx.timestamp / MS_PER_DAY) * MS_PER_DAY
    const signedQty =
      tx.type === "out" ? -Math.abs(tx.quantity) : tx.type === "in" ? Math.abs(tx.quantity) : tx.quantity
    dailyDelta.set(dayKey, (dailyDelta.get(dayKey) ?? 0) + signedQty)
  }

  const days = [...dailyDelta.keys()].sort((a, b) => a - b)
  const totalDelta = [...dailyDelta.values()].reduce((sum, value) => sum + value, 0)
  let level = currentQuantity - totalDelta

  const series: StockDataPoint[] = []
  for (const day of days) {
    level += dailyDelta.get(day)!
    series.push({ timestamp: day, quantity: Math.max(0, level) })
  }

  return series
}
