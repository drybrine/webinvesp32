"use client"

import { useCallback, useEffect, useState } from "react"
import { KeyRound, Plus, Power, RefreshCw, Trash2 } from "lucide-react"
import {
  createRegisteredDevice,
  listRegisteredDevices,
  revokeRegisteredDevice,
  rotateRegisteredDevice,
  updateRegisteredDevice,
} from "@/lib/admin-api"
import type { RegisteredDevice } from "@/types/security"
import { CredentialDialog, type Credential } from "@/components/credential-dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useToast } from "@/hooks/use-toast"

export default function AdminDevicesPage() {
  const { toast } = useToast()
  const [devices, setDevices] = useState<RegisteredDevice[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ deviceId: "", label: "" })
  const [credential, setCredential] = useState<Credential | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setDevices(await listRegisteredDevices())
    } catch (error) {
      toast({ title: "Gagal memuat scanner", description: error instanceof Error ? error.message : undefined, variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { void refresh() }, [refresh])

  const showCredential = (deviceId: string, email: string, password: string) => {
    setCredential({
      title: "Kredensial scanner",
      description: "Salin dan masukkan ke web lokal firmware sekarang. Kata sandi hanya ditampilkan satu kali.",
      fields: [
        { label: "Device ID", value: deviceId, mono: true },
        { label: "Email", value: email, mono: true },
        { label: "Kata sandi", value: password, mono: true },
      ],
    })
  }

  const create = async () => {
    try {
      const result = await createRegisteredDevice(form)
      setForm({ deviceId: "", label: "" })
      setOpen(false)
      showCredential(result.device.deviceId, result.device.email, result.password)
      await refresh()
    } catch (error) {
      toast({ title: "Gagal mendaftarkan scanner", description: error instanceof Error ? error.message : undefined, variant: "destructive" })
    }
  }

  const rotate = async (device: RegisteredDevice) => {
    try {
      const result = await rotateRegisteredDevice(device.uid)
      showCredential(result.device.deviceId, result.device.email, result.password)
      await refresh()
    } catch (error) {
      toast({ title: "Gagal merotasi kredensial", description: error instanceof Error ? error.message : undefined, variant: "destructive" })
    }
  }

  const toggleDisabled = async (device: RegisteredDevice) => {
    try {
      await updateRegisteredDevice({ uid: device.uid, disabled: !device.disabled })
      await refresh()
    } catch (error) {
      toast({ title: "Gagal mengubah status scanner", description: error instanceof Error ? error.message : undefined, variant: "destructive" })
    }
  }

  const revoke = async (device: RegisteredDevice) => {
    try {
      await revokeRegisteredDevice(device.uid)
      await refresh()
    } catch (error) {
      toast({ title: "Gagal mencabut scanner", description: error instanceof Error ? error.message : undefined, variant: "destructive" })
    }
  }

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div><h1 className="text-3xl font-bold">Scanner Terdaftar</h1><p className="text-sm text-muted-foreground">Setiap scanner dipetakan ke satu akun Firebase Auth dan satu deviceId.</p></div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-2" />Daftarkan Scanner</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Scanner Baru</DialogTitle></DialogHeader>
            <div className="space-y-4 py-3">
              <div className="space-y-2"><Label>Device ID</Label><Input placeholder="ESP32-1234ABCD" value={form.deviceId} onChange={(event) => setForm({ ...form, deviceId: event.target.value.toUpperCase() })} /></div>
              <div className="space-y-2"><Label>Label</Label><Input placeholder="Scanner Gudang Utama" value={form.label} onChange={(event) => setForm({ ...form, label: event.target.value })} /></div>
            </div>
            <DialogFooter><Button onClick={create} disabled={!form.deviceId || !form.label}>Buat Kredensial</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div><CardTitle>Perangkat</CardTitle><CardDescription>Rotasi menghasilkan kata sandi baru; firmware hanya menyimpan refresh token.</CardDescription></div>
          <Button variant="ghost" size="sm" onClick={() => void refresh()}><RefreshCw className="w-4 h-4" /></Button>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Scanner</TableHead><TableHead>Akun</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Aksi</TableHead></TableRow></TableHeader>
            <TableBody>
              {loading ? <TableRow><TableCell colSpan={4} className="text-center py-10">Memuat...</TableCell></TableRow> : devices.map((device) => (
                <TableRow key={device.uid}>
                  <TableCell><div className="font-medium">{device.label}</div><div className="font-mono text-xs">{device.deviceId}</div></TableCell>
                  <TableCell className="text-sm">{device.email}</TableCell>
                  <TableCell><Badge variant={device.disabled ? "destructive" : "default"}>{device.disabled ? "Dicabut" : "Aktif"}</Badge></TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button variant="ghost" size="sm" onClick={() => void rotate(device)} title="Rotasi kredensial"><KeyRound className="w-4 h-4" /></Button>
                    <Button variant="outline" size="sm" onClick={() => void toggleDisabled(device)}><Power className="w-4 h-4 mr-2" />{device.disabled ? "Aktifkan" : "Nonaktifkan"}</Button>
                    <Button variant="ghost" size="sm" className="text-destructive" onClick={() => void revoke(device)} title="Cabut permanen"><Trash2 className="w-4 h-4" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <CredentialDialog credential={credential} onClose={() => setCredential(null)} />
    </div>
  )
}
