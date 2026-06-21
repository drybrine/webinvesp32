import { randomUUID } from "node:crypto"
import {
  AdminApiError,
  cleanText,
  errorResponse,
  json,
  optionalText,
  readJson,
  requireAdmin,
  writeAudit,
} from "@/lib/server/admin-api"
import { isValidFirmwareVersion, triggerFirmwareBuild } from "@/lib/server/firmware-ota"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type BuildInput = {version?: unknown; notes?: unknown}

export async function POST(request: Request) {
  try {
    const actor = await requireAdmin(request)
    const input = await readJson<BuildInput>(request)
    const version = cleanText(input.version, "Versi firmware", 20)
    if (!isValidFirmwareVersion(version)) {
      throw new AdminApiError("bad-request", "Versi harus berformat semver, mis. 6.4.0")
    }
    const notes = optionalText(input.notes, "Catatan rilis", 2000) || ""

    const operationId = randomUUID()
    await triggerFirmwareBuild(version, notes)
    await writeAudit({
      entity: "firmware",
      entityId: version,
      action: "firmware-build",
      actor,
      before: null,
      after: {version, notes, releaseTag: `firmware-v${version}`},
      operationId,
    })
    return json({ok: true, version}, {status: 202})
  } catch (error) {
    return errorResponse(error)
  }
}
