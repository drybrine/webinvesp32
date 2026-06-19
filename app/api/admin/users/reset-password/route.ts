import { randomUUID } from "node:crypto"
import {
  cleanEmail,
  errorResponse,
  json,
  publicUser,
  readJson,
  requireAdmin,
  writeAudit,
} from "@/lib/server/admin-api"
import { getAdminAuth, getAdminDatabase } from "@/lib/server/firebase-admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type ResetPasswordInput = {email?: unknown}

export async function POST(request: Request) {
  try {
    const actor = await requireAdmin(request)
    const input = await readJson<ResetPasswordInput>(request)
    const email = cleanEmail(input.email)
    const auth = getAdminAuth()
    const record = await auth.getUserByEmail(email)
    const profile = (await getAdminDatabase().ref(`users/${record.uid}`).get()).val() || {}
    const operationId = randomUUID()
    const resetLink = await auth.generatePasswordResetLink(email)
    const user = publicUser(record, profile)

    await writeAudit({
      entity: "user",
      entityId: record.uid,
      action: "reset-password",
      actor,
      before: user,
      after: user,
      operationId,
    })
    return json({resetLink})
  } catch (error) {
    return errorResponse(error)
  }
}
