/**
 * Generator data realistis 1 tahun untuk 20 suku cadang motor Honda.
 * Produk asli dari katalog hondacengkareng.com (sama dengan notebook Colab).
 *
 * Pola:
 *  - OUT: pemakaian bengkel 1–3 unit/transaksi (bukan bulk)
 *  - IN: restock supplier per dus/box (reorderQty, jitter ±10%)
 *  - Weekend sepi, dead day ~8%, busy day ~5%, efek gajian (25–31) +25%
 *  - ADJ: stock opname berkala (koreksi ±1–2 unit)
 *  - Restock saat stok ≤ minStock & cooldown ≥ 7 hari
 *
 * Prediksi hanya belajar dari type=out → bulk IN tidak menggelembungkan konsumsi.
 *
 * Cara pakai:
 *   npx tsx scripts/generate-honda-dummy.ts                  # generate + test prediksi
 *   npx tsx scripts/generate-honda-dummy.ts --dry-run        # ringkasan tanpa prediksi detail
 *   npx tsx scripts/generate-honda-dummy.ts --output out.json
 *   npx tsx scripts/generate-honda-dummy.ts --days 365
 *   npx tsx scripts/generate-honda-dummy.ts --firebase --confirm
 *
 * --firebase --confirm:
 *   - HANYA 20 part Honda (scoped)
 *   - hapus transaksi lama milik barcode/itemId Honda
 *   - tulis transaksi baru + patch inventory quantity
 *   - TIDAK full-tree PUT (aman untuk data non-Honda)
 */

import { writeFileSync, mkdirSync, existsSync, unlinkSync } from "node:fs"
import { resolve } from "node:path"
import { execFileSync } from "node:child_process"
import {
  buildDailySeriesFromTransactions,
  predictStock,
} from "../lib/stock-prediction"

const MS_PER_DAY = 24 * 60 * 60 * 1000
const PROJECT_ID = "barcodescanesp32"
const DATABASE_URL =
  "https://barcodescanesp32-default-rtdb.asia-southeast1.firebasedatabase.app"
const WRITE_CHUNK = 400

// =============================================================================
//  DATASET 20 SUKU CADANG HONDA (produk asli hondacengkareng.com — sama dengan
//  notebook scripts/stock_forecast_colab.ipynb)
// =============================================================================

interface SparePart {
  id: string
  name: string
  barcode: string
  category: string
  initialStock: number
  avgDailyConsumption: number
  reorderQty: number
  minStock: number
}

/** EAN-13 valid: hitung check digit dari 12 digit basis. */
function ean13(base12: string): string {
  let sum = 0
  for (let i = 0; i < 12; i++) {
    sum += Number(base12[i]) * (i % 2 === 0 ? 1 : 3)
  }
  return base12 + String((10 - (sum % 10)) % 10)
}

/** Barcode internal gudang 8992017000NN + check digit EAN-13 valid. */
function partBarcode(index: number): string {
  return ean13(`8992017000${String(index).padStart(2, "0")}`)
}

interface PartSeed {
  name: string
  slug: string
  category: string
  /** demand harian rata-rata (unit/hari) — dari notebook */
  dailyDemand: number
  /** kapasitas rak — dari notebook */
  capacity: number
  minStock: number
}

const PART_SEEDS: PartSeed[] = [
  { name: "Seal Klep Honda BeAT FI", slug: "seal-klep-beat-fi", category: "Seal & Gasket", dailyDemand: 3.0, capacity: 40, minStock: 5 },
  { name: "Karet Kampas Ganda Honda BeAT/Vario/Scoopy", slug: "karet-kampas-ganda", category: "Kampas & Kopling", dailyDemand: 4.0, capacity: 50, minStock: 8 },
  { name: "Busi CPR9 NGK Honda Vario 150", slug: "busi-cpr9-ngk-vario-150", category: "Kelistrikan", dailyDemand: 5.5, capacity: 60, minStock: 10 },
  { name: "Seal Kruk As Kiri Honda BeAT/Vario/Scoopy", slug: "seal-kruk-as-kiri", category: "Seal & Gasket", dailyDemand: 2.5, capacity: 30, minStock: 5 },
  { name: "Baterai Remote Keyless CR2032", slug: "baterai-remote-cr2032", category: "Kelistrikan", dailyDemand: 6.0, capacity: 80, minStock: 10 },
  { name: "Jalu Stang Honda PCX 150/160", slug: "jalu-stang-pcx", category: "Body & Frame", dailyDemand: 1.5, capacity: 20, minStock: 3 },
  { name: "Ring Baut Oli 12MM Honda PCX 150", slug: "ring-baut-oli-12mm", category: "Baut & Ring", dailyDemand: 7.0, capacity: 100, minStock: 15 },
  { name: "Karet Dudukan Stang CB150R/Verza", slug: "karet-dudukan-stang-cb150r", category: "Body & Frame", dailyDemand: 2.0, capacity: 30, minStock: 5 },
  { name: "Kampas Rem Belakang Honda BeAT/Vario/Scoopy", slug: "kampas-rem-belakang", category: "Kampas & Kopling", dailyDemand: 5.0, capacity: 60, minStock: 10 },
  { name: "Komstir Honda BeAT/Vario/Scoopy/PCX", slug: "komstir-matic", category: "Steering", dailyDemand: 2.0, capacity: 30, minStock: 5 },
  { name: "Cover Cadangan Radiator Vario 125", slug: "cover-radiator-vario-125", category: "Body & Frame", dailyDemand: 1.0, capacity: 20, minStock: 3 },
  { name: "Rubber Starter Pinion Honda BeAT FI", slug: "rubber-starter-pinion", category: "Mesin", dailyDemand: 3.5, capacity: 50, minStock: 8 },
  { name: "Per Kampas Ganda Honda BeAT/Scoopy/Genio", slug: "per-kampas-ganda", category: "Kampas & Kopling", dailyDemand: 4.0, capacity: 50, minStock: 8 },
  { name: "Seal Roda Belakang Honda BeAT eSP", slug: "seal-roda-belakang", category: "Seal & Gasket", dailyDemand: 3.0, capacity: 40, minStock: 5 },
  { name: "Bosh Mounting Honda Vario Karburator", slug: "bosh-mounting-vario", category: "Mesin", dailyDemand: 1.5, capacity: 20, minStock: 3 },
  { name: "Clip Reflektor Lampu Depan Honda BeAT FI", slug: "clip-reflektor-lampu", category: "Body & Frame", dailyDemand: 5.0, capacity: 80, minStock: 10 },
  { name: "O-Ring Shock Depan Honda BeAT FI", slug: "o-ring-shock-depan", category: "Seal & Gasket", dailyDemand: 4.5, capacity: 60, minStock: 10 },
  { name: "Spring Kick Starter Honda CB150R", slug: "spring-kick-starter-cb150r", category: "Mesin", dailyDemand: 1.5, capacity: 25, minStock: 3 },
  { name: "Piece Slide Set Honda Vario 125 eSP", slug: "piece-slide-set-vario-125", category: "Mesin", dailyDemand: 2.0, capacity: 30, minStock: 5 },
  { name: "Seal Tutup Oli O-Ring 18x3 Matic Honda", slug: "seal-tutup-oli-18x3", category: "Seal & Gasket", dailyDemand: 8.0, capacity: 100, minStock: 15 },
]

const HONDA_PARTS: SparePart[] = PART_SEEDS.map((seed, i) => ({
  id: `hc-${seed.slug}`,
  name: seed.name,
  barcode: partBarcode(i + 1),
  category: seed.category,
  // stok awal 60–95% kapasitas rak (deterministik per part)
  initialStock: Math.round(seed.capacity * (0.6 + ((i * 37) % 36) / 100)),
  avgDailyConsumption: seed.dailyDemand,
  reorderQty: seed.capacity,
  minStock: seed.minStock,
}))

const HONDA_IDS = new Set(HONDA_PARTS.map((p) => p.id))
const HONDA_BARCODES = new Set(HONDA_PARTS.map((p) => p.barcode))

// =============================================================================
//  GENERATOR
// =============================================================================

interface GeneratedTransaction {
  itemId: string
  productBarcode: string
  productName: string
  type: "in" | "out" | "adjustment"
  quantity: number
  timestamp: number
  source: "scanner" | "dashboard"
  reason: string
  operator: string
  notes?: string
}

function makeRng(seedSource: string): () => number {
  let seed = seedSource.split("").reduce((s, c) => s + c.charCodeAt(0), 0)
  return () => {
    seed = (seed * 9301 + 49297) % 233280
    return seed / 233280
  }
}

/** OUT harian dibatasi 1–3 per transaksi service; total harian bisa >3 via multi-ticket. */
function splitServiceTickets(outQty: number, rand: () => number): number[] {
  if (outQty <= 0) return []
  const tickets: number[] = []
  let remaining = outQty
  while (remaining > 0) {
    const q = Math.min(remaining, 1 + Math.floor(rand() * 3)) // 1..3
    tickets.push(q)
    remaining -= q
  }
  return tickets
}

function generateYearTransactions(part: SparePart, days: number): GeneratedTransaction[] {
  const transactions: GeneratedTransaction[] = []
  const endTs = Date.now()
  const startTs = endTs - days * MS_PER_DAY
  let currentStock = part.initialStock
  let lastRestockDay = -Infinity
  const rand = makeRng(part.id)

  for (let day = 0; day < days; day++) {
    const dayTs = startTs + day * MS_PER_DAY
    const date = new Date(dayTs)
    const dow = date.getUTCDay() // 0=Sun
    const isWeekend = dow === 0 || dow === 6
    const dom = date.getUTCDate()

    // Pola permintaan bengkel: weekday ramai, weekend sepi, gajian (25–31) naik
    let dayMultiplier = isWeekend ? 0.55 : 1.15
    if (dom >= 25) dayMultiplier *= 1.25

    // Stock opname berkala (±1–2 unit, koreksi selisih hitung fisik)
    if (day > 30 && rand() < 0.016) {
      const delta = rand() < 0.5 ? -1 : 1
      const opnameTs = dayTs + (17 + rand()) * 3600000
      transactions.push({
        itemId: part.id,
        productBarcode: part.barcode,
        productName: part.name,
        type: "adjustment",
        quantity: delta,
        timestamp: Math.trunc(opnameTs),
        source: "dashboard",
        reason: "Stock opname",
        operator: "Admin Gudang",
        notes: `Koreksi selisih fisik ${delta > 0 ? "+" : ""}${delta} unit`,
      })
      currentStock = Math.max(0, currentStock + delta)
    }

    // Restock pagi dulu (supplier datang pagi) agar stok tersedia untuk service hari itu
    const daysSinceRestock = day - lastRestockDay
    if (currentStock <= part.minStock && daysSinceRestock >= 7) {
      // Jumlah dus bervariasi ±10% (supplier kadang kirim partial/bonus)
      const restockQty = Math.max(1, Math.round(part.reorderQty * (0.9 + rand() * 0.2)))
      const restockHour = 7 + Math.floor(rand() * 2)
      const restockMinute = Math.floor(rand() * 60)
      const restockTs = dayTs + restockHour * 3600000 + restockMinute * 60000
      transactions.push({
        itemId: part.id,
        productBarcode: part.barcode,
        productName: part.name,
        type: "in",
        quantity: restockQty,
        timestamp: restockTs,
        source: "dashboard",
        reason: "Restock supplier",
        operator: "Admin Gudang",
        notes: `Restock ${restockQty} unit (dus/box supplier)`,
      })
      currentStock += restockQty
      lastRestockDay = day
    }

    let outQty = Math.round(part.avgDailyConsumption * dayMultiplier + (rand() - 0.4) * 2)
    if (rand() < 0.08) outQty = 0 // dead day
    if (rand() < 0.05) outQty = Math.round(outQty * 1.8) // busy/promo day
    if (outQty < 0) outQty = 0
    if (outQty > currentStock) outQty = currentStock

    if (outQty > 0) {
      const tickets = splitServiceTickets(outQty, rand)
      for (const q of tickets) {
        const hour = 8 + Math.floor(rand() * 9) // 08–16
        const minute = Math.floor(rand() * 60)
        const txTs = dayTs + hour * 3600000 + minute * 60000
        const viaScanner = rand() > 0.35
        transactions.push({
          itemId: part.id,
          productBarcode: part.barcode,
          productName: part.name,
          type: "out",
          quantity: q,
          timestamp: txTs,
          source: viaScanner ? "scanner" : "dashboard",
          reason: viaScanner ? "Service (Auto OUT)" : "Pemakaian bengkel",
          operator: viaScanner ? "Scanner" : "Mekanik AHASS",
          notes: `Service ${q} unit`,
        })
      }
      currentStock -= outQty
    }
  }

  return transactions.sort((a, b) => a.timestamp - b.timestamp)
}

function finalStockFor(part: SparePart, txs: GeneratedTransaction[]): number {
  let stock = part.initialStock
  for (const tx of txs) {
    if (tx.type === "in") stock += tx.quantity
    else if (tx.type === "out") stock -= tx.quantity
    else stock += tx.quantity // adjustment: signed delta
  }
  return Math.max(0, stock)
}

// =============================================================================
//  FIREBASE CLI HELPERS (login credentials; no .env.local required)
// =============================================================================

function firebaseJsonGet(path: string): unknown {
  const out = execFileSync(
    "firebase",
    ["database:get", path, "--project", PROJECT_ID],
    { encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 },
  )
  const trimmed = out.trim()
  if (!trimmed || trimmed === "null") return null
  return JSON.parse(trimmed)
}

function firebaseJsonUpdate(path: string, data: Record<string, unknown>): void {
  const tmp = resolve(`/tmp/honda-seed-upd-${Date.now()}-${Math.random().toString(36).slice(2)}.json`)
  writeFileSync(tmp, JSON.stringify(data))
  try {
    execFileSync(
      "firebase",
      ["database:update", path, tmp, "--project", PROJECT_ID, "--force"],
      { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] },
    )
  } finally {
    try {
      unlinkSync(tmp)
    } catch {
      /* ignore */
    }
  }
}

function chunkEntries<T>(entries: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < entries.length; i += size) chunks.push(entries.slice(i, i + size))
  return chunks
}

function pushLikeId(): string {
  // Firebase push id-ish (not crypto-critical; unique enough for seed)
  const alphabet = "-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz"
  let id = "-"
  let now = Date.now()
  for (let i = 7; i >= 0; i--) {
    id += alphabet[now % 64]
    now = Math.floor(now / 64)
  }
  for (let i = 0; i < 12; i++) {
    id += alphabet[Math.floor(Math.random() * 64)]
  }
  return id
}

async function scopedFirebasePush(
  inventory: Record<string, Record<string, unknown>>,
  transactions: Record<string, GeneratedTransaction & { id: string }>,
): Promise<void> {
  console.log("\n📤 Scoped push ke Firebase RTDB (20 part Honda saja)...")
  console.log(`   Project: ${PROJECT_ID}`)
  console.log(`   URL:     ${DATABASE_URL}`)

  // 1) Backup
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)
  const backupDir = resolve("backups")
  if (!existsSync(backupDir)) mkdirSync(backupDir, { recursive: true })

  console.log("   • Backup inventory + transactions...")
  const invSnap = firebaseJsonGet("/inventory")
  const txSnap = firebaseJsonGet("/transactions")
  writeFileSync(resolve(backupDir, `inventory-${stamp}.json`), JSON.stringify(invSnap))
  writeFileSync(resolve(backupDir, `transactions-${stamp}.json`), JSON.stringify(txSnap))
  console.log(`   ✓ Backup → backups/inventory-${stamp}.json`)
  console.log(`   ✓ Backup → backups/transactions-${stamp}.json`)

  // 2) Delete only Honda transactions
  const existingTx = (txSnap && typeof txSnap === "object" ? txSnap : {}) as Record<string, any>
  const deleteMap: Record<string, null> = {}
  let deleteCount = 0
  for (const [key, tx] of Object.entries(existingTx)) {
    if (!tx || typeof tx !== "object") continue
    const bc = String(tx.productBarcode ?? "")
    const itemId = String(tx.itemId ?? "")
    if (HONDA_BARCODES.has(bc) || HONDA_IDS.has(itemId)) {
      deleteMap[key] = null
      deleteCount++
    }
  }
  console.log(`   • Hapus transaksi Honda lama: ${deleteCount}`)
  for (const chunk of chunkEntries(Object.entries(deleteMap), WRITE_CHUNK)) {
    const payload: Record<string, null> = {}
    for (const [k, v] of chunk) payload[k] = v
    firebaseJsonUpdate("/transactions", payload)
  }
  console.log("   ✓ Transaksi Honda lama dihapus (non-Honda utuh)")

  // 3) Write new transactions in chunks
  const txEntries = Object.entries(transactions)
  console.log(`   • Tulis transaksi baru: ${txEntries.length}`)
  for (const chunk of chunkEntries(txEntries, WRITE_CHUNK)) {
    const payload: Record<string, unknown> = {}
    for (const [k, v] of chunk) payload[k] = v
    firebaseJsonUpdate("/transactions", payload)
  }
  console.log("   ✓ Transaksi baru tertulis")

  // 4) Patch inventory for 20 parts only (merge fields; keep others)
  console.log("   • Patch inventory 20 part...")
  const existingInv = (invSnap && typeof invSnap === "object" ? invSnap : {}) as Record<string, any>
  const invPatch: Record<string, unknown> = {}
  const now = Date.now()
  for (const part of HONDA_PARTS) {
    const generated = inventory[part.id]
    const prev = existingInv[part.id] && typeof existingInv[part.id] === "object" ? existingInv[part.id] : {}
    invPatch[part.id] = {
      ...prev,
      id: part.id,
      name: part.name,
      barcode: part.barcode,
      category: part.category,
      quantity: generated.quantity,
      minStock: part.minStock,
      lastUpdated: now,
      updatedAt: now,
      deleted: false,
    }
  }
  // multi-path update at /inventory
  firebaseJsonUpdate("/inventory", invPatch)
  console.log("   ✓ Inventory 20 part di-patch")

  console.log("\n✓ Scoped seed selesai. Non-Honda data tidak dihapus.")
}

// =============================================================================
//  REPORT / TEST
// =============================================================================

function printDistribution(txs: GeneratedTransaction[]) {
  const outQty = new Map<number, number>()
  const inQty = new Map<number, number>()
  let nIn = 0
  let nOut = 0
  let nAdj = 0
  for (const tx of txs) {
    if (tx.type === "out") {
      nOut++
      outQty.set(tx.quantity, (outQty.get(tx.quantity) ?? 0) + 1)
    } else if (tx.type === "in") {
      nIn++
      inQty.set(tx.quantity, (inQty.get(tx.quantity) ?? 0) + 1)
    } else {
      nAdj++
    }
  }
  const fmt = (m: Map<number, number>) =>
    [...m.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([q, c]) => `${q}×${c}`)
      .join(", ")
  console.log(`  OUT ${nOut} | qty hist: ${fmt(outQty)}`)
  console.log(`  IN  ${nIn} | qty hist: ${fmt(inQty)}`)
  console.log(`  ADJ ${nAdj} (stock opname)`)
}

function testPrediction(part: SparePart, txs: GeneratedTransaction[], finalStock: number) {
  const txInput = txs.map((tx) => ({
    timestamp: tx.timestamp,
    quantity: tx.quantity,
    type: tx.type,
  }))
  const series = buildDailySeriesFromTransactions(txInput, finalStock)
  if (series.length < 2) {
    console.log(`  ⚠ Data konsumsi kurang untuk ${part.name}`)
    return null
  }

  try {
    const prediction = predictStock(series, { horizonDays: 14, trainRatio: 0.85 })
    const lowest = Math.min(...prediction.forecast.map((f) => f.predictedQuantity))
    const lastHistoryTs = series[series.length - 1].timestamp
    const stockoutDay = prediction.stockoutDate
      ? Math.round((prediction.stockoutDate.getTime() - lastHistoryTs) / MS_PER_DAY)
      : null
    const status = lowest < part.minStock ? "🔴 RISK" : lowest < part.minStock * 2 ? "🟡 WATCH" : "🟢 OK"
    const r2Text =
      prediction.metrics.r2 == null || prediction.metrics.available === false
        ? "n/a"
        : prediction.metrics.r2.toFixed(3)
    const b = prediction.model.avgDailyConsumption
    const target = part.avgDailyConsumption
    const errPct = target > 0 ? (Math.abs(b - target) / target) * 100 : 0
    console.log(
      `  ${status} ${part.name.padEnd(48)} stok=${String(finalStock).padStart(3)} | target=${target.toFixed(2).padStart(4)} b=${b.toFixed(2).padStart(5)} (Δ${errPct.toFixed(0)}%) | R²=${r2Text} | habis=${stockoutDay !== null ? "hari ke-" + stockoutDay : "—"}`,
    )
    return prediction.metrics.r2
  } catch (e) {
    console.log(`  ⚠ Error untuk ${part.name}: ${(e as Error).message}`)
    return null
  }
}

// =============================================================================
//  MAIN
// =============================================================================

function parseArgs(argv: string[]) {
  const has = (flag: string) => argv.includes(flag)
  const val = (flag: string) => {
    const i = argv.indexOf(flag)
    return i !== -1 && i + 1 < argv.length ? argv[i + 1] : null
  }
  const daysRaw = val("--days")
  const days = daysRaw ? Math.max(14, Math.min(3650, Number(daysRaw) || 365)) : 365
  return {
    exportPath: val("--output"),
    pushFirebase: has("--firebase"),
    confirm: has("--confirm"),
    dryRun: has("--dry-run"),
    days,
    test: has("--test") || (!has("--output") && !has("--firebase")) || has("--dry-run"),
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))

  console.log("═".repeat(80))
  console.log("  Generator Data Realistis AHASS — 20 Suku Cadang Honda")
  console.log("═".repeat(80))
  console.log(`  days=${args.days}  dryRun=${args.dryRun}  firebase=${args.pushFirebase}  confirm=${args.confirm}`)

  if (args.pushFirebase && !args.confirm) {
    console.error("\n❌ Refusing production write without --confirm")
    console.error("   Contoh: npx tsx scripts/generate-honda-dummy.ts --firebase --confirm")
    process.exit(1)
  }

  const allInventory: Record<
    string,
    {
      id: string
      name: string
      barcode: string
      category: string
      quantity: number
      minStock: number
      lastUpdated: number
      createdAt: number
    }
  > = {}
  const allTransactions: Record<string, GeneratedTransaction & { id: string }> = {}

  let totalTx = 0
  let totalIn = 0
  let totalOut = 0

  for (const part of HONDA_PARTS) {
    const txs = generateYearTransactions(part, args.days)
    totalTx += txs.length
    for (const tx of txs) {
      if (tx.type === "in") totalIn++
      else totalOut++
    }
    const finalStock = finalStockFor(part, txs)
    allInventory[part.id] = {
      id: part.id,
      name: part.name,
      barcode: part.barcode,
      category: part.category,
      quantity: finalStock,
      minStock: part.minStock,
      lastUpdated: Date.now(),
      createdAt: Date.now() - args.days * MS_PER_DAY,
    }
    for (let i = 0; i < txs.length; i++) {
      const id = pushLikeId()
      allTransactions[id] = { ...txs[i], id }
    }
  }

  console.log(`\n✓ Generated ${HONDA_PARTS.length} parts · ${totalTx} txs (IN=${totalIn}, OUT=${totalOut})\n`)
  printDistribution(Object.values(allTransactions))

  // Sample one oil SKU
  const samplePart = HONDA_PARTS[0]
  const sampleTxs = Object.values(allTransactions).filter((t) => t.itemId === samplePart.id)
  const sampleIns = sampleTxs.filter((t) => t.type === "in").slice(0, 3)
  const sampleOuts = sampleTxs.filter((t) => t.type === "out").slice(0, 5)
  console.log(`\n  Sample: ${samplePart.name}`)
  console.log("  IN :", sampleIns.map((t) => t.quantity).join(", ") || "(none)")
  console.log("  OUT:", sampleOuts.map((t) => t.quantity).join(", ") || "(none)")
  console.log("  final stock:", allInventory[samplePart.id].quantity)

  if (args.test || args.dryRun) {
    console.log("\n" + "─".repeat(80))
    console.log("  PREDIKSI SANITY (train 85%, horizon 14)")
    console.log("─".repeat(80))
    const r2s: number[] = []
    for (const part of HONDA_PARTS) {
      const partTxs = Object.values(allTransactions).filter((t) => t.itemId === part.id)
      const r2 = testPrediction(part, partTxs, allInventory[part.id].quantity)
      if (typeof r2 === "number") r2s.push(r2)
    }
    const avgR2 = r2s.length ? r2s.reduce((a, b) => a + b, 0) / r2s.length : 0
    console.log("\n  Evaluated R² count:", r2s.length)
    console.log(
      "  Average R² tren kumulatif:",
      avgR2.toFixed(4),
      "(R² pada ΣC vs a+b·t; MAE/RMSE = error level stok holdout)",
    )
  }

  if (args.exportPath) {
    const dump = { inventory: allInventory, transactions: allTransactions }
    writeFileSync(resolve(args.exportPath), JSON.stringify(dump, null, 2))
    console.log(`\n✓ Exported → ${resolve(args.exportPath)}`)
  }

  if (args.pushFirebase && args.confirm) {
    await scopedFirebasePush(allInventory, allTransactions)
  } else if (args.pushFirebase) {
    // unreachable due to earlier guard
  } else {
    console.log("\n(tip) Push production: npx tsx scripts/generate-honda-dummy.ts --firebase --confirm")
  }

  console.log("\n" + "═".repeat(80))
  console.log("  Selesai")
  console.log("═".repeat(80))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
