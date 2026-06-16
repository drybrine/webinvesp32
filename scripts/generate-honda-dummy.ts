/**
 * Generator data dummy 1 tahun untuk 20 suku cadang motor Honda.
 *
 * Fitur:
 *  - 365 hari transaksi realistis (stock_in dari supplier + stock_out konsumsi)
 *  - Pola mingguan (Senin-Jumat ramai, Sabtu-Minggu lebih sepi)
 *  - Random restock saat stok rendah
 *  - Tinggi-rendah konsumsi per item (oli paling laku, busi sedang, kampas rem cepat habis)
 *  - Noise realistis (promo days, dead days)
 *
 * Output:
 *  - Insert ke Firebase Realtime Database via REST PUT
 *  - Atau export ke JSON untuk import manual
 *
 * Cara pakai:
 *   npx tsx scripts/generate-honda-dummy.ts --output dummy.json
 *   npx tsx scripts/generate-honda-dummy.ts --firebase  (push ke RTDB)
 *   npx tsx scripts/generate-honda-dummy.ts --test      (jalanin prediksi langsung)
 */

import { writeFileSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import {
  buildDailySeriesFromTransactions,
  predictStock,
} from "../lib/stock-prediction"

const MS_PER_DAY = 24 * 60 * 60 * 1000

// =============================================================================
//  DATASET 20 SUKU CADANG HONDA (AHASS)
// =============================================================================

interface SparePart {
  id: string
  name: string
  barcode: string
  category: string
  initialStock: number
  avgDailyConsumption: number  // rata-rata pemakaian per hari
  reorderQty: number          // qty saat restock dari supplier
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

  // KAMPAS REM (cepat habis)
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

  // KAMPAS KOPLING / GASKET
  { id: "kampas-kopling-22535-kvg-900", name: "Kampas Kopling 22535-KVG-900 (Sport)", barcode: "8992017080019", category: "Mesin", initialStock: 12, avgDailyConsumption: 0.2, reorderQty: 20, minStock: 4 },
  { id: "gasket-12251-kvb-900", name: "Gasket Cylinder Head 12251-KVB-900", barcode: "8992017080026", category: "Mesin", initialStock: 25, avgDailyConsumption: 0.5, reorderQty: 30, minStock: 6 },
]

// =============================================================================
//  GENERATOR TRANSAKSI 1 TAHUN
// =============================================================================

interface Transaction {
  itemId: string
  productBarcode: string
  productName: string
  type: "in" | "out"
  quantity: number
  timestamp: number
  source: string
  reason: string
  operator: string
}

function generateYearTransactions(part: SparePart, days: number = 365): Transaction[] {
  const transactions: Transaction[] = []
  const endTs = Date.now()
  const startTs = endTs - days * MS_PER_DAY

  let currentStock = part.initialStock
  let lastRestockDay = -7  // boleh restock pertama kali

  // Random seed reproducible per item
  let seed = part.id.split("").reduce((s, c) => s + c.charCodeAt(0), 0)
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280
    return seed / 233280
  }

  for (let day = 0; day < days; day++) {
    const dayTs = startTs + day * MS_PER_DAY
    const dow = new Date(dayTs).getDay()  // 0=Sun..6=Sat

    // Pola hari kerja vs weekend
    const isWeekend = dow === 0 || dow === 6
    const dayMultiplier = isWeekend ? 0.55 : 1.15

    // Konsumsi harian (Poisson-like, dengan random noise)
    const baseConsumption = part.avgDailyConsumption * dayMultiplier
    let outQty = Math.round(baseConsumption + (rand() - 0.4) * 2)

    // 8% kemungkinan dead day (tidak ada penjualan)
    if (rand() < 0.08) outQty = 0

    // 5% kemungkinan promo day (penjualan 1.8x)
    if (rand() < 0.05) outQty = Math.round(outQty * 1.8)

    if (outQty < 0) outQty = 0
    if (outQty > currentStock) outQty = currentStock

    // Catat stock_out (1-3 transaksi per hari, simulasi customer berbeda)
    if (outQty > 0) {
      const numTx = outQty <= 2 ? 1 : Math.min(3, Math.ceil(outQty / 2))
      const perTx = Math.ceil(outQty / numTx)
      let remaining = outQty
      for (let t = 0; t < numTx && remaining > 0; t++) {
        const q = t === numTx - 1 ? remaining : Math.min(perTx, remaining)
        // Jam kerja: 08:00 - 17:00
        const hour = 8 + Math.floor(rand() * 9)
        const minute = Math.floor(rand() * 60)
        const txTs = dayTs + hour * 3600000 + minute * 60000
        transactions.push({
          itemId: part.id,
          productBarcode: part.barcode,
          productName: part.name,
          type: "out",
          quantity: q,
          timestamp: txTs,
          source: rand() > 0.3 ? "scanner" : "dashboard",
          reason: "Penjualan",
          operator: "Mekanik AHASS",
        })
        remaining -= q
      }
      currentStock -= outQty
    }

    // Restock logic: kalau stok di bawah minStock dan udah > 7 hari sejak restock terakhir
    const daysSinceRestock = day - lastRestockDay
    if (currentStock <= part.minStock && daysSinceRestock >= 7) {
      // Restock pagi hari (07:00-09:00)
      const restockHour = 7 + Math.floor(rand() * 2)
      const restockTs = dayTs + restockHour * 3600000
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
      })
      currentStock += part.reorderQty
      lastRestockDay = day
    }
  }

  return transactions.sort((a, b) => a.timestamp - b.timestamp)
}

// =============================================================================
//  TEST PREDIKSI LANGSUNG
// =============================================================================

function testPrediction(part: SparePart, txs: Transaction[]) {
  const currentQty = txs.reduce((sum, tx) => sum + (tx.type === "in" ? tx.quantity : -tx.quantity), 0) + part.initialStock - part.initialStock
  // Hitung stok terakhir dari transaksi
  let stock = 0
  for (const tx of txs) stock += tx.type === "in" ? tx.quantity : -tx.quantity
  const finalStock = part.initialStock + stock

  const txInput = txs.map(tx => ({
    timestamp: tx.timestamp,
    quantity: tx.quantity,
    type: tx.type,
  }))

  const series = buildDailySeriesFromTransactions(txInput, finalStock)
  if (series.length < 2) {
    console.log(`  ⚠ Data series kurang untuk ${part.name}`)
    return
  }

  try {
    const prediction = predictStock(series, { horizonDays: 14, trainRatio: 0.8 })
    const lowest = Math.min(...prediction.forecast.map(f => f.predictedQuantity))
    const lastHistoryTs = series[series.length - 1].timestamp
    const stockoutDay = prediction.stockoutDate
      ? Math.round((prediction.stockoutDate.getTime() - lastHistoryTs) / MS_PER_DAY)
      : null

    const status = lowest < part.minStock ? "🔴 RISK" : lowest < part.minStock * 2 ? "🟡 WATCH" : "🟢 OK"
    console.log(
      `  ${status} ${part.name.padEnd(50)} stok=${finalStock.toString().padStart(3)} | konsumsi=${prediction.model.avgDailyConsumption.toFixed(2).padStart(5)}/hari | R²=${prediction.metrics.r2.toFixed(3)} | habis=${stockoutDay !== null ? 'hari ke-' + stockoutDay : '—'}`,
    )
  } catch (e) {
    console.log(`  ⚠ Error untuk ${part.name}: ${(e as Error).message}`)
  }
}

// =============================================================================
//  MAIN
// =============================================================================

const args = process.argv.slice(2)
const exportPath = args.includes("--output") ? args[args.indexOf("--output") + 1] : null
const pushFirebase = args.includes("--firebase")
const testOnly = args.includes("--test") || (!exportPath && !pushFirebase)

console.log("═".repeat(80))
console.log("  Generator Data Dummy 1 Tahun — 20 Suku Cadang Honda (AHASS)")
console.log("═".repeat(80))

const allInventory: Record<string, Partial<SparePart> & { id: string; quantity: number; lastUpdated: number; createdAt: number }> = {}
const allTransactions: Record<string, Transaction & { id: string }> = {}

let totalTx = 0

for (const part of HONDA_PARTS) {
  const txs = generateYearTransactions(part, 365)
  totalTx += txs.length

  // Hitung stok akhir (initial + delta)
  let finalStock = part.initialStock
  for (const tx of txs) finalStock += tx.type === "in" ? tx.quantity : -tx.quantity

  // Simpan inventory item
  allInventory[part.id] = {
    id: part.id,
    name: part.name,
    barcode: part.barcode,
    category: part.category,
    quantity: finalStock,
    minStock: part.minStock,
    lastUpdated: Date.now(),
    createdAt: Date.now() - 365 * MS_PER_DAY,
  }

  // Simpan semua transaksi
  for (let i = 0; i < txs.length; i++) {
    const txId = `${part.id}-${txs[i].timestamp}-${i}`
    allTransactions[txId] = { ...txs[i], id: txId }
  }
}

console.log(`\n✓ Generated ${HONDA_PARTS.length} parts dengan ${totalTx} transaksi total\n`)

// =============================================================================
//  TEST PREDIKSI UNTUK SEMUA ITEM
// =============================================================================
if (testOnly) {
  console.log("─".repeat(80))
  console.log("  PREDIKSI STOK 14 HARI KE DEPAN")
  console.log("─".repeat(80))

  for (const part of HONDA_PARTS) {
    const partTxs = Object.values(allTransactions).filter(t => t.itemId === part.id)
    testPrediction(part, partTxs)
  }

  console.log("\n" + "═".repeat(80))
  console.log("  RINGKASAN MODEL")
  console.log("═".repeat(80))

  const accuracies: number[] = []
  for (const part of HONDA_PARTS) {
    const partTxs = Object.values(allTransactions).filter(t => t.itemId === part.id)
    let stock = 0
    for (const tx of partTxs) stock += tx.type === "in" ? tx.quantity : -tx.quantity
    const finalStock = part.initialStock + stock

    const txInput = partTxs.map(tx => ({ timestamp: tx.timestamp, quantity: tx.quantity, type: tx.type }))
    const series = buildDailySeriesFromTransactions(txInput, finalStock)
    if (series.length >= 2) {
      try {
        const p = predictStock(series, { horizonDays: 14, trainRatio: 0.8 })
        accuracies.push(p.metrics.r2)
      } catch {/* skip */}
    }
  }

  const avgR2 = accuracies.reduce((s, v) => s + v, 0) / accuracies.length
  const okCount = accuracies.filter(r => r > 0).length
  console.log(`  Total item: ${HONDA_PARTS.length}`)
  console.log(`  Average R²: ${avgR2.toFixed(4)}`)
  console.log(`  R² > 0:     ${okCount}/${HONDA_PARTS.length} (${((okCount / HONDA_PARTS.length) * 100).toFixed(0)}%)`)
}

// =============================================================================
//  EXPORT JSON
// =============================================================================
if (exportPath) {
  const dump = { inventory: allInventory, transactions: allTransactions }
  writeFileSync(resolve(exportPath), JSON.stringify(dump, null, 2))
  console.log(`\n✓ Exported ke: ${resolve(exportPath)}`)
  console.log(`  File size: ${(JSON.stringify(dump).length / 1024).toFixed(1)} KB`)
}

// =============================================================================
//  PUSH KE FIREBASE
// =============================================================================
if (pushFirebase) {
  const envPath = resolve(".env.local")
  const env = readFileSync(envPath, "utf-8")
  const dbUrlMatch = env.match(/NEXT_PUBLIC_FIREBASE_DATABASE_URL=(.+)/)
  if (!dbUrlMatch) {
    console.error("❌ NEXT_PUBLIC_FIREBASE_DATABASE_URL tidak ditemukan di .env.local")
    process.exit(1)
  }
  const dbUrl = dbUrlMatch[1].trim()

  console.log("\n📤 Pushing ke Firebase RTDB...")
  console.log(`   URL: ${dbUrl}`)

  ;(async () => {
    // PUT inventory
    const invRes = await fetch(`${dbUrl}/inventory.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(allInventory),
    })
    console.log(`   ✓ Inventory: ${invRes.status}`)

    // PUT transactions
    const txRes = await fetch(`${dbUrl}/transactions.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(allTransactions),
    })
    console.log(`   ✓ Transactions: ${txRes.status}`)

    if (invRes.ok && txRes.ok) {
      console.log("\n✓ Done! Buka dashboard untuk lihat data.")
    } else {
      console.error("\n❌ Push gagal. Cek Firebase rules.")
    }
  })()
}
