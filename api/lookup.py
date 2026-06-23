"""
Honda product lookup API - cari produk dari katalog hondacengkareng.com

Endpoint:
  GET /api/lookup?barcode=<kode>  → cari via Searchanise, fallback katalog
  GET /api/lookup?mode=catalog    → return semua produk dari halaman kategori

Response:
  { product: {name, category, description, supplier, sourceUrl} | null,
    catalog: [{name, sourceUrl}],
    source: string }
"""

from http.server import BaseHTTPRequestHandler
import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request

HONDA_BASE = "https://www.hondacengkareng.com"
HONDA_PARTS_CATEGORY = f"{HONDA_BASE}/kategori-produk/suku-cadang-resmi-motor-honda/"
SEARCHANISE_API = "https://searchserverapi1.com/getresults"
SEARCHANISE_KEY = "0Z3C6c9F0z"
UA = "Mozilla/5.0 (compatible; WebInvesP32/1.0; product lookup)"


def decode_html(text: str) -> str:
    return (text
            .replace("&#", "\x00")  # placeholder
            .replace("&amp;", "&")
            .replace("&quot;", '"')
            .replace("&#039;", "'")
            .replace("&lt;", "<")
            .replace("&gt;", ">"))


def strip_tags(text: str) -> str:
    cleaned = re.sub(r"<[^>]*>", " ", text)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return decode_html(cleaned)


def allowed_origins():
    origins = {origin.strip() for origin in os.environ.get("ALLOWED_ORIGINS", "").split(",") if origin.strip()}
    for env_name in ("VERCEL_URL", "VERCEL_PROJECT_PRODUCTION_URL"):
        hostname = os.environ.get(env_name)
        if hostname:
            origins.add(f"https://{hostname}")
    if os.environ.get("VERCEL_ENV") != "production":
        origins.update({"http://localhost:3000", "http://127.0.0.1:3000"})
    return origins


def fetch_searchanise(code: str) -> dict | None:
    """Search product via Searchanise API by part number / barcode."""
    params = {
        "api_key": SEARCHANISE_KEY,
        "q": code,
        "output": "json",
        "startIndex": "0",
        "maxResults": "5",
        "items": "true",
        "facets": "false",
        "restrictBy[visibility]": "visible|catalog|search",
        "restrictBy[status]": "publish",
    }
    url = f"{SEARCHANISE_API}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": UA,
            "Referer": f"{HONDA_BASE}/search-results/?q={urllib.parse.quote(code)}",
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())
    except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, ValueError):
        return None

    items = data.get("items") or []
    if not items:
        return None

    # prefer exact product_code match, else first item
    needle = code.lower()
    matched = next(
        (i for i in items if (i.get("product_code") or "").lower() == needle
         or (i.get("title") or "").lower() == needle),
        items[0],
    )
    title = (matched.get("title") or "").strip()
    if not title:
        return None

    return {
        "name": strip_tags(title),
        "category": (matched.get("categories") or "").strip() or "Suku Cadang Honda",
        "description": f"Data awal dari Honda Cengkareng. Kode part: {matched.get('product_code') or code}",
        "supplier": "Honda Cengkareng",
        "sourceUrl": matched.get("link") or "",
    }


def scrape_catalog() -> list[dict]:
    """Scrape full category page for product listing."""
    try:
        req = urllib.request.Request(
            HONDA_PARTS_CATEGORY,
            headers={"User-Agent": UA, "Accept": "text/html"},
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            html = resp.read().decode("utf-8", "ignore")
    except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError):
        return []

    items: list[dict] = []
    # match WooCommerce product blocks
    pattern = re.compile(
        r'<li[^>]*class="[^"]*product[^"]*type-product[^"]*"[^>]*>.*?</li>',
        re.DOTALL | re.IGNORECASE,
    )
    for block in pattern.finditer(html):
        block_html = block.group()
        title_match = re.search(
            r'<h[1-6][^>]*class="[^"]*woocommerce-loop-product__title[^"]*"[^>]*>(.*?)</h[1-6]>',
            block_html, re.DOTALL | re.IGNORECASE,
        )
        if not title_match:
            continue
        name = strip_tags(title_match.group(1))
        if not name:
            continue
        url_match = re.search(r'<a[^>]+href="([^"]+)"', block_html)
        source_url = decode_html(url_match.group(1)) if url_match else ""
        items.append({"name": name, "sourceUrl": source_url})
    return items


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            parsed = urllib.parse.urlparse(self.path)
            params = urllib.parse.parse_qs(parsed.query)
            mode = (params.get("mode") or [""])[0]
            barcode = (params.get("barcode") or params.get("code") or [""])[0].strip()

            if mode == "catalog":
                catalog = scrape_catalog()
                self._send_json(200, {"product": None, "catalog": catalog, "source": HONDA_PARTS_CATEGORY})
                return

            if not re.match(r"^[A-Za-z0-9][A-Za-z0-9._\-\s/]{2,63}$", barcode):
                self._send_json(400, {"product": None, "error": "Kode barcode tidak valid"})
                return

            product = fetch_searchanise(barcode)
            catalog = [] if product else scrape_catalog()
            self._send_json(200, {
                "product": product,
                "catalog": catalog,
                "source": HONDA_PARTS_CATEGORY,
            })

        except Exception as e:
            print(f"[lookup] internal error: {e}")
            try:
                catalog = scrape_catalog()
            except Exception:
                catalog = []
            self._send_json(200, {"product": None, "catalog": catalog, "source": HONDA_PARTS_CATEGORY})

    def do_OPTIONS(self):
        origin = self.headers.get("Origin")
        if origin and origin not in allowed_origins():
            self.send_response(403)
            self.end_headers()
            return
        self.send_response(204)
        if origin:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def _send_json(self, status, data):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        origin = self.headers.get("Origin")
        if origin and origin in allowed_origins():
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())
