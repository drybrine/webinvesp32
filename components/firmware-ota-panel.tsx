"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Cpu, Hammer, RefreshCw, Rocket, XCircle } from "lucide-react"
import {
  cancelFirmwareUpdate,
  dispatchFirmwareUpdate,
  listDeviceOtaStates,
  listFirmwareBuilds,
  listFirmwareReleases,
  triggerFirmwareBuild,
} from "@/lib/admin-api"
import { useRealtimeDeviceStatus } from "@/hooks/use-realtime-device-status"
import type { DeviceOtaState, FirmwareBuild, FirmwareRelease, OtaPhase } from "@/types/firmware"
import { ESP32_CONFIG } from "@/lib/esp32-config"
import type { RegisteredDevice } from "@/types/security"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"

const PHASE_LABELS: Record<OtaPhase, string> = {
  pending: "Menunggu",
  deferred: "Ditunda (baterai/idle)",
  downloading: "Mengunduh",
  verifying: "Verifikasi tanda tangan",
  flashing: "Memasang",
  success: "Berhasil",
  failed: "Gagal",
  rollback: "Rollback",
}

function phaseVariant(phase: OtaPhase): "default" | "secondary" | "destructive" | "outline" {
  if (phase === "success") return "default"
  if (phase === "failed" || phase === "rollback") return "destructive"
  if (phase === "deferred") return "outline"
  return "secondary"
}

function buildBadge(build: FirmwareBuild) {
  if (build.status !== "completed") return <Badge variant="secondary">{build.status}</Badge>
  if (build.conclusion === "success") return <Badge>Sukses</Badge>
  return <Badge variant="destructive">{build.conclusion || "gagal"}</Badge>
}

export function FirmwareOtaPanel({ registeredDevices }: { registeredDevices: RegisteredDevice[] }) {
  const { toast } = useToast()
  const { devices } = useRealtimeDeviceStatus()

  const [version, setVersion] = useState("")
  const [notes, setNotes] = useState("")
  const [building, setBuilding] = useState(false)
  const [builds, setBuilds] = useState<FirmwareBuild[]>([])
  const [releases, setReleases] = useState<FirmwareRelease[]>([])
  const [otaStates, setOtaStates] = useState<DeviceOtaState[]>([])
  const [loading, setLoading] = useState(true)

  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [targetVersion, setTargetVersion] = useState("")
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [dispatching, setDispatching] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [b, r, s] = await Promise.all([
        listFirmwareBuilds().catch(() => []),
        listFirmwareReleases().catch(() => []),
        listDeviceOtaStates().catch(() => []),
      ])
      setBuilds(b)
      setReleases(r)
      setOtaStates(s)
      if (r.length > 0 && !r.some((release) => release.version === targetVersion)) {
        setTargetVersion(r[0].version)
      }
    } catch (error) {
      toast({ title: "Gagal memuat data OTA", description: error instanceof Error ? error.message : undefined, variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }, [toast, targetVersion])

  useEffect(() => { void refresh() }, [refresh])

  const otaByDevice = useMemo(() => {
    const map = new Map<string, DeviceOtaState>()
    otaStates.forEach((state) => map.set(state.deviceId, state))
    return map
  }, [otaStates])

  const deviceIds = useMemo(
    () => registeredDevices.filter((device) => !device.disabled).map((device) => device.deviceId),
    [registeredDevices],
  )
  const selectedIds = useMemo(() => deviceIds.filter((id) => selected[id]), [deviceIds, selected])

  const build = async () => {
    setBuilding(true)
    try {
      await triggerFirmwareBuild({ version: version.trim(), notes: notes.trim() || undefined })
      toast({ title: "Build firmware dimulai", description: `Versi ${version.trim()} sedang dikompilasi di GitHub Actions.` })
      setNotes("")
      setTimeout(() => { void refresh() }, 2500)
    } catch (error) {
      toast({ title: "Gagal memulai build", description: error instanceof Error ? error.message : undefined, variant: "destructive" })
    } finally {
      setBuilding(false)
    }
  }

  const dispatch = async () => {
    setDispatching(true)
    try {
      const result = await dispatchFirmwareUpdate({ version: targetVersion, deviceIds: selectedIds })
      toast({ title: "Perintah update terkirim", description: `${result.dispatched} scanner akan memperbarui ke v${targetVersion} saat idle.` })
      setSelected({})
      setConfirmOpen(false)
      setTimeout(() => { void refresh() }, 1500)
    } catch (error) {
      toast({ title: "Gagal mengirim update", description: error instanceof Error ? error.message : undefined, variant: "destructive" })
    } finally {
      setDispatching(false)
    }
  }

  const cancel = async (deviceId: string) => {
    try {
      await cancelFirmwareUpdate([deviceId])
      toast({ title: "Perintah update dibatalkan", description: deviceId })
      void refresh()
    } catch (error) {
      toast({ title: "Gagal membatalkan", description: error instanceof Error ? error.message : undefined, variant: "destructive" })
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Hammer className="w-5 h-5" />Build Firmware</CardTitle>
            <CardDescription>Picu GitHub Actions untuk mengompilasi, menandatangani, dan menerbitkan firmware sebagai release.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Versi (semver)</Label>
              <Input placeholder={ESP32_CONFIG.VERSION} value={version} onChange={(event) => setVersion(event.target.value)} />
              <p className="text-xs text-muted-foreground">Harus sama dengan FIRMWARE_VERSION pada sketch.</p>
            </div>
            <div className="space-y-2">
              <Label>Catatan rilis</Label>
              <Textarea placeholder="Perubahan pada versi ini..." value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} />
            </div>
            <Button onClick={() => void build()} disabled={building || !/^\d+\.\d+\.\d+$/.test(version.trim())}>
              <Hammer className="w-4 h-4 mr-2" />{building ? "Memulai..." : "Build Firmware"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Status Build</CardTitle>
              <CardDescription>Riwayat workflow terbaru.</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => void refresh()}><RefreshCw className="w-4 h-4" /></Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {loading ? <p className="text-sm text-muted-foreground">Memuat...</p> : builds.length === 0 ? (
              <p className="text-sm text-muted-foreground">Belum ada build.</p>
            ) : builds.slice(0, 6).map((b) => (
              <a key={b.id} href={b.htmlUrl} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-md border p-2 text-sm hover:bg-muted/50">
                <span className="truncate mr-2">{b.name}</span>
                {buildBadge(b)}
              </a>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Cpu className="w-5 h-5" />Release Tersedia</CardTitle>
          <CardDescription>Hanya release dengan binary bertanda tangan dan manifest valid yang ditampilkan.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {loading ? <p className="text-sm text-muted-foreground">Memuat...</p> : releases.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada release firmware yang valid.</p>
          ) : releases.map((release) => (
            <div key={release.releaseId} className="rounded-md border p-3">
              <div className="flex items-center justify-between">
                <div className="font-medium">v{release.version}</div>
                <Badge variant="outline">{(release.size / 1024).toFixed(0)} KB</Badge>
              </div>
              {release.notes ? <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{release.notes}</p> : null}
              <p className="mt-1 font-mono text-[11px] text-muted-foreground break-all">sha256: {release.sha256}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2"><Rocket className="w-5 h-5" />Rollout ke Scanner</CardTitle>
            <CardDescription>Pilih scanner, lalu kirim perintah update. Scanner menarik update saat idle dan baterai ≥30%.</CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={() => void refresh()}><RefreshCw className="w-4 h-4" /></Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="space-y-2">
              <Label>Versi target</Label>
              <Select value={targetVersion} onValueChange={setTargetVersion}>
                <SelectTrigger className="w-[180px]"><SelectValue placeholder="Pilih versi" /></SelectTrigger>
                <SelectContent>
                  {releases.map((release) => (
                    <SelectItem key={release.releaseId} value={release.version}>v{release.version}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={() => setConfirmOpen(true)}
              disabled={selectedIds.length === 0 || !targetVersion}
            >
              <Rocket className="w-4 h-4 mr-2" />Update {selectedIds.length > 0 ? `(${selectedIds.length})` : ""}
            </Button>
          </div>

          <div className="space-y-2">
            {deviceIds.length === 0 ? (
              <p className="text-sm text-muted-foreground">Belum ada scanner yang terdaftar.</p>
            ) : deviceIds.map((deviceId) => {
              const device = devices.find((d) => d.deviceId === deviceId)
              const state = otaByDevice.get(deviceId)
              const phase = state?.status?.phase
              return (
                <div key={deviceId} className="flex flex-wrap items-center gap-3 rounded-md border p-3">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={!!selected[deviceId]}
                    onChange={(event) => setSelected((prev) => ({ ...prev, [deviceId]: event.target.checked }))}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-sm">{deviceId}</div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant={device?.status === "online" ? "default" : "secondary"}>{device?.status || "offline"}</Badge>
                      <span>Aktif: v{device?.version || "?"}</span>
                      {state?.command?.version ? <span>Target: v{state.command.version}</span> : null}
                      {typeof device?.batteryLevel === "number" ? <span>Baterai: {device.batteryLevel}%</span> : null}
                    </div>
                  </div>
                  {phase ? (
                    <Badge variant={phaseVariant(phase)}>
                      {PHASE_LABELS[phase]}{typeof state?.status?.progress === "number" && phase === "downloading" ? ` ${state.status.progress}%` : ""}
                    </Badge>
                  ) : null}
                  {state?.command ? (
                    <Button variant="ghost" size="sm" className="text-destructive" onClick={() => void cancel(deviceId)} title="Batalkan perintah">
                      <XCircle className="w-4 h-4" />
                    </Button>
                  ) : null}
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Kirim update firmware?</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedIds.length} scanner akan diperintahkan memperbarui ke v{targetVersion}. Scanner hanya memasang update saat idle dan baterai ≥30%. Disarankan menguji satu scanner (canary) sebelum rollout penuh.
              <span className="mt-2 block font-mono text-xs break-all">{selectedIds.join(", ")}</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={dispatching}>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={(event) => { event.preventDefault(); void dispatch() }} disabled={dispatching}>
              {dispatching ? "Mengirim..." : "Kirim Update"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
