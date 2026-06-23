import { NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type LookupProduct = {
  name: string
  category?: string
  description?: string
  supplier?: string
  sourceUrl?: string
}

type CatalogItem = {
  name: string
  sourceUrl: string
}

type SearchaniseItem = {
  product_id?: string
  title?: string
  categories?: string
  link?: string
  product_code?: string
}

type SearchaniseResponse = {
  totalItems?: number
  items?: SearchaniseItem[]
}

const HONDA_BASE = "https://www.hondacengkareng.com"
const HONDA_PARTS_CATEGORY = `${HONDA_BASE}/kategori-produk/suku-cadang-resmi-motor-honda/`
const SEARCHANISE_API = "https://searchserverapi1.com/getresults"
const SEARCHANISE_KEY = "0Z3C6c9F0z"

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

async function fetchSearchanise(code: string): Promise<LookupProduct | null> {
  try {
    const url = new URL(SEARCHANISE_API)
    url.searchParams.set("api_key", SEARCHANISE_KEY)
    url.searchParams.set("q", code)
    url.searchParams.set("output", "json")
    url.searchParams.set("startIndex", "0")
    url.searchParams.set("maxResults", "5")
    url.searchParams.set("items", "true")
    url.searchParams.set("facets", "false")
    url.searchParams.set("restrictBy[visibility]", "visible|catalog|search")
    url.searchParams.set("restrictBy[status]", "publish")

    const response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; WebInvesP32/1.0; product lookup)",
        Referer: `${HONDA_BASE}/search-results/?q=${encodeURIComponent(code)}`,
        Accept: "application/json",
      },
    })
    if (!response.ok) return null

    const data = (await response.json()) as SearchaniseResponse
    const items = data.items || []
    if (!items.length) return null

    const needle = code.toLowerCase()
    const matched =
      items.find(
        (i) =>
          (i.product_code || "").toLowerCase() === needle ||
          (i.title || "").toLowerCase() === needle,
      ) || items[0]

    const title = (matched.title || "").trim()
    if (!title) return null

    return {
      name: stripTags(title),
      category: (matched.categories || "").trim() || "Suku Cadang Honda",
      description: `Data awal dari Honda Cengkareng. Kode part: ${matched.product_code || code}`,
      supplier: "Honda Cengkareng",
      sourceUrl: matched.link,
    }
  } catch {
    return null
  }
}

async function scrapeCatalog(): Promise<CatalogItem[]> {
  try {
    const response = await fetch(HONDA_PARTS_CATEGORY, {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; WebInvesP32/1.0; product catalog)",
        Accept: "text/html,application/xhtml+xml",
      },
    })
    if (!response.ok) return []
    const html = await response.text()
    const items: CatalogItem[] = []
    const blockRe =
      /<li[^>]*class=["'][^"']*product[^"']*type-product[^"']*["'][^>]*>[\s\S]*?<\/li>/gi
    for (const block of html.match(blockRe) || []) {
      const titleMatch = block.match(
        /<h[1-6][^>]*class=["'][^"']*woocommerce-loop-product__title[^"']*["'][^>]*>([\s\S]*?)<\/h[1-6]>/i,
      )
      if (!titleMatch) continue
      const name = stripTags(titleMatch[1])
      if (!name) continue
      const urlMatch = block.match(/<a[^>]+href=["']([^"']+)["']/i)
      const sourceUrl = urlMatch ? decodeHtml(urlMatch[1]) : ""
      items.push({ name, sourceUrl })
    }
    return items
  } catch {
    return []
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const mode = searchParams.get("mode")
  const barcode = (searchParams.get("barcode") || searchParams.get("code") || "").trim()

  if (mode === "catalog") {
    const catalog = await scrapeCatalog()
    return NextResponse.json({ product: null, catalog, source: HONDA_PARTS_CATEGORY })
  }

  if (!barcode) {
    return NextResponse.json({ product: null, error: "Kode barcode tidak valid" }, { status: 400 })
  }

  try {
    const product = await fetchSearchanise(barcode)
    const catalog: CatalogItem[] = []
    return NextResponse.json({ product, catalog, source: HONDA_PARTS_CATEGORY })
  } catch {
    const catalog = await scrapeCatalog()
    return NextResponse.json({ product: null, catalog, source: HONDA_PARTS_CATEGORY })
  }
}
