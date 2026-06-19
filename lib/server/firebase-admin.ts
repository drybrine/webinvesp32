import "server-only"

import { cert, getApps, initializeApp, type App, type ServiceAccount } from "firebase-admin/app"
import { getAuth } from "firebase-admin/auth"
import { getDatabase } from "firebase-admin/database"

let adminApp: App | undefined

function getServiceAccount(): ServiceAccount {
  const raw = (process.env.FIREBASE_SERVICE_ACCOUNT || "").trim()
  const base64 = (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 || "").trim()
  if (!raw && !base64) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT belum dikonfigurasi")
  }

  // Prefer base64 (newline/escape-safe across env stores), fall back to raw JSON.
  let json = raw
  if (base64 || (raw && !raw.startsWith("{"))) {
    try {
      json = Buffer.from(base64 || raw, "base64").toString("utf8")
    } catch {
      json = raw
    }
  }

  let parsed: ServiceAccount & { private_key?: string }
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT bukan JSON atau base64 yang valid")
  }

  // Normalize literal "\n" escapes that some env stores leave intact.
  if (parsed.private_key) parsed.private_key = parsed.private_key.replace(/\\n/g, "\n")
  if (!parsed.private_key || !parsed.clientEmail && !(parsed as { client_email?: string }).client_email) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT tidak memuat kredensial lengkap")
  }
  return parsed
}

export function getAdminApp(): App {
  if (adminApp) return adminApp

  const existing = getApps()[0]
  if (existing) {
    adminApp = existing
    return adminApp
  }

  const databaseURL = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL
  if (!databaseURL) {
    throw new Error("NEXT_PUBLIC_FIREBASE_DATABASE_URL belum dikonfigurasi")
  }

  adminApp = initializeApp({
    credential: cert(getServiceAccount()),
    databaseURL,
  })
  return adminApp
}

export function getAdminAuth() {
  return getAuth(getAdminApp())
}

export function getAdminDatabase() {
  return getDatabase(getAdminApp())
}
