/**
 * Model prediksi stok barang - Simple Linear Regression (lag-1 harian + EMA).
 *
 * Identik dengan model notebook `scripts/model_prediksi_stok_linear_regression.ipynb`:
 *   transaksi → level stok harian (buildDailySeriesFromTransactions, semua type in/out/adjustment)
 *   → konsumsi harian antar hari transaksi (buildConsumptionSeries)
 *   → EMA smoothing (alpha 0.05)
 *   → regresi lag-1: Y = a + b·X (X = konsumsi EMA kemarin, Y = konsumsi EMA hari ini)
 *   → forecast iteratif stok dengan predictNextConsumption
 *
 * Evaluasi (in-sample pada deret penuh, model di-fit dari train) menghasilkan R² pada
 * selang 0..1 — bandingkan dengan PowerPoint/notebook.
 */

export interface StockDataPoint {
  /** epoch millis (start of day) */
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
  /** estimasi perubahan stok per hari, negatif bila stok menurun (=-avgDailyConsumption) */
  slope: number
  /** intercept regresi lag-1 konsumsi (konsumsi saat X=0) */
  intercept: number
  /** alias intercept (konsumsiIntercept) */
  consumptionIntercept: number
  /** slope regresi lag-1 konsumsi (pengaruh konsumsi kemarin terhadap hari ini) */
  consumptionSlope: number
  /** rata-rata konsumsi harian historis (raw, tanpa EMA) */
  avgDailyConsumption: number
  /** jumlah titik konsumsi (EMA) untuk training */
  n: number
  /** konsumsi EMA terakhir (seed forecast iteratif) */
  lastConsumption: number
  /** timestamp acuan (hari ke-0 dari data stok pertama) */
  baseTimestamp: number
  /** total konsumsi historis (raw) */
  totalConsumption: number
  /** konsumsi per day-of-week [0=Mon..6=Sun] (untuk kompatibilitas UI; tidak dipakai model) */
  dowConsumption: number[]
  /** alpha EMA yang dipakai model (hasil auto-tune atau default 0.05) */
  emaAlpha?: number
}

export interface EvaluationMetrics {
  /** MAE konsumsi harian pada holdout (unit stok/hari) */
  mae: number
  /** RMSE konsumsi harian pada holdout */
  rmse: number
  /** MAPE konsumsi harian pada holdout (%) */
  mape: number
  /** R² deret konsumsi lag-1: aktual vs â + b̂·X (selang 0..1) */
  r2: number
  /** selalu true pada model lag-1 (metrik dihitung in-sample) */
  available?: boolean
  nTrain?: number
  nTest?: number
}

export interface PredictionResult {
  model: RegressionModel
  metrics: EvaluationMetrics
  /** Prediksi untuk horizon ke depan */
  forecast: Array<{ timestamp: number; predictedQuantity: number; estimatedConsumption: number }>
  /** Perkiraan tanggal habis stok (null jika konsumsi tidak terprediksi) */
  stockoutDate: Date | null
  /** Jumlah hari hingga stok habis (null = tidak habis dalam 3650 hari) */
  daysToStockout: number | null
}

export const MS_PER_DAY = 24 * 60 * 60 * 1000
/** Alpha EMA default (mirror notebook). Bisa di-tune per item via tuneEmaAlpha. */
export const CONSUMPTION_EMA_ALPHA = 0.05
/** Grid alpha EMA untuk auto-tuning per item (validasi kronologis). */
const EMA_ALPHA_GRID = [0.05, 0.1, 0.15, 0.2, 0.3, 0.5]
/** Minimal titik konsumsi raw agar tuning dijalankan. */
const TUNE_MIN_POINTS = 10
/** Clamp atas slope AR(1): |b| < 1 menjaga forecast iteratif tetap konvergen. */
const CONSUMPTION_SLOPE_MAX = 0.95

function dayTimestamp(timestamp = Date.now()): number {
  return Math.floor(timestamp / MS_PER_DAY) * MS_PER_DAY
}

/** Stok barang selalu bilangan bulat. */
function roundInt(value: number): number {
  return Math.round(value)
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
    return { mae: 0, rmse: 0, mape: 0, r2: 0, available: true }
  }

  const meanActual = mean(actual)
  let sumAbs = 0
  let sumSq = 0
  let ssRes = 0
  let ssTot = 0
  const nonZeroErrors: number[] = []

  for (let i = 0; i < actual.length; i++) {
    const error = actual[i] - predicted[i]
    sumAbs += Math.abs(error)
    sumSq += error * error
    ssRes += error * error
    ssTot += (actual[i] - meanActual) ** 2
    if (actual[i] !== 0) nonZeroErrors.push(Math.abs(error / actual[i]) * 100)
  }

  const mae = sumAbs / actual.length
  const rmse = Math.sqrt(sumSq / actual.length)
  const mape = mean(nonZeroErrors)
  const r2 = ssTot === 0 ? (ssRes === 0 ? 1 : 0) : 1 - ssRes / ssTot

  return { mae, rmse, mape, r2, available: true }
}

/**
 * Rekonstruksi level stok harian dari transaksi (dipakai semua type: in/out/adjustment)
 * dan stok saat ini. Menghasilkan titik hanya pada hari yang ada transaksi, mirror
 * `build_daily_series` notebook. Kuantitas dibulatkan ke integer (sama seperti notebook).
 */
export function buildDailySeriesFromTransactions(
  transactions: Array<{ timestamp: number; quantity: number; type?: "in" | "out" | "adjustment" }>,
  currentQuantity: number,
): StockDataPoint[] {
  const dailyDelta = new Map<number, number>()
  for (const tx of transactions) {
    const ts = Math.trunc(Number(tx.timestamp) || 0)
    const qty = Math.trunc(Number(tx.quantity) || 0)
    const type = tx.type ?? "out"
    const signedQty = type === "out" ? -Math.abs(qty) : type === "in" ? Math.abs(qty) : qty
    const key = dayTimestamp(ts)
    dailyDelta.set(key, (dailyDelta.get(key) ?? 0) + signedQty)
  }

  const days = [...dailyDelta.keys()].sort((a, b) => a - b)
  if (days.length === 0) return []

  const totalDelta = [...dailyDelta.values()].reduce((sum, value) => sum + value, 0)
  let level = Number(currentQuantity) - totalDelta

  const series: StockDataPoint[] = []
  for (const day of days) {
    level += dailyDelta.get(day)!
    series.push({ timestamp: day, quantity: Math.max(0, level) })
  }
  return series
}

/**
 * Deret konsumsi harian antar hari transaksi (delta stok dibagi selang hari).
 * Mirror `build_consumption_series` notebook.
 */
export function buildConsumptionSeries(stockSeries: StockDataPoint[]): DailyConsumptionPoint[] {
  const sorted = [...stockSeries].sort((a, b) => a.timestamp - b.timestamp)
  const consumption: DailyConsumptionPoint[] = []
  for (let i = 1; i < sorted.length; i++) {
    const gapDays = (sorted[i].timestamp - sorted[i - 1].timestamp) / MS_PER_DAY
    if (gapDays <= 0) continue
    const stockDelta = sorted[i - 1].quantity - sorted[i].quantity
    const dailyConsumption = Math.max(0, stockDelta / gapDays)
    consumption.push({ timestamp: sorted[i].timestamp, consumption: dailyConsumption })
  }
  return consumption
}

/** EMA smoothing deret konsumsi (default alpha 0.05). Mirror `smooth_consumption_series`. */
export function smoothConsumptionSeries(
  series: DailyConsumptionPoint[],
  alpha: number = CONSUMPTION_EMA_ALPHA,
): DailyConsumptionPoint[] {
  if (series.length === 0) return []
  let smoothed = series[0].consumption
  const result: DailyConsumptionPoint[] = []
  for (let i = 0; i < series.length; i++) {
    if (i > 0) {
      smoothed = alpha * series[i].consumption + (1 - alpha) * smoothed
    }
    result.push({ timestamp: series[i].timestamp, consumption: smoothed })
  }
  return result
}

/** Pasangan lag-1 (X = konsumsi kemarin, Y = konsumsi hari ini) untuk regresi. */
function buildLagPairs(consumptionSeries: DailyConsumptionPoint[]): { x: number[]; y: number[] } {
  const x: number[] = []
  const y: number[] = []
  for (let i = 1; i < consumptionSeries.length; i++) {
    x.push(consumptionSeries[i - 1].consumption)
    y.push(consumptionSeries[i].consumption)
  }
  return { x, y }
}

/**
 * Auto-tune alpha EMA per item: grid search dengan validasi kronologis
 * (one-step-ahead MAE pada 20% akhir deret). Default 0.05 ikut di grid,
 * sehingga tuning hanya mengubah alpha bila terbukti lebih baik di validasi.
 */
export function tuneEmaAlpha(stockSeries: StockDataPoint[]): number {
  const raw = buildConsumptionSeries(stockSeries)
  if (raw.length < TUNE_MIN_POINTS) return CONSUMPTION_EMA_ALPHA

  let bestAlpha = CONSUMPTION_EMA_ALPHA
  let bestMae = Infinity

  for (const alpha of EMA_ALPHA_GRID) {
    const { x, y } = buildLagPairs(smoothConsumptionSeries(raw, alpha))
    const trainEnd = Math.max(4, Math.floor(x.length * 0.8))
    const valCount = x.length - trainEnd
    if (valCount < 2) continue

    const { intercept, slope } = linearRegression(x.slice(0, trainEnd), y.slice(0, trainEnd))
    let sumAbs = 0
    for (let i = trainEnd; i < x.length; i++) {
      const predicted = Math.max(0, intercept + slope * x[i])
      sumAbs += Math.abs(y[i] - predicted)
    }
    const mae = sumAbs / valCount
    if (mae < bestMae) {
      bestMae = mae
      bestAlpha = alpha
    }
  }

  return bestAlpha
}

/**
 * Fit Simple Linear Regression lag-1 pada konsumsi EMA terhadap nilai hari sebelumnya.
 * slope = consumptionSlope; avgDailyConsumption = rata-rata konsumsi raw.
 */
export function fitRegressionModel(
  stockSeries: StockDataPoint[],
  options: { emaAlpha?: number } = {},
): RegressionModel {
  const emaAlpha = options.emaAlpha ?? CONSUMPTION_EMA_ALPHA
  const sorted = [...stockSeries].sort((a, b) => a.timestamp - b.timestamp)
  const rawConsumptionSeries = buildConsumptionSeries(sorted)
  const consumptionSeries = smoothConsumptionSeries(rawConsumptionSeries, emaAlpha)
  const { x, y } = buildLagPairs(consumptionSeries)

  const fallbackConsumption =
    rawConsumptionSeries.length > 0 ? rawConsumptionSeries[rawConsumptionSeries.length - 1].consumption : 0
  let intercept: number
  let consumptionSlope: number
  if (y.length > 0) {
    const { intercept: i0, slope: s0 } = linearRegression(x, y)
    intercept = i0
    // Stabilisasi AR(1): slope >= 1 membuat forecast iteratif divergen.
    consumptionSlope = Math.min(s0, CONSUMPTION_SLOPE_MAX)
  } else {
    intercept = fallbackConsumption
    consumptionSlope = 0
  }

  const avgDaily = mean(rawConsumptionSeries.map((p) => p.consumption))
  const lastConsumption =
    consumptionSeries.length > 0 ? consumptionSeries[consumptionSeries.length - 1].consumption : fallbackConsumption

  return {
    slope: -avgDaily,
    intercept,
    consumptionIntercept: intercept,
    consumptionSlope,
    avgDailyConsumption: avgDaily,
    n: Math.max(1, consumptionSeries.length),
    lastConsumption,
    baseTimestamp: sorted.length > 0 ? sorted[0].timestamp : Date.now(),
    totalConsumption: rawConsumptionSeries.reduce((sum, p) => sum + p.consumption, 0),
    dowConsumption: [],
    emaAlpha,
  }
}

export function predictNextConsumption(model: RegressionModel, previousConsumption: number): number {
  const predicted = model.consumptionIntercept + model.consumptionSlope * previousConsumption
  return Math.max(0, predicted)
}

/**
 * Evaluasi model pada deret stok penuh (in-sample): prediksi konsumsi lag-1 vs aktual EMA.
 * Mirror `evaluate_consumption` notebook.
 */
export function evaluateModel(
  model: RegressionModel,
  stockSeries: StockDataPoint[],
  options: { emaAlpha?: number } = {},
): EvaluationMetrics {
  const consumptionSeries = smoothConsumptionSeries(
    buildConsumptionSeries(stockSeries),
    options.emaAlpha ?? model.emaAlpha ?? CONSUMPTION_EMA_ALPHA,
  )
  if (consumptionSeries.length === 0) {
    return { mae: 0, rmse: 0, mape: 0, r2: 0, available: true }
  }
  const actual: number[] = []
  const predicted: number[] = []
  for (let i = 1; i < consumptionSeries.length; i++) {
    actual.push(consumptionSeries[i].consumption)
    predicted.push(predictNextConsumption(model, consumptionSeries[i - 1].consumption))
  }
  return calculateMetrics(actual, predicted)
}

/**
 * Perkirakan tanggal stok habis dengan iterasi harian prediksi konsumsi.
 * Mirror `estimate_stockout_date` notebook.
 */
export function estimateStockoutDate(
  model: RegressionModel,
  currentQuantity: number,
  baseTimestamp = Date.now(),
): Date | null {
  const baseDate = new Date(baseTimestamp)
  if (currentQuantity <= 0) return baseDate

  let quantity = Number(currentQuantity)
  let previousConsumption =
    model.lastConsumption !== undefined ? model.lastConsumption : model.avgDailyConsumption

  for (let day = 1; day <= 3650; day++) {
    const consumption = predictNextConsumption(model, previousConsumption)
    if (consumption <= 0 && model.avgDailyConsumption <= 0) return null
    quantity = Math.max(0, quantity - consumption)
    previousConsumption = consumption
    if (quantity <= 0) return new Date(baseTimestamp + day * MS_PER_DAY)
  }
  return null
}

/**
 * Pipeline lengkap mirror `predict_stock` notebook:
 *   split kronologis train/test (rasio), fit model dari TRAIN,
 *   evaluasi pada deret penuh, forecast iteratif dari stok terakhir.
 *
 * @param stockSeries  deret stok harian (lihat buildDailySeriesFromTransactions)
 */
export function predictStock(
  stockSeries: StockDataPoint[],
  options: { horizonDays?: number; trainRatio?: number } = {},
): PredictionResult {
  const { horizonDays = 14, trainRatio = 0.85 } = options
  const sorted = [...stockSeries].sort((a, b) => a.timestamp - b.timestamp)
  if (sorted.length < 2) {
    throw new Error("Minimal 2 titik data diperlukan untuk regresi linear")
  }

  const splitIdx = Math.min(sorted.length, Math.max(2, Math.floor(sorted.length * trainRatio)))
  const train = sorted.slice(0, splitIdx)
  const test = sorted.slice(splitIdx)

  const emaAlpha = tuneEmaAlpha(sorted)
  const model = fitRegressionModel(train, { emaAlpha })
  const metrics = evaluateModel(model, sorted, { emaAlpha })

  const lastQty = sorted[sorted.length - 1].quantity
  const lastTs = sorted[sorted.length - 1].timestamp
  let currentQty = lastQty
  let previousConsumption = model.lastConsumption

  const forecast: PredictionResult["forecast"] = []
  for (let day = 1; day <= horizonDays; day++) {
    const timestamp = lastTs + day * MS_PER_DAY
    const predictedConsumption = predictNextConsumption(model, previousConsumption)
    currentQty = Math.max(0, currentQty - predictedConsumption)
    previousConsumption = predictedConsumption
    forecast.push({
      timestamp: Math.trunc(timestamp),
      predictedQuantity: roundInt(currentQty),
      estimatedConsumption: roundInt(predictedConsumption),
    })
  }

  return {
    model,
    metrics: { ...metrics, nTrain: Math.max(1, train.length - 1), nTest: test.length },
    forecast,
    stockoutDate: estimateStockoutDate(model, lastQty, lastTs),
    daysToStockout: estimateStockoutDays(model, lastQty),
  }
}

/** Jumlah hari hingga stok habis (null = tidak habis dalam 3650 hari). */
function estimateStockoutDays(model: RegressionModel, currentQuantity: number): number | null {
  if (currentQuantity <= 0) return 0
  let quantity = Number(currentQuantity)
  let previousConsumption =
    model.lastConsumption !== undefined ? model.lastConsumption : model.avgDailyConsumption
  for (let day = 1; day <= 3650; day++) {
    const consumption = predictNextConsumption(model, previousConsumption)
    if (consumption <= 0 && model.avgDailyConsumption <= 0) return null
    quantity = Math.max(0, quantity - consumption)
    previousConsumption = consumption
    if (quantity <= 0) return day
  }
  return null
}

/**
 * @deprecated Model konsumsi lama (kumulatif OLS) sudah digantikan model lag-1 notebook.
 * Dipertahankan hanya untuk kompatibilitas script test lama — jangan dipakai di UI.
 */
export function buildConsumptionFromTransactions(
  transactions: Array<{ timestamp: number; quantity: number; type?: "in" | "out" | "adjustment" }>,
  endTimestamp?: number,
): DailyConsumptionPoint[] {
  const dailyConsumption = new Map<number, number>()
  for (const tx of transactions) {
    if (tx.type !== "out") continue
    if (!Number.isFinite(tx.timestamp) || tx.timestamp <= 0 || !Number.isFinite(tx.quantity)) continue
    const dayKey = dayTimestamp(tx.timestamp)
    dailyConsumption.set(dayKey, (dailyConsumption.get(dayKey) ?? 0) + Math.abs(tx.quantity))
  }
  if (dailyConsumption.size === 0) return []

  const days = [...dailyConsumption.keys()].sort((a, b) => a - b)
  let end = days[days.length - 1]
  if (endTimestamp != null) end = Math.max(end, dayTimestamp(endTimestamp))

  const filled: DailyConsumptionPoint[] = []
  for (let ts = days[0]; ts <= end; ts += MS_PER_DAY) {
    filled.push({ timestamp: ts, consumption: dailyConsumption.get(ts) ?? 0 })
  }
  return filled
}

/**
 * @deprecated Gunakan buildDailySeriesFromTransactions untuk model baru.
 * Rekonstruksi level stok dari transaksi (konservatif, backward dari currentQuantity).
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
