export type UserRole = "admin" | "operator" | "viewer"

export interface UserProfile {
  uid: string
  email: string
  displayName: string
  role: UserRole
  disabled: boolean
  createdAt?: number
  updatedAt?: number
  lastLoginAt?: number
}

export interface RegisteredDevice {
  uid: string
  deviceId: string
  email: string
  label: string
  disabled: boolean
  createdAt?: number
  updatedAt?: number
  rotatedAt?: number
  lastSeen?: number
}

export type AuditActorType = "user" | "device" | "system"
export type AuditAction = "create" | "update" | "delete" | "disable" | "enable" | "rotate" | "revoke" | "reset-password" | "firmware-build" | "ota-dispatch" | "ota-cancel"

export interface AuditLogEntry {
  id: string
  entity: "inventory" | "transaction" | "user" | "device" | "scan" | "firmware"
  entityId: string
  action: AuditAction
  actorUid: string
  actorType: AuditActorType
  actorRole?: UserRole | "device" | "system"
  operationId?: string
  before: unknown
  after: unknown
  changedFields: string[]
  timestamp: number
}

export const WRITE_ROLES: UserRole[] = ["admin", "operator"]

export function canWrite(role: UserRole | null | undefined): boolean {
  return !!role && WRITE_ROLES.includes(role)
}

