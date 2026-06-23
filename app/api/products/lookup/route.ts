import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type LookupProduct = {
  name: string
  category?: string
  description?: string
  supplier?: string
  sourceUrl?: string
}

const HONDA_BASE = "https://www.hondacengkareng.com"
const HONDA_PARTS_CATEGORY = `${HONDA_BASE}/kategori-produk/suku-cadang-resmi-motor-honda/`
const CODE_RE = /^[A-Za-z0-9][A-Za-z0-9._\-\s/]{2,63}$/

function decodeHtml(input: string) {
  return input
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
}

function stripTags(input: string) {
  return decodeHtml(input.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim())
}

function productFromJsonLd(html: string, code: string): LookupProduct | null {
  const scripts = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) || []
  const needle = code.toLowerCase()
  for (const script of scripts) {
    const raw = script.replace(/^<script[^>]*>/i, "").replace(/<\/script>$/i, "").trim()
    try {
      const parsed = JSON.parse(decodeHtml(raw))
      const items = Array.isArray(parsed) ? parsed : [parsed]
      for (const item of items) {
        const graph = Array.isArray(item?.["@graph"]) ? item["@graph"] : [item]
        for (const node of graph) {
          const text = JSON.stringify(node).toLowerCase()
          if (!text.includes(needle)) continue
          const name = typeof node.name === "string" ? node.name : ""
          if (!name) continue
          return {
            name: stripTags(name),
            category: "Suku Cadang Honda",
            description: typeof node.description === "string" ? stripTags(node.description) : "",
            supplier: "Honda Cengkareng",
            sourceUrl: typeof node.url === "string" ? node.url : undefined,
          }
        }
      }
    } catch {
      // Ignore malformed JSON-LD blocks.
    }
  }
  return null
}

function productFromHtml(html: string, code: string): LookupProduct | null {
  const blocks = html.match(/<(?:li|article|div)[^>]+class=["'][^"']*(?:product|type-product)[^"']*["'][^>]*>[\s\S]*?<\/(?:li|article|div)>/gi) || []
  const needle = code.toLowerCase()
  for (const block of blocks) {
    if (!block.toLowerCase().includes(needle)) continue
    const titleMatch =
      block.match(/<h[1-6][^>]*class=["'][^"']*(?:product_title|woocommerce-loop-product__title|entry-title)[^"']*["'][^>]*>([\s\S]*?)<\/h[1-6]>/i) ||
      block.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i) ||
      block.match(/title=["']([^"']+)["']/i)
    const name = titleMatch ? stripTags(titleMatch[1]) : ""
    if (!name) continue
    const urlMatch = block.match(/<a[^>]+href=["']([^"']+)["']/i)
    return {
      name,
      category: "Suku Cadang Honda",
      description: `Data awal dari Honda Cengkareng. Kode: ${code}`,
      supplier: "Honda Cengkareng",
      sourceUrl: urlMatch ? decodeHtml(urlMatch[1]) : undefined,
    }
  }
  return null
}

async function fetchHondaSearch(code: string) {
  const url = new URL(HONDA_BASE)
  url.searchParams.set("s", code)
  url.searchParams.set("post_type", "product")
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(5000),
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; WebInvesP32/1.0; product lookup)",
      Accept: "text/html,application/xhtml+xml",
    },
  })
  if (!response.ok) return null
  return response.text()
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const barcode = (searchParams.get("barcode") || searchParams.get("code") || "").trim()
  if (!CODE_RE.test(barcode)) {
    return NextResponse.json({ product: null, error: "Kode barcode tidak valid" }, { status: 400 })
  }

  try {
    const html = await fetchHondaSearch(barcode)
    if (!html) return NextResponse.json({ product: null, source: HONDA_PARTS_CATEGORY })
    const product = productFromJsonLd(html, barcode) || productFromHtml(html, barcode)
    return NextResponse.json({ product, source: HONDA_PARTS_CATEGORY })
  } catch {
    return NextResponse.json({ product: null, source: HONDA_PARTS_CATEGORY })
  }
}
