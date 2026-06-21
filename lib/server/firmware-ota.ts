import "server-only"

import { AdminApiError } from "@/lib/server/admin-api"
import type { FirmwareBuild, FirmwareManifest, FirmwareRelease } from "@/types/firmware"

// Repo + workflow that compiles, signs, and publishes firmware as a GitHub
// Release. Configured via env so the same code works across forks/deploys.
const GITHUB_API = "https://api.github.com"
const WORKFLOW_FILE = process.env.GITHUB_OTA_WORKFLOW || "firmware-ota.yml"
const RELEASE_PREFIX = "firmware-v"
const SEMVER = /^\d+\.\d+\.\d+$/

function repo(): string {
  const value = (process.env.GITHUB_OTA_REPO || "").trim()
  if (!value || !/^[^/]+\/[^/]+$/.test(value)) {
    throw new AdminApiError("internal", "GITHUB_OTA_REPO belum dikonfigurasi (format: owner/repo)")
  }
  return value
}

function token(): string {
  const value = (process.env.GITHUB_OTA_TOKEN || "").trim()
  if (!value) throw new AdminApiError("internal", "GITHUB_OTA_TOKEN belum dikonfigurasi")
  return value
}

function branch(): string {
  return (process.env.GITHUB_OTA_REF || "555").trim()
}

async function githubFetch(path: string, init: RequestInit = {}): Promise<Response> {
  let response: Response
  try {
    response = await fetch(`${GITHUB_API}${path}`, {
      ...init,
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token()}`,
        "X-GitHub-Api-Version": "2022-11-28",
        ...init.headers,
      },
    })
  } catch {
    throw new AdminApiError("internal", "GitHub tidak dapat dijangkau")
  }
  if (response.status === 401 || response.status === 403) {
    throw new AdminApiError("internal", "Token GitHub OTA ditolak atau kehabisan kuota")
  }
  return response
}

export function isValidFirmwareVersion(value: unknown): value is string {
  return typeof value === "string" && SEMVER.test(value.trim())
}

export async function triggerFirmwareBuild(version: string, notes: string): Promise<void> {
  const response = await githubFetch(`/repos/${repo()}/actions/workflows/${encodeURIComponent(WORKFLOW_FILE)}/dispatches`, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({ref: branch(), inputs: {version, notes}}),
  })
  if (response.status !== 204) {
    const detail = await response.text().catch(() => "")
    if (response.status === 404) {
      throw new AdminApiError("not-found", "Workflow firmware-ota.yml tidak ditemukan di repository")
    }
    throw new AdminApiError("internal", `Gagal memicu build firmware (HTTP ${response.status}) ${detail.slice(0, 160)}`)
  }
}

export async function listFirmwareBuilds(limit = 10): Promise<FirmwareBuild[]> {
  const response = await githubFetch(
    `/repos/${repo()}/actions/workflows/${encodeURIComponent(WORKFLOW_FILE)}/runs?per_page=${Math.min(Math.max(limit, 1), 30)}`,
  )
  if (!response.ok) {
    if (response.status === 404) return []
    throw new AdminApiError("internal", `Gagal membaca status build (HTTP ${response.status})`)
  }
  const payload = await response.json() as {
    workflow_runs?: Array<{
      id: number
      name?: string
      display_title?: string
      status?: string
      conclusion?: string | null
      html_url?: string
      created_at?: string
      updated_at?: string
    }>
  }
  return (payload.workflow_runs || []).map((run) => ({
    id: run.id,
    name: run.display_title || run.name || `Build #${run.id}`,
    status: (run.status || "pending") as FirmwareBuild["status"],
    conclusion: (run.conclusion ?? null) as FirmwareBuild["conclusion"],
    htmlUrl: run.html_url || "",
    createdAt: run.created_at || "",
    updatedAt: run.updated_at || "",
  }))
}

function findManifestAsset(assets: Array<{name: string; browser_download_url: string}>) {
  return assets.find((asset) => asset.name === "manifest.json")
}

function findBinaryAsset(assets: Array<{name: string; browser_download_url: string}>) {
  return assets.find((asset) => asset.name.endsWith(".bin"))
}

function isCompleteManifest(value: unknown): value is FirmwareManifest {
  if (!value || typeof value !== "object") return false
  const m = value as Record<string, unknown>
  return (
    isValidFirmwareVersion(m.version) &&
    typeof m.binaryUrl === "string" && m.binaryUrl.startsWith("https://") &&
    typeof m.size === "number" && m.size > 0 &&
    typeof m.sha256 === "string" && /^[a-f0-9]{64}$/i.test(m.sha256) &&
    typeof m.signature === "string" && m.signature.length > 0 &&
    typeof m.releaseTag === "string" &&
    typeof m.board === "string" &&
    typeof m.partitionScheme === "string"
  )
}

export async function listFirmwareReleases(limit = 20): Promise<FirmwareRelease[]> {
  const response = await githubFetch(`/repos/${repo()}/releases?per_page=${Math.min(Math.max(limit, 1), 50)}`)
  if (!response.ok) {
    if (response.status === 404) return []
    throw new AdminApiError("internal", `Gagal membaca daftar release (HTTP ${response.status})`)
  }
  const releases = await response.json() as Array<{
    id: number
    tag_name?: string
    body?: string
    html_url?: string
    draft?: boolean
    prerelease?: boolean
    published_at?: string
    assets?: Array<{name: string; browser_download_url: string}>
  }>

  const valid: FirmwareRelease[] = []
  for (const release of releases) {
    if (release.draft) continue
    if (!release.tag_name?.startsWith(RELEASE_PREFIX)) continue
    const assets = release.assets || []
    const manifestAsset = findManifestAsset(assets)
    const binaryAsset = findBinaryAsset(assets)
    if (!manifestAsset || !binaryAsset) continue

    let manifest: unknown
    try {
      const manifestResponse = await fetch(manifestAsset.browser_download_url, {
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      })
      if (!manifestResponse.ok) continue
      manifest = await manifestResponse.json()
    } catch {
      continue
    }
    if (!isCompleteManifest(manifest)) continue

    valid.push({
      ...manifest,
      // Trust the binary URL from the release asset list, not the manifest, so
      // a tampered manifest cannot redirect the download elsewhere.
      binaryUrl: binaryAsset.browser_download_url,
      releaseId: release.id,
      htmlUrl: release.html_url || "",
      notes: release.body || "",
      prerelease: release.prerelease === true,
      publishedAt: release.published_at,
    })
  }
  return valid
}

export async function getFirmwareRelease(version: string): Promise<FirmwareRelease | null> {
  const releases = await listFirmwareReleases(50)
  return releases.find((release) => release.version === version) || null
}
