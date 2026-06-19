import { randomBytes, randomUUID } from "node:crypto"
import { ServerValue } from "firebase-admin/database"
import {
  AdminApiError,
  cleanEmail,
  cleanText,
  errorResponse,
  json,
  optionalText,
  publicUser,
  readJson,
  requireAdmin,
  requireRole,
  writeAudit,
} from "@/lib/server/admin-api"
import { getAdminAuth, getAdminDatabase } from "@/lib/server/firebase-admin"
import type { UserRole } from "@/types/security"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type CreateUserInput = {
  email?: unknown
  displayName?: unknown
  role?: unknown
  password?: unknown
}

type UpdateUserInput = {
  uid?: unknown
  displayName?: unknown
  role?: unknown
  disabled?: unknown
}

function makePassword() {
  return `${randomBytes(18).toString("base64url")}aA1!`
}

async function countOtherActiveAdmins(excludedUid: string) {
  const auth = getAdminAuth()
  const profiles = (await getAdminDatabase().ref("users").get()).val() || {}
  let pageToken: string | undefined
  let count = 0
  do {
    const page = await auth.listUsers(1000, pageToken)
    count += page.users.filter((user) =>
      user.uid !== excludedUid &&
      !user.disabled &&
      user.customClaims?.role === "admin" &&
      user.customClaims?.disabled !== true &&
      profiles[user.uid]?.role === "admin" &&
      profiles[user.uid]?.disabled === false,
    ).length
    pageToken = page.pageToken
  } while (pageToken && count === 0)
  return count
}

export async function GET(request: Request) {
  try {
    await requireAdmin(request)
    const auth = getAdminAuth()
    const profiles = (await getAdminDatabase().ref("users").get()).val() || {}
    const users = []
    let pageToken: string | undefined

    const HUMAN_ROLES = new Set(["admin", "operator", "viewer"])
    do {
      const page = await auth.listUsers(1000, pageToken)
      users.push(...page.users
        // Only managed accounts: those provisioned with a profile or an
        // explicit human role claim. Legacy Firebase Auth accounts without
        // either cannot use the app and must not appear as phantom viewers.
        .filter((user) => user.customClaims?.device !== true)
        .filter((user) => profiles[user.uid] || HUMAN_ROLES.has(user.customClaims?.role as string))
        .map((user) => publicUser(user, profiles[user.uid])))
      pageToken = page.pageToken
    } while (pageToken)

    users.sort((a, b) => a.email.localeCompare(b.email))
    return json({users})
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireAdmin(request)
    const input = await readJson<CreateUserInput>(request)
    const email = cleanEmail(input.email)
    const displayName = cleanText(input.displayName, "Nama")
    const role = requireRole(input.role)
    const password = input.password === undefined
      ? makePassword()
      : cleanText(input.password, "Kata sandi", 128)
    if (password.length < 12) {
      throw new AdminApiError("bad-request", "Kata sandi minimal 12 karakter")
    }

    const auth = getAdminAuth()
    const database = getAdminDatabase()
    const operationId = randomUUID()
    const record = await auth.createUser({
      email,
      displayName,
      password,
      disabled: false,
      emailVerified: false,
    })

    try {
      await auth.setCustomUserClaims(record.uid, {role, disabled: false})
      await database.ref(`users/${record.uid}`).set({
        uid: record.uid,
        email,
        displayName,
        role,
        disabled: false,
        operationId,
        updatedByUid: actor.uid,
        createdAt: ServerValue.TIMESTAMP,
        updatedAt: ServerValue.TIMESTAMP,
      })
      const created = {...publicUser(record), role, disabled: false}
      await writeAudit({
        entity: "user",
        entityId: record.uid,
        action: "create",
        actor,
        before: null,
        after: created,
        operationId,
      })

      return json({
        user: {...created, operationId},
        ...(input.password === undefined ? {temporaryPassword: password} : {}),
      }, {status: 201})
    } catch (error) {
      await Promise.allSettled([
        auth.deleteUser(record.uid),
        database.ref(`users/${record.uid}`).remove(),
      ])
      throw error
    }
  } catch (error) {
    return errorResponse(error)
  }
}

export async function PATCH(request: Request) {
  try {
    const actor = await requireAdmin(request)
    const input = await readJson<UpdateUserInput>(request)
    const uid = cleanText(input.uid, "UID", 128)
    const auth = getAdminAuth()
    const database = getAdminDatabase()
    const current = await auth.getUser(uid)
    if (current.customClaims?.device === true) {
      throw new AdminApiError("bad-request", "Gunakan administrasi scanner untuk akun perangkat")
    }

    const currentProfile = (await database.ref(`users/${uid}`).get()).val() || {}
    const before = publicUser(current, currentProfile)
    const role: UserRole = input.role === undefined
      ? before.role
      : requireRole(input.role)
    const disabled = input.disabled === undefined
      ? before.disabled
      : typeof input.disabled === "boolean"
        ? input.disabled
        : (() => { throw new AdminApiError("bad-request", "Status akun tidak valid") })()
    const displayName = optionalText(input.displayName, "Nama") ?? before.displayName

    if (uid === actor.uid && (disabled || role !== "admin")) {
      throw new AdminApiError("bad-request", "Admin tidak dapat menonaktifkan atau menurunkan perannya sendiri")
    }
    if (before.role === "admin" && !before.disabled && (disabled || role !== "admin")) {
      if (await countOtherActiveAdmins(uid) === 0) {
        throw new AdminApiError("conflict", "Minimal satu admin aktif harus dipertahankan")
      }
    }

    const operationId = randomUUID()
    const updated = await auth.updateUser(uid, {displayName, disabled})
    await auth.setCustomUserClaims(uid, {
      ...(current.customClaims || {}),
      role,
      disabled,
    })
    if (disabled) await auth.revokeRefreshTokens(uid)
    await database.ref(`users/${uid}`).set({
      ...currentProfile,
      uid,
      email: current.email || String(currentProfile.email || ""),
      displayName,
      role,
      disabled,
      operationId,
      updatedByUid: actor.uid,
      createdAt: currentProfile.createdAt || ServerValue.TIMESTAMP,
      updatedAt: ServerValue.TIMESTAMP,
    })

    const after = {...publicUser(updated, currentProfile), role, disabled, displayName}
    await writeAudit({
      entity: "user",
      entityId: uid,
      action: before.disabled !== disabled ? (disabled ? "disable" : "enable") : "update",
      actor,
      before,
      after,
      operationId,
    })
    return json({user: {...after, operationId}})
  } catch (error) {
    return errorResponse(error)
  }
}
