/**
 * Generator data realistis 1 tahun untuk 20 suku cadang motor Honda (AHASS).
 *
 * Pola:
 *  - OUT: pemakaian bengkel 1–3 unit/transaksi (bukan bulk)
 *  - IN: restock supplier per dus/box (reorderQty 20–100)
 *  - Weekend sepi, dead day ~8%, busy day ~5%
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
//  DATASET 20 SUKU CADANG HONDA (AHASS)
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

const HONDA_PARTS: SparePart[] = [
  // OLI & PELUMAS (paling laku)
  { id: "ahm-oil-spx2-08231-m99-k2lat", name: "Oli AHM SPX2 SAE 10W-30 0.8L", barcode: "8992017013015", category: "Oli & Pelumas", initialStock: 80, avgDailyConsumption: 4.2, reorderQty: 100, minStock: 20 },
  { id: "ahm-oil-mpx2-08232-m99-k2lat", name: "Oli AHM MPX2 SAE 10W-30 0.8L", barcode: "8992017013022", category: "Oli & Pelumas", initialStock: 70, avgDailyConsumption: 3.8, reorderQty: 100, minStock: 20 },
  { id: "ahm-gear-oil-08234", name: "Oli Gear AHM Matic 0.12L", barcode: "8992017013039", category: "Oli & Pelumas", initialStock: 60, avgDailyConsumption: 2.5, reorderQty: 80, minStock: 15 },

  // FILTER
  { id: "filter-oli-15412-kvb-901", name: "Filter Oli 15412-KVB-901 (Beat/Vario)", barcode: "8992017020013", category: "Filter", initialStock: 50, avgDailyConsumption: 1.8, reorderQty: 60, minStock: 10 },
  { id: "filter-udara-17210-kvb-900", name: "Filter Udara 17210-KVB-900 (Beat/Scoopy)", barcode: "8992017020020", category: "Filter", initialStock: 40, avgDailyConsumption: 1.5, reorderQty: 50, minStock: 10 },
  { id: "filter-udara-17210-k46-n10", name: "Filter Udara 17210-K46-N10 (Vario 150)", barcode: "8992017020037", category: "Filter", initialStock: 35, avgDailyConsumption: 1.2, reorderQty: 50, minStock: 10 },

  // KAMPAS REM
  { id: "kampas-rem-depan-06455-k44", name: "Kampas Rem Depan 06455-K44-V01 (Vario)", barcode: "8992017030014", category: "Rem", initialStock: 30, avgDailyConsumption: 1.0, reorderQty: 40, minStock: 8 },
  { id: "kampas-rem-belakang-06435-kzr", name: "Kampas Rem Belakang 06435-KZR-601 (Beat)", barcode: "8992017030021", category: "Rem", initialStock: 35, avgDailyConsumption: 1.2, reorderQty: 40, minStock: 8 },
  { id: "minyak-rem-08233-m99-k1zlt", name: "Minyak Rem AHM DOT 4 0.1L", barcode: "8992017030038", category: "Rem", initialStock: 45, avgDailyConsumption: 1.4, reorderQty: 60, minStock: 10 },

  // BUSI
  { id: "busi-cpr8ea-9-31916", name: "Busi NGK CPR8EA-9 (Beat/Vario)", barcode: "8992017040015", category: "Busi", initialStock: 60, avgDailyConsumption: 2.0, reorderQty: 80, minStock: 15 },
  { id: "busi-cpr9ea-9-31917", name: "Busi NGK CPR9EA-9 (Sport)", barcode: "8992017040022", category: "Busi", initialStock: 40, avgDailyConsumption: 0.8, reorderQty: 50, minStock: 10 },

  // V-BELT (Matic)
  { id: "vbelt-23100-k0g-901", name: "V-Belt 23100-K0G-901 (Beat/Scoopy)", barcode: "8992017050016", category: "Transmisi", initialStock: 25, avgDailyConsumption: 0.6, reorderQty: 30, minStock: 5 },
  { id: "vbelt-23100-k46-n00", name: "V-Belt 23100-K46-N00 (Vario 150)", barcode: "8992017050023", category: "Transmisi", initialStock: 20, avgDailyConsumption: 0.5, reorderQty: 30, minStock: 5 },
  { id: "roller-22130-k0g-901", name: "Roller Set CVT 22130-K0G-901", barcode: "8992017050030", category: "Transmisi", initialStock: 25, avgDailyConsumption: 0.4, reorderQty: 30, minStock: 5 },

  // BAN
  { id: "ban-fdr-80-90-14", name: "Ban FDR 80/90-14 Sport XR Evo (Depan)", barcode: "8992017060017", category: "Ban", initialStock: 15, avgDailyConsumption: 0.3, reorderQty: 20, minStock: 4 },
  { id: "ban-fdr-90-90-14", name: "Ban FDR 90/90-14 Sport XR Evo (Belakang)", barcode: "8992017060024", category: "Ban", initialStock: 15, avgDailyConsumption: 0.3, reorderQty: 20, minStock: 4 },

  // KELISTRIKAN
  { id: "aki-gtz5s-31500", name: "Aki GS GTZ5S MF (Beat/Vario)", barcode: "8992017070018", category: "Kelistrikan", initialStock: 18, avgDailyConsumption: 0.35, reorderQty: 25, minStock: 5 },
  { id: "bohlam-h6m-12v-35w", name: "Bohlam Depan H6M 12V 35W", barcode: "8992017070025", category: "Kelistrikan", initialStock: 40, avgDailyConsumption: 0.7, reorderQty: 50, minStock: 10 },

  // MESIN
  { id: "kampas-kopling-22535-kvg-900", name: "Kampas Kopling 22535-KVG-900 (Sport)", barcode: "8992017080019", category: "Mesin", initialStock: 12, avgDailyConsumption: 0.2, reorderQty: 20, minStock: 4 },
  { id: "gasket-12251-kvb-900", name: "Gasket Cylinder Head 12251-KVB-900", barcode: "8992017080026", category: "Mesin", initialStock: 25, avgDailyConsumption: 0.5, reorderQty: 30, minStock: 6 },
]

const HONDA_IDS = new Set(HONDA_PARTS.map((p) => p.id))
const HONDA_BARCODES = new Set(HONDA_PARTS.map((p) => p.barcode))

// =============================================================================
//  GENERATOR
// =============================================================================

interface GeneratedTransaction {
  itemId: string
  productBarcode: string
  productName: string
  type: "in" | "out"
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
    const dow = new Date(dayTs).getUTCDay() // 0=Sun
    const isWeekend = dow === 0 || dow === 6
    const dayMultiplier = isWeekend ? 0.55 : 1.15

    // Restock pagi dulu (supplier datang pagi) agar stok tersedia untuk service hari itu
    const daysSinceRestock = day - lastRestockDay
    if (currentStock <= part.minStock && daysSinceRestock >= 7) {
      const restockHour = 7 + Math.floor(rand() * 2)
      const restockMinute = Math.floor(rand() * 60)
      const restockTs = dayTs + restockHour * 3600000 + restockMinute * 60000
      transactions.push({
        itemId: part.id,
        productBarcode: part.barcode,
        productName: part.name,
        type: "in",
        quantity: part.reorderQty,
        timestamp: restockTs,
        source: "dashboard",
        reason: "Restock supplier",
        operator: "Admin Gudang",
        notes: `Restock ${part.reorderQty} unit (1 dus/box)`,
      })
      currentStock += part.reorderQty
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
  for (const tx of txs) stock += tx.type === "in" ? tx.quantity : -tx.quantity
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
  for (const tx of txs) {
    if (tx.type === "out") {
      nOut++
      outQty.set(tx.quantity, (outQty.get(tx.quantity) ?? 0) + 1)
    } else {
      nIn++
      inQty.set(tx.quantity, (inQty.get(tx.quantity) ?? 0) + 1)
    }
  }
  const fmt = (m: Map<number, number>) =>
    [...m.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([q, c]) => `${q}×${c}`)
      .join(", ")
  console.log(`  OUT ${nOut} | qty hist: ${fmt(outQty)}`)
  console.log(`  IN  ${nIn} | qty hist: ${fmt(inQty)}`)
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
