import { errorResponse, json, requireAdmin } from "@/lib/server/admin-api"
import { listFirmwareBuilds } from "@/lib/server/firmware-ota"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    await requireAdmin(request)
    const builds = await listFirmwareBuilds()
    return json({builds})
  } catch (error) {
    return errorResponse(error)
  }
}
