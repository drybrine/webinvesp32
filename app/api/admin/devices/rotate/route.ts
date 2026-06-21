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
  // Keep ":" out because firmware provisioning uses it as the field delimiter.
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

    const now = Date.now()
    const after = publicDevice({...mapping, disabled: false, rotatedAt: now, updatedAt: now})
    const updates = await Promise.allSettled([
      auth.setCustomUserClaims(uid, {
        ...(record.customClaims || {}),
        disabled: false,
      }),
      auth.revokeRefreshTokens(uid),
      mappingRef.set({
        ...mapping,
        disabled: false,
        operationId,
        updatedByUid: actor.uid,
        rotatedAt: ServerValue.TIMESTAMP,
        updatedAt: ServerValue.TIMESTAMP,
      }),
    ])

    let warning: string | undefined
    if (updates.some((result) => result.status === "rejected")) {
      console.error("Device credential rotation metadata sync failed:", updates)
      warning = "Kata sandi sudah berubah, tetapi sinkronisasi metadata belum lengkap. Simpan kredensial ini dan coba lagi bila scanner belum terhubung."
    } else {
      try {
        await writeAudit({
          entity: "device",
          entityId: uid,
          action: "rotate",
          actor,
          before,
          after,
          operationId,
        })
      } catch (error) {
        console.error("Device credential rotation audit failed:", error)
        warning = "Kata sandi sudah berubah, tetapi audit gagal dicatat. Simpan kredensial ini."
      }
    }

    return json({device: after, password, warning})
  } catch (error) {
    return errorResponse(error)
  }
}
