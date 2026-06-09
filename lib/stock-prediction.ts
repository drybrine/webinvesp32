/**
 * Model prediksi stok barang - Simple Linear Regression.
 *
 * Sesuai teori regresi linear sederhana: Y = a + bX.
 * Di sini:
 *   X = konsumsi hari sebelumnya
 *   Y = konsumsi hari ini
 *
 * Forecast stok tidak langsung memanjangkan garis stok. Model memprediksi
 * konsumsi per hari, lalu stok dikurangi secara iteratif. Hasilnya tetap
 * Linear Regression biasa satu variabel, tetapi kurva stok forecast bisa
 * melengkung halus karena konsumsi hari berikutnya diprediksi berantai.
 */

export interface StockDataPoint {
  /** epoch millis */
  timestamp: number
  /** level stok pada timestamp tsb */
  quantity: number
}

export interface RegressionModel {
  /** estimasi perubahan stok per hari, negatif bila stok menurun */
  slope: number
  /** intercept regresi konsumsi harian */
  intercept: number
  /** timestamp acuan (hari ke-0) */
  baseTimestamp: number
  /** jumlah titik data konsumsi untuk training */
  n: number
  /** rata-rata konsumsi harian historis */
  avgDailyConsumption: number
  /** konsumsi per day-of-week [0=Sun..6=Sat], untuk kompatibilitas UI lama */
  dowConsumption: number[]
  /** slope regresi konsumsi: konsumsi hari ini terhadap konsumsi kemarin */
  consumptionSlope?: number
  /** intercept regresi konsumsi harian */
  consumptionIntercept?: number
  /** konsumsi terakhir untuk forecast iteratif */
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

interface ConsumptionDataPoint {
  timestamp: number
  consumption: number
}

const MS_PER_DAY = 24 * 60 * 60 * 1000
const CONSUMPTION_EMA_ALPHA = 0.05

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

function buildConsumptionSeries(data: StockDataPoint[]): ConsumptionDataPoint[] {
  const sorted = [...data].sort((a, b) => a.timestamp - b.timestamp)
  const series: ConsumptionDataPoint[] = []

  for (let i = 1; i < sorted.length; i++) {
    const gapDays = (sorted[i].timestamp - sorted[i - 1].timestamp) / MS_PER_DAY
    if (gapDays <= 0) continue

    const stockDelta = sorted[i - 1].quantity - sorted[i].quantity
    const consumption = Math.max(0, stockDelta / gapDays)
    series.push({ timestamp: sorted[i].timestamp, consumption })
  }

  return series
}

function smoothConsumptionSeries(series: ConsumptionDataPoint[]): ConsumptionDataPoint[] {
  if (series.length === 0) return []

  let smoothed = series[0].consumption
  return series.map((point, index) => {
    if (index === 0) {
      return { timestamp: point.timestamp, consumption: smoothed }
    }

    smoothed = CONSUMPTION_EMA_ALPHA * point.consumption + (1 - CONSUMPTION_EMA_ALPHA) * smoothed
    return { timestamp: point.timestamp, consumption: smoothed }
  })
}

function predictNextConsumption(model: RegressionModel, previousConsumption: number): number {
  const intercept = model.consumptionIntercept ?? model.intercept
  const slope = model.consumptionSlope ?? 0
  return Math.max(0, intercept + slope * previousConsumption)
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

function evaluateStockForecast(
  model: RegressionModel,
  historyBeforeTest: StockDataPoint[],
  testData: StockDataPoint[],
): EvaluationMetrics {
  if (historyBeforeTest.length === 0 || testData.length === 0) {
    return { mae: 0, rmse: 0, r2: 0 }
  }

  const test = [...testData].sort((a, b) => a.timestamp - b.timestamp)
  let previousTimestamp = historyBeforeTest[historyBeforeTest.length - 1].timestamp
  let predictedQuantity = historyBeforeTest[historyBeforeTest.length - 1].quantity

  const actual: number[] = []
  const predicted: number[] = []

  for (const point of test) {
    const gapDays = Math.max(1, Math.round((point.timestamp - previousTimestamp) / MS_PER_DAY))

    for (let step = 1; step <= gapDays; step++) {
      predictedQuantity = Math.max(0, predictedQuantity - model.avgDailyConsumption)
    }

    actual.push(point.quantity)
    predicted.push(predictedQuantity)
    previousTimestamp = point.timestamp
  }

  return calculateMetrics(actual, predicted)
}

/**
 * Fit Simple Linear Regression pada konsumsi harian: konsumsi_hari_ini = a + b*konsumsi_kemarin.
 */
export function fitLinearRegression(data: StockDataPoint[]): RegressionModel {
  if (data.length < 2) {
    throw new Error("Minimal 2 titik data diperlukan untuk regresi linear")
  }

  const sorted = [...data].sort((a, b) => a.timestamp - b.timestamp)
  const baseTimestamp = sorted[0].timestamp
  const rawConsumptionSeries = buildConsumptionSeries(sorted)
  const consumptionSeries = smoothConsumptionSeries(rawConsumptionSeries)
  const x: number[] = []
  const y: number[] = []
  for (let i = 1; i < consumptionSeries.length; i++) {
    x.push(consumptionSeries[i - 1].consumption)
    y.push(consumptionSeries[i].consumption)
  }
  const fallbackConsumption = rawConsumptionSeries.at(-1)?.consumption ?? 0
  const { intercept, slope: consumptionSlope } =
    y.length > 0 ? linearRegression(x, y) : { intercept: fallbackConsumption, slope: 0 }

  const avgDailyConsumption = mean(rawConsumptionSeries.map((point) => point.consumption))
  const dowDeltas: number[][] = [[], [], [], [], [], [], []]
  for (const point of rawConsumptionSeries) {
    dowDeltas[new Date(point.timestamp).getDay()].push(point.consumption)
  }
  const dowConsumption = dowDeltas.map((items) => (items.length > 0 ? mean(items) : avgDailyConsumption))

  return {
    slope: -avgDailyConsumption,
    intercept,
    baseTimestamp,
    n: Math.max(1, consumptionSeries.length),
    avgDailyConsumption,
    dowConsumption,
    consumptionSlope,
    consumptionIntercept: intercept,
    lastConsumption: consumptionSeries.at(-1)?.consumption ?? fallbackConsumption,
  }
}

/**
 * Prediksi konsumsi harian berikutnya.
 */
export function predict(model: RegressionModel): number {
  return predictNextConsumption(model, model.lastConsumption ?? model.avgDailyConsumption)
}

/**
 * Hitung metrik evaluasi pada data konsumsi yang dibentuk dari stok historis.
 */
export function evaluate(model: RegressionModel, testData: StockDataPoint[]): EvaluationMetrics {
  const consumptionSeries = smoothConsumptionSeries(buildConsumptionSeries(testData))
  if (consumptionSeries.length === 0) return { mae: 0, rmse: 0, r2: 0 }

  const actual: number[] = []
  const predicted: number[] = []
  for (let i = 1; i < consumptionSeries.length; i++) {
    actual.push(consumptionSeries[i].consumption)
    predicted.push(predictNextConsumption(model, consumptionSeries[i - 1].consumption))
  }

  return calculateMetrics(actual, predicted)
}

/**
 * Bagi data menjadi train/test berdasarkan rasio.
 * Split kronologis (untuk time-series).
 */
export function trainTestSplit(
  data: StockDataPoint[],
  trainRatio = 0.85,
): { train: StockDataPoint[]; test: StockDataPoint[] } {
  const sorted = [...data].sort((a, b) => a.timestamp - b.timestamp)
  const cut = Math.min(sorted.length, Math.max(2, Math.floor(sorted.length * trainRatio)))
  return { train: sorted.slice(0, cut), test: sorted.slice(cut) }
}

/** Perkirakan tanggal stok habis dengan simulasi konsumsi harian. */
export function estimateStockoutDate(model: RegressionModel, currentQty?: number): Date | null {
  let quantity = currentQty ?? 0
  if (quantity <= 0) return new Date()

  const now = Date.now()
  let previousConsumption = model.lastConsumption ?? model.avgDailyConsumption
  for (let day = 1; day <= 3650; day++) {
    const consumption = predictNextConsumption(model, previousConsumption)
    if (consumption <= 0 && model.avgDailyConsumption <= 0) return null

    quantity = Math.max(0, quantity - consumption)
    previousConsumption = consumption
    if (quantity <= 0) return new Date(now + day * MS_PER_DAY)
  }

  return null
}

/**
 * Pipeline lengkap: fit Linear Regression konsumsi, evaluate, forecast stok iteratif.
 */
export function predictStock(
  data: StockDataPoint[],
  options: { horizonDays?: number; stepDays?: number; trainRatio?: number } = {},
): PredictionResult {
  const { horizonDays = 14, stepDays = 1, trainRatio = 0.85 } = options

  const sorted = [...data].sort((a, b) => a.timestamp - b.timestamp)
  const { train, test } = trainTestSplit(sorted, trainRatio)
  const model = fitLinearRegression(train)
  const metrics = evaluate(model, sorted)

  const lastTimestamp = sorted[sorted.length - 1].timestamp
  const lastQuantity = sorted[sorted.length - 1].quantity
  let currentQuantity = lastQuantity
  let previousConsumption = model.lastConsumption ?? model.avgDailyConsumption

  const forecast: PredictionResult["forecast"] = []
  for (let day = stepDays; day <= horizonDays; day += stepDays) {
    const timestamp = lastTimestamp + day * MS_PER_DAY
    const dailyConsumption = predictNextConsumption(model, previousConsumption)
    currentQuantity = Math.max(0, currentQuantity - dailyConsumption * stepDays)
    previousConsumption = dailyConsumption

    forecast.push({
      timestamp,
      predictedQuantity: Math.round(currentQuantity * 10) / 10,
      estimatedConsumption: Math.round(dailyConsumption * 10) / 10,
    })
  }

  return {
    model,
    metrics,
    forecast,
    stockoutDate: estimateStockoutDate(model, lastQuantity),
  }
}

/**
 * Bangun time-series stok harian dari daftar transaksi (in/out/adjustment).
 *
 * @param transactions daftar transaksi
 * @param currentQuantity level stok saat ini (snapshot terakhir)
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
