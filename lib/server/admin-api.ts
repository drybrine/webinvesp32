import "server-only"

import { randomUUID } from "node:crypto"
import type { DecodedIdToken, UserRecord } from "firebase-admin/auth"
import { ServerValue } from "firebase-admin/database"
import { NextResponse } from "next/server"
import { getAdminAuth, getAdminDatabase } from "@/lib/server/firebase-admin"
import type { AuditAction, RegisteredDevice, UserProfile, UserRole } from "@/types/security"

const MAX_BODY_BYTES = 32_768
const HUMAN_ROLES = new Set<UserRole>(["admin", "operator", "viewer"])

type ErrorCode =
  | "bad-request"
  | "unauthorized"
  | "forbidden"
  | "not-found"
  | "conflict"
  | "payload-too-large"
  | "internal"

const ERROR_STATUS: Record<ErrorCode, number> = {
  "bad-request": 400,
  unauthorized: 401,
  forbidden: 403,
  "not-found": 404,
  conflict: 409,
  "payload-too-large": 413,
  internal: 500,
}

export class AdminApiError extends Error {
  readonly code: ErrorCode
  readonly status: number

  constructor(code: ErrorCode, message: string) {
    super(message)
    this.name = "AdminApiError"
    this.code = code
    this.status = ERROR_STATUS[code]
  }
}

export interface AdminActor {
  uid: string
  role: "admin"
  email?: string
}

export interface AuditInput {
  entity: "user" | "device" | "firmware"
  entityId: string
  action: AuditAction
  actor: AdminActor
  before: unknown
  after: unknown
  operationId?: string
}

export async function requireAdmin(request: Request): Promise<AdminActor> {
  const authorization = request.headers.get("authorization")
  if (!authorization?.startsWith("Bearer ")) {
    throw new AdminApiError("unauthorized", "Token Firebase diperlukan")
  }

  const token = authorization.slice(7).trim()
  if (!token) throw new AdminApiError("unauthorized", "Token Firebase diperlukan")

  let identity: DecodedIdToken
  try {
    identity = await getAdminAuth().verifyIdToken(token, true)
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error
      ? String((error as {code: unknown}).code)
      : "unknown"
    console.error("Firebase ID token verification failed:", code)
    if (code === "auth/id-token-revoked") {
      throw new AdminApiError("unauthorized", "Sesi telah dicabut. Silakan masuk kembali")
    }
    if (code === "auth/id-token-expired") {
      throw new AdminApiError("unauthorized", "Sesi telah kedaluwarsa. Silakan coba lagi")
    }
    if (code === "auth/argument-error") {
      throw new AdminApiError("unauthorized", "Token Firebase tidak valid")
    }
    throw new AdminApiError("unauthorized", "Verifikasi token gagal. Silakan coba lagi")
  }

  if (identity.role !== "admin" || identity.disabled === true) {
    throw new AdminApiError("forbidden", "Akses admin diperlukan")
  }

  const [user, profileSnapshot] = await Promise.all([
    getAdminAuth().getUser(identity.uid),
    getAdminDatabase().ref(`users/${identity.uid}`).get(),
  ])
  const profile = profileSnapshot.val()
  if (user.disabled || user.customClaims?.role !== "admin" || user.customClaims?.disabled === true || !profile || profile.disabled === true || profile.role !== "admin") {
    throw new AdminApiError("forbidden", "Akun admin tidak aktif")
  }

  return {
    uid: identity.uid,
    role: "admin",
    email: identity.email,
  }
}

export async function readJson<T>(request: Request): Promise<T> {
  const contentLength = Number(request.headers.get("content-length") || 0)
  if (contentLength > MAX_BODY_BYTES) {
    throw new AdminApiError("payload-too-large", "Ukuran request melebihi batas")
  }

  const raw = await request.text()
  if (!raw || Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
    throw new AdminApiError(raw ? "payload-too-large" : "bad-request", raw ? "Ukuran request melebihi batas" : "Payload JSON diperlukan")
  }

  try {
    const value = JSON.parse(raw)
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("not-object")
    }
    return value as T
  } catch {
    throw new AdminApiError("bad-request", "Payload JSON tidak valid")
  }
}

export function cleanText(value: unknown, field: string, max = 160): string {
  const text = typeof value === "string" ? value.trim() : ""
  if (!text || text.length > max) {
    throw new AdminApiError("bad-request", `${field} tidak valid`)
  }
  return text
}

export function optionalText(value: unknown, field: string, max = 160): string | undefined {
  if (value === undefined) return undefined
  return cleanText(value, field, max)
}

export function cleanEmail(value: unknown): string {
  const email = cleanText(value, "Email", 254).toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AdminApiError("bad-request", "Email tidak valid")
  }
  return email
}

export function requireRole(value: unknown): UserRole {
  if (!HUMAN_ROLES.has(value as UserRole)) {
    throw new AdminApiError("bad-request", "Peran tidak valid")
  }
  return value as UserRole
}

export function publicUser(record: UserRecord, profile: Record<string, unknown> = {}): UserProfile {
  const claims = record.customClaims || {}
  const claimedRole = claims.role
  const profileRole = profile.role
  const role = HUMAN_ROLES.has(claimedRole as UserRole)
    ? claimedRole as UserRole
    : HUMAN_ROLES.has(profileRole as UserRole)
      ? profileRole as UserRole
      : "viewer"

  return {
    uid: record.uid,
    email: record.email || String(profile.email || ""),
    displayName: record.displayName || String(profile.displayName || ""),
    role,
    disabled: record.disabled || profile.disabled === true,
    createdAt: Number(profile.createdAt || new Date(record.metadata.creationTime).getTime()),
    updatedAt: Number(profile.updatedAt || 0),
    lastLoginAt: record.metadata.lastSignInTime
      ? new Date(record.metadata.lastSignInTime).getTime()
      : undefined,
  }
}

export function publicDevice(value: Record<string, unknown>): RegisteredDevice {
  return {
    uid: String(value.uid || ""),
    deviceId: String(value.deviceId || ""),
    email: String(value.email || ""),
    label: String(value.label || ""),
    disabled: value.disabled === true,
    createdAt: Number(value.createdAt || 0) || undefined,
    updatedAt: Number(value.updatedAt || 0) || undefined,
    rotatedAt: Number(value.rotatedAt || 0) || undefined,
    lastSeen: Number(value.lastSeen || 0) || undefined,
  }
}

function changedFields(before: unknown, after: unknown): string[] {
  const beforeObject = before && typeof before === "object" ? before as Record<string, unknown> : {}
  const afterObject = after && typeof after === "object" ? after as Record<string, unknown> : {}
  const fields = new Set([...Object.keys(beforeObject), ...Object.keys(afterObject)])
  return [...fields].filter((field) => JSON.stringify(beforeObject[field]) !== JSON.stringify(afterObject[field]))
}

// RTDB rejects `undefined`. Strip undefined values (e.g. lastLoginAt for a
// freshly created user) before persisting an audit snapshot.
function stripUndefined<T>(value: T): T {
  return JSON.parse(JSON.stringify(value ?? null))
}

export async function writeAudit(input: AuditInput): Promise<string> {
  const operationId = input.operationId || randomUUID()
  const before = stripUndefined(input.before)
  const after = stripUndefined(input.after)
  const auditRef = getAdminDatabase().ref("auditLogs").push()
  await auditRef.set({
    entity: input.entity,
    entityId: input.entityId,
    action: input.action,
    before: before === null ? {exists: false} : {exists: true, value: before},
    after: after === null ? {exists: false} : {exists: true, value: after},
    changedFields: changedFields(before, after),
    actorUid: input.actor.uid,
    actorType: "user",
    actorRole: input.actor.role,
    operationId,
    timestamp: ServerValue.TIMESTAMP,
  })
  return operationId
}

export function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, {
    ...init,
    headers: {
      "Cache-Control": "no-store",
      ...init?.headers,
    },
  })
}

export function errorResponse(error: unknown) {
  if (error instanceof AdminApiError) {
    return json({error: error.message, code: error.code}, {status: error.status})
  }

  const firebaseCode = typeof error === "object" && error !== null && "code" in error
    ? String((error as {code: unknown}).code)
    : ""
  if (firebaseCode === "auth/email-already-exists" || firebaseCode === "auth/uid-already-exists") {
    return json({error: "Akun tersebut sudah terdaftar", code: "conflict"}, {status: 409})
  }
  if (firebaseCode === "auth/user-not-found") {
    return json({error: "Akun tidak ditemukan", code: "not-found"}, {status: 404})
  }
  if (firebaseCode.startsWith("auth/invalid-")) {
    return json({error: "Data akun tidak valid", code: "bad-request"}, {status: 400})
  }

  console.error("Admin API error:", error)
  return json({error: "Terjadi kesalahan pada server", code: "internal"}, {status: 500})
}
