import { randomUUID } from "node:crypto"
import { ServerValue } from "firebase-admin/database"
import {
  AdminApiError,
  cleanText,
  errorResponse,
  json,
  readJson,
  requireAdmin,
  writeAudit,
} from "@/lib/server/admin-api"
import { getAdminDatabase } from "@/lib/server/firebase-admin"
import { getFirmwareRelease, isValidFirmwareVersion } from "@/lib/server/firmware-ota"
import type { OtaCommand } from "@/types/firmware"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type DispatchInput = {version?: unknown; deviceIds?: unknown}
type CancelInput = {deviceIds?: unknown}

const DEVICE_ID = /^ESP32-[A-F0-9]{8}$/

function cleanDeviceIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new AdminApiError("bad-request", "Pilih minimal satu scanner")
  }
  if (value.length > 50) {
    throw new AdminApiError("bad-request", "Terlalu banyak scanner dalam satu perintah")
  }
  const ids = value.map((entry) => cleanText(entry, "Device ID", 32).toUpperCase())
  for (const id of ids) {
    if (!DEVICE_ID.test(id)) throw new AdminApiError("bad-request", `Device ID tidak valid: ${id}`)
  }
  return [...new Set(ids)]
}

async function registeredDeviceIds(): Promise<Set<string>> {
  const mappings = (await getAdminDatabase().ref("deviceAuth").get()).val() || {}
  const ids = new Set<string>()
  for (const value of Object.values(mappings)) {
    const device = value as {deviceId?: unknown; disabled?: unknown}
    if (typeof device.deviceId === "string" && device.disabled !== true) ids.add(device.deviceId.toUpperCase())
  }
  return ids
}

export async function GET(request: Request) {
  try {
    await requireAdmin(request)
    const database = getAdminDatabase()
    const [commandsSnap, statusSnap] = await Promise.all([
      database.ref("deviceCommands").get(),
      database.ref("deviceOtaStatus").get(),
    ])
    const commands = (commandsSnap.val() || {}) as Record<string, {ota?: unknown}>
    const statuses = (statusSnap.val() || {}) as Record<string, unknown>
    const deviceIds = new Set([...Object.keys(commands), ...Object.keys(statuses)])
    const states = [...deviceIds].map((deviceId) => ({
      deviceId,
      command: commands[deviceId]?.ota ?? undefined,
      status: statuses[deviceId] ?? undefined,
    }))
    return json({states})
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireAdmin(request)
    const input = await readJson<DispatchInput>(request)
    const version = cleanText(input.version, "Versi firmware", 20)
    if (!isValidFirmwareVersion(version)) {
      throw new AdminApiError("bad-request", "Versi firmware tidak valid")
    }
    const deviceIds = cleanDeviceIds(input.deviceIds)

    const release = await getFirmwareRelease(version)
    if (!release) {
      throw new AdminApiError("not-found", `Release firmware v${version} tidak ditemukan atau belum lengkap`)
    }

    const known = await registeredDeviceIds()
    const unknown = deviceIds.filter((id) => !known.has(id))
    if (unknown.length > 0) {
      throw new AdminApiError("bad-request", `Scanner tidak terdaftar: ${unknown.join(", ")}`)
    }

    const database = getAdminDatabase()
    const operationId = randomUUID()
    const updates: Record<string, unknown> = {}
    for (const deviceId of deviceIds) {
      const command: OtaCommand = {
        commandId: randomUUID(),
        version: release.version,
        releaseTag: release.releaseTag,
        binaryUrl: release.binaryUrl,
        size: release.size,
        sha256: release.sha256,
        signature: release.signature,
        issuedByUid: actor.uid,
        issuedAt: Date.now(),
      }
      updates[`deviceCommands/${deviceId}/ota`] = {...command, issuedAt: ServerValue.TIMESTAMP}
    }
    await database.ref().update(updates)

    await writeAudit({
      entity: "firmware",
      entityId: version,
      action: "ota-dispatch",
      actor,
      before: null,
      after: {version, deviceIds, releaseTag: release.releaseTag},
      operationId,
    })
    return json({ok: true, dispatched: deviceIds.length, version}, {status: 202})
  } catch (error) {
    return errorResponse(error)
  }
}

export async function DELETE(request: Request) {
  try {
    const actor = await requireAdmin(request)
    const input = await readJson<CancelInput>(request)
    const deviceIds = cleanDeviceIds(input.deviceIds)

    const database = getAdminDatabase()
    const operationId = randomUUID()
    const updates: Record<string, unknown> = {}
    for (const deviceId of deviceIds) {
      updates[`deviceCommands/${deviceId}/ota`] = null
    }
    await database.ref().update(updates)

    await writeAudit({
      entity: "firmware",
      entityId: deviceIds.join(","),
      action: "ota-cancel",
      actor,
      before: {deviceIds},
      after: null,
      operationId,
    })
    return json({ok: true, cancelled: deviceIds.length})
  } catch (error) {
    return errorResponse(error)
  }
}
