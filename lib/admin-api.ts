"use client"

import { getFirebaseAuth } from "@/lib/firebase"
import type { DeviceOtaState, FirmwareBuild, FirmwareRelease } from "@/types/firmware"
import type { RegisteredDevice, UserProfile, UserRole } from "@/types/security"

interface ApiErrorBody {
  error?: string
}

async function adminRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const auth = await getFirebaseAuth()
  const user = auth.currentUser
  if (!user) throw new Error("Sesi telah berakhir")

  const send = async (forceRefresh: boolean) => {
    const token = await user.getIdToken(forceRefresh)
    return fetch(path, {
      ...init,
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.body ? {"Content-Type": "application/json"} : {}),
        ...init.headers,
      },
    })
  }

  let response = await send(false)
  if (response.status === 401) response = await send(true)

  const data = await response.json().catch(() => ({})) as ApiErrorBody & T
  if (!response.ok) throw new Error(data.error || "Permintaan administrasi gagal")
  return data
}

export async function listUsers(): Promise<UserProfile[]> {
  const result = await adminRequest<{users: UserProfile[]}>("/api/admin/users")
  return result.users
}

export async function createUserAccount(input: {
  email: string
  displayName: string
  role: UserRole
  password?: string
}): Promise<{user: UserProfile; temporaryPassword?: string}> {
  return adminRequest("/api/admin/users", {
    method: "POST",
    body: JSON.stringify(input),
  })
}

export async function updateUserAccount(input: {
  uid: string
  displayName?: string
  role?: UserRole
  disabled?: boolean
}): Promise<UserProfile> {
  const result = await adminRequest<{user: UserProfile}>("/api/admin/users", {
    method: "PATCH",
    body: JSON.stringify(input),
  })
  return result.user
}

export async function createPasswordResetLink(email: string): Promise<string> {
  const result = await adminRequest<{resetLink: string}>("/api/admin/users/reset-password", {
    method: "POST",
    body: JSON.stringify({email}),
  })
  return result.resetLink
}

export async function listRegisteredDevices(): Promise<RegisteredDevice[]> {
  const result = await adminRequest<{devices: RegisteredDevice[]}>("/api/admin/devices")
  return result.devices
}

export async function createRegisteredDevice(input: {
  deviceId: string
  label: string
}): Promise<{device: RegisteredDevice; password: string}> {
  return adminRequest("/api/admin/devices", {
    method: "POST",
    body: JSON.stringify(input),
  })
}

export async function updateRegisteredDevice(input: {
  uid: string
  disabled: boolean
}): Promise<RegisteredDevice> {
  const result = await adminRequest<{device: RegisteredDevice}>("/api/admin/devices", {
    method: "PATCH",
    body: JSON.stringify(input),
  })
  return result.device
}

export async function rotateRegisteredDevice(uid: string): Promise<{device: RegisteredDevice; password: string; warning?: string}> {
  return adminRequest("/api/admin/devices/rotate", {
    method: "POST",
    body: JSON.stringify({uid}),
  })
}

export async function revokeRegisteredDevice(uid: string): Promise<void> {
  await adminRequest<{ok: true}>("/api/admin/devices", {
    method: "DELETE",
    body: JSON.stringify({uid}),
  })
}

export async function triggerFirmwareBuild(input: {version: string; notes?: string}): Promise<void> {
  await adminRequest<{ok: true}>("/api/admin/firmware/build", {
    method: "POST",
    body: JSON.stringify(input),
  })
}

export async function listFirmwareBuilds(): Promise<FirmwareBuild[]> {
  const result = await adminRequest<{builds: FirmwareBuild[]}>("/api/admin/firmware/builds")
  return result.builds
}

export async function listFirmwareReleases(): Promise<FirmwareRelease[]> {
  const result = await adminRequest<{releases: FirmwareRelease[]}>("/api/admin/firmware/releases")
  return result.releases
}

export async function listDeviceOtaStates(): Promise<DeviceOtaState[]> {
  const result = await adminRequest<{states: DeviceOtaState[]}>("/api/admin/devices/ota")
  return result.states
}

export async function dispatchFirmwareUpdate(input: {version: string; deviceIds: string[]}): Promise<{dispatched: number}> {
  return adminRequest("/api/admin/devices/ota", {
    method: "POST",
    body: JSON.stringify(input),
  })
}

export async function cancelFirmwareUpdate(deviceIds: string[]): Promise<void> {
  await adminRequest<{ok: true}>("/api/admin/devices/ota", {
    method: "DELETE",
    body: JSON.stringify({deviceIds}),
  })
}
