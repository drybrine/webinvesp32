import { errorResponse, json, requireAdmin } from "@/lib/server/admin-api"
import { listFirmwareReleases } from "@/lib/server/firmware-ota"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    await requireAdmin(request)
    const releases = await listFirmwareReleases()
    return json({releases})
  } catch (error) {
    return errorResponse(error)
  }
}
