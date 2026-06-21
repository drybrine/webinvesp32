// OTA firmware update contracts shared between the admin API, the admin UI,
// and (informally) the ESP32 firmware. Binaries live on public GitHub Releases;
// the device verifies an ECDSA P-256 signature before activating an update.

export interface FirmwareManifest {
  version: string
  releaseTag: string
  binaryUrl: string
  size: number
  sha256: string
  signature: string
  board: string
  partitionScheme: string
  createdAt: string
}

export interface FirmwareRelease extends FirmwareManifest {
  releaseId: number
  htmlUrl: string
  notes: string
  prerelease: boolean
  publishedAt?: string
}

export type FirmwareBuildStatus = "queued" | "in_progress" | "completed" | "waiting" | "requested" | "pending"
export type FirmwareBuildConclusion =
  | "success"
  | "failure"
  | "cancelled"
  | "skipped"
  | "timed_out"
  | "action_required"
  | "neutral"
  | "stale"
  | null

export interface FirmwareBuild {
  id: number
  name: string
  status: FirmwareBuildStatus
  conclusion: FirmwareBuildConclusion
  htmlUrl: string
  createdAt: string
  updatedAt: string
}

// Lifecycle of an OTA on a single device, written by the firmware to
// /deviceOtaStatus/{deviceId} and surfaced in the admin UI.
export type OtaPhase =
  | "pending"
  | "deferred"
  | "downloading"
  | "verifying"
  | "flashing"
  | "success"
  | "failed"
  | "rollback"

// Command the admin issues to a device, written by the Vercel Admin SDK to
// /deviceCommands/{deviceId}/ota. The device polls this on every heartbeat.
export interface OtaCommand {
  commandId: string
  version: string
  releaseTag: string
  binaryUrl: string
  size: number
  sha256: string
  signature: string
  issuedByUid: string
  issuedAt: number
}

export interface OtaStatus {
  commandId?: string
  phase: OtaPhase
  version?: string
  progress?: number
  message?: string
  updatedAt: number
}

export interface DeviceOtaState {
  deviceId: string
  command?: OtaCommand
  status?: OtaStatus
}
