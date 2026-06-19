import { randomBytes, randomUUID } from "node:crypto"
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

type RotateDeviceInput = {uid?: unknown}

function makePassword() {
  return `${randomBytes(18).toString("base64url")}aA1!`
}

export async function POST(request: Request) {
  try {
    const actor = await requireAdmin(request)
    const input = await readJson<RotateDeviceInput>(request)
    const uid = cleanText(input.uid, "UID", 128)
    const auth = getAdminAuth()
    const database = getAdminDatabase()
    const mappingRef = database.ref(`deviceAuth/${uid}`)
    const mapping = (await mappingRef.get()).val()
    if (!mapping) throw new AdminApiError("not-found", "Scanner tidak ditemukan")

    const before = publicDevice(mapping)
    const password = makePassword()
    const operationId = randomUUID()
    const record = await auth.getUser(uid)
    await auth.updateUser(uid, {password, disabled: false})
    await auth.setCustomUserClaims(uid, {
      ...(record.customClaims || {}),
      disabled: false,
    })
    await auth.revokeRefreshTokens(uid)
    await mappingRef.set({
      ...mapping,
      disabled: false,
      operationId,
      updatedByUid: actor.uid,
      rotatedAt: ServerValue.TIMESTAMP,
      updatedAt: ServerValue.TIMESTAMP,
    })

    const now = Date.now()
    const after = publicDevice({...mapping, disabled: false, rotatedAt: now, updatedAt: now})
    await writeAudit({
      entity: "device",
      entityId: uid,
      action: "rotate",
      actor,
      before,
      after,
      operationId,
    })
    return json({device: after, password})
  } catch (error) {
    return errorResponse(error)
  }
}
