import { randomBytes, randomUUID } from "node:crypto"
import type { UserRecord } from "firebase-admin/auth"
import { ServerValue } from "firebase-admin/database"
import {
  AdminApiError,
  cleanText,
  errorResponse,
  json,
  publicDevice,
  readJson,
  requireAdmin,
  writeAudit,
} from "@/lib/server/admin-api"
import { getAdminAuth, getAdminDatabase } from "@/lib/server/firebase-admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type CreateDeviceInput = {deviceId?: unknown; label?: unknown}
type UpdateDeviceInput = {uid?: unknown; disabled?: unknown}
type RevokeDeviceInput = {uid?: unknown}

function makePassword() {
  // Keep ":" out because firmware provisioning uses it as the field delimiter.
  return `${randomBytes(18).toString("base64url")}aA1!`
}

function cleanDeviceId(value: unknown) {
  const deviceId = cleanText(value, "Device ID", 32).toUpperCase()
  if (!/^ESP32-[A-F0-9]{8}$/.test(deviceId)) {
    throw new AdminApiError("bad-request", "Device ID harus berformat ESP32-XXXXXXXX")
  }
  return deviceId
}

export async function GET(request: Request) {
  try {
    await requireAdmin(request)
    const mappings = (await getAdminDatabase().ref("deviceAuth").get()).val() || {}
    const devices = Object.entries(mappings)
      .map(([uid, value]) => publicDevice({uid, ...(value as Record<string, unknown>)}))
      .sort((a, b) => a.deviceId.localeCompare(b.deviceId))
    return json({devices})
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireAdmin(request)
    const input = await readJson<CreateDeviceInput>(request)
    const deviceId = cleanDeviceId(input.deviceId)
    const label = cleanText(input.label, "Label")
    const email = `${deviceId.toLowerCase()}@devices.stokmanager.internal`
    const password = makePassword()
    const operationId = randomUUID()
    const auth = getAdminAuth()
    const database = getAdminDatabase()

    // ponytail: device registry is tiny; add an index/query only if it grows large.
    const mappings = (await database.ref("deviceAuth").get()).val() || {}
    if (Object.values(mappings).some((value) => String((value as {deviceId?: unknown}).deviceId || "").toUpperCase() === deviceId)) {
      throw new AdminApiError("conflict", "Device ID sudah terdaftar")
    }

    let record: UserRecord
    let created = false
    try {
      record = await auth.getUserByEmail(email)
      const profileExists = (await database.ref(`users/${record.uid}`).get()).exists()
      const role = record.customClaims?.role
      const claimedDeviceId = String(record.customClaims?.deviceId || "").toUpperCase()
      if (
        mappings[record.uid] ||
        profileExists ||
        role === "admin" ||
        role === "operator" ||
        role === "viewer" ||
        (claimedDeviceId && claimedDeviceId !== deviceId)
      ) {
        throw new AdminApiError("conflict", "Akun tersebut sudah terdaftar dan tidak dapat dipulihkan otomatis")
      }
      await auth.updateUser(record.uid, {password, displayName: label, disabled: false})
      await auth.revokeRefreshTokens(record.uid)
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error
        ? String((error as {code: unknown}).code)
        : ""
      if (code !== "auth/user-not-found") throw error
      record = await auth.createUser({email, password, displayName: label})
      created = true
    }

    try {
      await auth.setCustomUserClaims(record.uid, {
        role: "device",
        device: true,
        deviceId,
        disabled: false,
      })
      await database.ref().update({
        [`deviceAuth/${record.uid}`]: {
          uid: record.uid,
          deviceId,
          email,
          label,
          disabled: false,
          operationId,
          updatedByUid: actor.uid,
          createdAt: ServerValue.TIMESTAMP,
          updatedAt: ServerValue.TIMESTAMP,
        },
        [`devices/${deviceId}`]: null,
      })
      const device = publicDevice({
        uid: record.uid,
        deviceId,
        email,
        label,
        disabled: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
      await writeAudit({
        entity: "device",
        entityId: record.uid,
        action: "create",
        actor,
        before: null,
        after: device,
        operationId,
      })
      return json({device, password}, {status: 201})
    } catch (error) {
      await database.ref(`deviceAuth/${record.uid}`).remove()
      if (created) await auth.deleteUser(record.uid)
      throw error
    }
  } catch (error) {
    return errorResponse(error)
  }
}

export async function PATCH(request: Request) {
  try {
    const actor = await requireAdmin(request)
    const input = await readJson<UpdateDeviceInput>(request)
    const uid = cleanText(input.uid, "UID", 128)
    if (typeof input.disabled !== "boolean") {
      throw new AdminApiError("bad-request", "Status scanner tidak valid")
    }

    const auth = getAdminAuth()
    const database = getAdminDatabase()
    const mappingRef = database.ref(`deviceAuth/${uid}`)
    const mapping = (await mappingRef.get()).val()
    if (!mapping) throw new AdminApiError("not-found", "Scanner tidak ditemukan")

    const before = publicDevice(mapping)
    const operationId = randomUUID()
    const record = await auth.getUser(uid)
    await auth.updateUser(uid, {disabled: input.disabled})
    await auth.setCustomUserClaims(uid, {
      ...(record.customClaims || {}),
      disabled: input.disabled,
    })
    if (input.disabled) await auth.revokeRefreshTokens(uid)
    await mappingRef.set({
      ...mapping,
      disabled: input.disabled,
      operationId,
      updatedByUid: actor.uid,
      updatedAt: ServerValue.TIMESTAMP,
    })

    const after = publicDevice({...mapping, disabled: input.disabled, updatedAt: Date.now()})
    await writeAudit({
      entity: "device",
      entityId: uid,
      action: input.disabled ? "disable" : "enable",
      actor,
      before,
      after,
      operationId,
    })
    return json({device: after})
  } catch (error) {
    return errorResponse(error)
  }
}

export async function DELETE(request: Request) {
  try {
    const actor = await requireAdmin(request)
    const input = await readJson<RevokeDeviceInput>(request)
    const uid = cleanText(input.uid, "UID", 128)
    const auth = getAdminAuth()
    const database = getAdminDatabase()
    const mappingRef = database.ref(`deviceAuth/${uid}`)
    const mapping = (await mappingRef.get()).val()
    if (!mapping) throw new AdminApiError("not-found", "Scanner tidak ditemukan")

    const before = publicDevice(mapping)
    const operationId = randomUUID()
    await auth.updateUser(uid, {disabled: true})
    await auth.revokeRefreshTokens(uid)
    await Promise.all([
      mappingRef.remove(),
      database.ref(`devices/${before.deviceId}`).remove(),
    ])
    await auth.deleteUser(uid)
    await writeAudit({
      entity: "device",
      entityId: uid,
      action: "revoke",
      actor,
      before,
      after: null,
      operationId,
    })
    return json({ok: true})
  } catch (error) {
    return errorResponse(error)
  }
}
