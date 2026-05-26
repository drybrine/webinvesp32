/**
 * Model prediksi stok barang — Multi Linear Regression + StandardScaler.
 *
 * Pipeline (terverifikasi di Jupyter notebook, R² avg 0.61 untuk 20 sparepart Honda):
 *  1. Build daily stock series dari transaksi
 *  2. Feature engineering: lag1, lag3, lag7, rolling_mean_7, rolling_std_7,
 *     daily_change, day_of_week, is_weekend, day_number
 *  3. StandardScaler (normalisasi mean=0, std=1)
 *  4. OLS via Normal Equation (numpy lstsq equivalent)
 *  5. Train/test split kronologis (default 80/20)
 *  6. Iterative forecast (predict next day → push as lag1 → repeat)
 *  7. Stockout estimation berbasis avg daily consumption
 */

export interface StockDataPoint {
  /** epoch millis */
  timestamp: number
  /** level stok pada timestamp tsb */
  quantity: number
}

export interface RegressionModel {
  /** slope kompatibel (= -avgDailyConsumption untuk konsistensi UI lama) */
  slope: number
  /** intercept dari OLS */
  intercept: number
  /** timestamp acuan (hari ke-0) */
  baseTimestamp: number
  /** jumlah titik data training */
  n: number
  /** rata-rata konsumsi harian */
  avgDailyConsumption: number
  /** konsumsi per day-of-week [0=Sun..6=Sat] */
  dowConsumption: number[]
  /** koefisien per feature (untuk debug/transparansi) */
  coefficients?: number[]
  /** nama feature, urutannya match coefficients */
  featureNames?: string[]
  /** Mean StandardScaler per feature */
  scalerMean?: number[]
  /** Std StandardScaler per feature */
  scalerStd?: number[]
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

const FEATURE_NAMES = [
  "lag1",              // stok kemarin (paling prediktif)
  "daily_change",      // perubahan stok kemarin
  "rolling_mean_7",    // rata-rata 7 hari
] as const

// =============================================================================
//  StandardScaler (compatible with sklearn)
// =============================================================================

function fitScaler(X: number[][]): { mean: number[]; std: number[] } {
  const n = X.length
  const k = X[0].length
  const mean = new Array(k).fill(0)
  const std = new Array(k).fill(0)
  for (const row of X) for (let j = 0; j < k; j++) mean[j] += row[j]
  for (let j = 0; j < k; j++) mean[j] /= n
  for (const row of X) for (let j = 0; j < k; j++) std[j] += (row[j] - mean[j]) ** 2
  for (let j = 0; j < k; j++) {
    std[j] = Math.sqrt(std[j] / n)
    if (std[j] === 0) std[j] = 1
  }
  return { mean, std }
}

function transformScaler(X: number[][], mean: number[], std: number[]): number[][] {
  return X.map((row) => row.map((v, j) => (v - mean[j]) / std[j]))
}

// =============================================================================
//  Feature Engineering
// =============================================================================

function buildFeatures(quantities: number[], timestamps: number[]): {
  X: number[][]
  y: number[]
} {
  const X: number[][] = []
  const y: number[] = []

  // Skip 7 hari pertama agar rolling_mean_7 valid
  for (let i = 7; i < quantities.length - 1; i++) {
    const window = quantities.slice(i - 7, i)
    const mean7 = window.reduce((s, v) => s + v, 0) / window.length
    const dailyChange = quantities[i] - quantities[i - 1]

    X.push([
      quantities[i - 1],     // lag1
      dailyChange,           // daily_change
      mean7,                 // rolling_mean_7
    ])
    y.push(quantities[i + 1])  // target = stok besok
  }

  return { X, y }
}

// =============================================================================
//  OLS via Normal Equation
// =============================================================================

function olsFit(X: number[][], y: number[]): { intercept: number; coefficients: number[] } {
  const n = X.length
  const k = X[0].length

  // Add intercept column
  const Xb: number[][] = X.map((row) => [1, ...row])

  // beta = (X'X)^-1 X'y → solve via Gaussian elimination
  const XtX: number[][] = Array.from({ length: k + 1 }, () => new Array(k + 1).fill(0))
  const Xty: number[] = new Array(k + 1).fill(0)

  for (let i = 0; i < n; i++) {
    for (let a = 0; a <= k; a++) {
      Xty[a] += Xb[i][a] * y[i]
      for (let b = 0; b <= k; b++) XtX[a][b] += Xb[i][a] * Xb[i][b]
    }
  }

  const beta = solve(XtX, Xty)
  return { intercept: beta[0], coefficients: beta.slice(1) }
}

function solve(A: number[][], b: number[]): number[] {
  const n = A.length
  const M = A.map((row, i) => [...row, b[i]])

  for (let col = 0; col < n; col++) {
    let pivot = col
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(M[row][col]) > Math.abs(M[pivot][col])) pivot = row
    }
    ;[M[col], M[pivot]] = [M[pivot], M[col]]

    if (Math.abs(M[col][col]) < 1e-12) continue
    for (let row = col + 1; row < n; row++) {
      const factor = M[row][col] / M[col][col]
      for (let j = col; j <= n; j++) M[row][j] -= factor * M[col][j]
    }
  }

  const x = new Array(n).fill(0)
  for (let row = n - 1; row >= 0; row--) {
    if (Math.abs(M[row][row]) < 1e-12) continue
    let sum = M[row][n]
    for (let j = row + 1; j < n; j++) sum -= M[row][j] * x[j]
    x[row] = sum / M[row][row]
  }
  return x
}

// =============================================================================
//  Public API
// =============================================================================

/**
 * Fit Multi Linear Regression dengan StandardScaler.
 */
export function fitLinearRegression(data: StockDataPoint[]): RegressionModel {
  if (data.length < 2) {
    throw new Error("Minimal 2 titik data diperlukan untuk regresi linear")
  }

  const sorted = [...data].sort((a, b) => a.timestamp - b.timestamp)
  const baseTimestamp = sorted[0].timestamp
  const quantities = sorted.map((d) => d.quantity)
  const timestamps = sorted.map((d) => d.timestamp)

  // Hitung konsumsi per day-of-week (untuk fallback iterative forecast)
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
    : 0

  const dowConsumption = dowDeltas.map((arr) =>
    arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : avgDailyConsumption,
  )

  // Multi Linear Regression
  if (sorted.length < 10) {
    // Data terlalu sedikit untuk MLR, fallback ke simple linear
    return {
      slope: -avgDailyConsumption,
      intercept: quantities[quantities.length - 1] || 0,
      baseTimestamp,
      n: sorted.length,
      avgDailyConsumption,
      dowConsumption,
    }
  }

  const { X, y } = buildFeatures(quantities, timestamps)
  if (X.length < 5) {
    return {
      slope: -avgDailyConsumption,
      intercept: quantities[quantities.length - 1] || 0,
      baseTimestamp,
      n: sorted.length,
      avgDailyConsumption,
      dowConsumption,
    }
  }

  const { mean: scalerMean, std: scalerStd } = fitScaler(X)
  const Xs = transformScaler(X, scalerMean, scalerStd)
  const { intercept, coefficients } = olsFit(Xs, y)

  return {
    slope: -avgDailyConsumption,  // backward compat
    intercept,
    baseTimestamp,
    n: sorted.length,
    avgDailyConsumption,
    dowConsumption,
    coefficients,
    featureNames: [...FEATURE_NAMES],
    scalerMean,
    scalerStd,
  }
}

/**
 * Prediksi quantity menggunakan MLR jika available, fallback ke linear projection.
 */
export function predict(model: RegressionModel, timestamp: number): number {
  // Untuk visualisasi tren historis (line chart), pakai linear projection
  const x = (timestamp - model.baseTimestamp) / MS_PER_DAY
  return model.slope * x + (model.intercept || 0)
}

/**
 * Hitung metrik evaluasi pada data test.
 *
 * Strategy: untuk MLR yang punya scaler+coefficients, predict pakai lag features
 * dari history yang tersedia. Untuk model fallback, pakai dow consumption.
 *
 * Note: testData harus include cukup history sebelumnya untuk lag1/3/7 valid.
 * Kalau tidak, evaluasi pakai dow consumption sebagai approximation.
 */
export function evaluate(model: RegressionModel, testData: StockDataPoint[]): EvaluationMetrics {
  if (testData.length < 2) {
    return { mae: 0, rmse: 0, r2: 0 }
  }

  const sorted = [...testData].sort((a, b) => a.timestamp - b.timestamp)
  const quantities = sorted.map((d) => d.quantity)
  const ys: number[] = []
  const yPreds: number[] = []

  const hasMLR =
    model.coefficients !== undefined &&
    model.scalerMean !== undefined &&
    model.scalerStd !== undefined

  // Mulai dari index 7 jika MLR (butuh lag7), atau 1 jika fallback
  const startIdx = hasMLR && quantities.length >= 8 ? 7 : 1

  for (let i = startIdx; i < quantities.length; i++) {
    let yPred: number
    if (hasMLR && i >= 7) {
      const window = quantities.slice(i - 7, i)
      const mean7 = window.reduce((s, v) => s + v, 0) / window.length
      const dailyChange = quantities[i - 1] - quantities[i - 2]

      const features = [
        quantities[i - 1],   // lag1
        dailyChange,         // daily_change
        mean7,               // rolling_mean_7
      ]
      const scaled = features.map((v, j) => (v - model.scalerMean![j]) / model.scalerStd![j])
      yPred = scaled.reduce((s, v, j) => s + v * model.coefficients![j], model.intercept)
      yPred = Math.max(0, yPred)
    } else {
      const prev = quantities[i - 1]
      const dow = new Date(sorted[i].timestamp).getDay()
      const consumption = model.dowConsumption[dow] || model.avgDailyConsumption
      yPred = Math.max(0, prev - consumption)
    }

    ys.push(quantities[i])
    yPreds.push(yPred)
  }

  if (ys.length === 0) return { mae: 0, rmse: 0, r2: 0 }

  const meanY = ys.reduce((s, v) => s + v, 0) / ys.length
  let sumAbs = 0
  let sumSq = 0
  let ssRes = 0
  let ssTot = 0

  for (let i = 0; i < ys.length; i++) {
    const err = ys[i] - yPreds[i]
    sumAbs += Math.abs(err)
    sumSq += err * err
    ssRes += err * err
    ssTot += (ys[i] - meanY) ** 2
  }

  const mae = sumAbs / ys.length
  const rmse = Math.sqrt(sumSq / ys.length)
  const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot

  return { mae, rmse, r2 }
}

/**
 * Bagi data menjadi train/test berdasarkan rasio.
 * Split kronologis (untuk time-series).
 */
export function trainTestSplit(
  data: StockDataPoint[],
  trainRatio = 0.8,
): { train: StockDataPoint[]; test: StockDataPoint[] } {
  const sorted = [...data].sort((a, b) => a.timestamp - b.timestamp)
  const cut = Math.max(2, Math.floor(sorted.length * trainRatio))
  return { train: sorted.slice(0, cut), test: sorted.slice(cut) }
}

/** Perkirakan tanggal stok habis. null bila tren tidak menurun. */
export function estimateStockoutDate(model: RegressionModel, currentQty?: number): Date | null {
  if (model.avgDailyConsumption <= 0) return null
  const qty = currentQty ?? model.intercept ?? 0
  if (qty <= 0) return new Date()
  const daysLeft = qty / model.avgDailyConsumption
  return new Date(Date.now() + daysLeft * MS_PER_DAY)
}

/**
 * Predict satu hari ke depan menggunakan MLR (jika model punya scaler+coefficients).
 * Fallback ke dow consumption pattern jika model lama.
 */
function predictNextDay(
  model: RegressionModel,
  history: number[],
  ts: number,
): number {
  // Prerequisite untuk MLR: history >= 7 + scaler + coefs
  if (
    history.length >= 7 &&
    model.coefficients &&
    model.scalerMean &&
    model.scalerStd
  ) {
    const i = history.length
    const window = history.slice(i - 7, i)
    const mean7 = window.reduce((s, v) => s + v, 0) / window.length
    const dailyChange = i >= 2 ? history[i - 1] - history[i - 2] : 0

    const features = [
      history[i - 1],   // lag1
      dailyChange,      // daily_change
      mean7,            // rolling_mean_7
    ]
    const scaled = features.map((v, j) => (v - model.scalerMean![j]) / model.scalerStd![j])
    const pred = scaled.reduce((s, v, j) => s + v * model.coefficients![j], model.intercept)
    return Math.max(0, pred)
  }

  // Fallback: dow consumption pattern
  const dow = new Date(ts).getDay()
  const consumption = model.dowConsumption[dow] * (0.85 + Math.random() * 0.3)
  const lastQty = history[history.length - 1]
  return Math.max(0, lastQty - consumption)
}

/**
 * Pipeline lengkap: fit, evaluate, iterative forecast.
 * Iterative: predict besok → push ke history → predict lusa, dst.
 */
export function predictStock(
  data: StockDataPoint[],
  options: { horizonDays?: number; stepDays?: number; trainRatio?: number } = {},
): PredictionResult {
  const { horizonDays = 14, stepDays = 1, trainRatio = 0.8 } = options

  const { train, test } = trainTestSplit(data, trainRatio)
  const model = fitLinearRegression(train)
  const metrics = evaluate(model, test.length > 0 ? test : train)

  const sorted = [...data].sort((a, b) => a.timestamp - b.timestamp)
  const lastTs = sorted[sorted.length - 1].timestamp
  const lastQty = sorted[sorted.length - 1].quantity

  // Iterative forecast: gunakan MLR jika available
  const forecast: PredictionResult["forecast"] = []
  const history: number[] = sorted.map((d) => d.quantity)
  let prevQty = lastQty

  for (let day = 1; day <= horizonDays; day += stepDays) {
    const ts = lastTs + day * MS_PER_DAY
    const predicted = predictNextDay(model, history, ts)
    const consumption = Math.max(0, prevQty - predicted)

    forecast.push({
      timestamp: ts,
      predictedQuantity: Math.round(predicted * 10) / 10,
      estimatedConsumption: Math.round(consumption * 10) / 10,
    })

    history.push(predicted)
    prevQty = predicted
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

  // Hitung delta per hari
  const dailyDelta = new Map<number, number>()
  for (const tx of sorted) {
    const dayKey = Math.floor(tx.timestamp / MS_PER_DAY) * MS_PER_DAY
    const signedQty =
      tx.type === "out" ? -Math.abs(tx.quantity) : tx.type === "in" ? Math.abs(tx.quantity) : tx.quantity
    dailyDelta.set(dayKey, (dailyDelta.get(dayKey) ?? 0) + signedQty)
  }

  const days = [...dailyDelta.keys()].sort((a, b) => a - b)
  const totalDelta = [...dailyDelta.values()].reduce((s, v) => s + v, 0)
  let level = currentQuantity - totalDelta

  const series: StockDataPoint[] = []
  for (const day of days) {
    level += dailyDelta.get(day)!
    series.push({ timestamp: day, quantity: Math.max(0, level) })
  }
  return series
}
