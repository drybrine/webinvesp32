"use client"

import { useCallback, useEffect, useState } from "react"
import { KeyRound, Plus, RefreshCw, UserCog } from "lucide-react"
import {
  createPasswordResetLink,
  createUserAccount,
  listUsers,
  updateUserAccount,
} from "@/lib/admin-api"
import type { UserProfile, UserRole } from "@/types/security"
import { CredentialDialog, type Credential } from "@/components/credential-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"

export default function AdminUsersPage() {
  const { toast } = useToast()
  const [users, setUsers] = useState<UserProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ email: "", displayName: "", role: "viewer" as UserRole })
  const [credential, setCredential] = useState<Credential | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setUsers(await listUsers())
    } catch (error) {
      toast({ title: "Gagal memuat pengguna", description: error instanceof Error ? error.message : undefined, variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const create = async () => {
    try {
      const result = await createUserAccount(form)
      const email = form.email
      setOpen(false)
      setForm({ email: "", displayName: "", role: "viewer" })
      await refresh()
      if (result.temporaryPassword) {
        setCredential({
          title: "Akun dibuat",
          description: "Salin kata sandi sementara sekarang. Nilai ini hanya ditampilkan satu kali.",
          fields: [
            { label: "Email", value: email },
            { label: "Kata sandi sementara", value: result.temporaryPassword, mono: true },
          ],
        })
      } else {
        toast({ title: "Pengguna dibuat", description: "Akun siap digunakan." })
      }
    } catch (error) {
      toast({ title: "Gagal membuat pengguna", description: error instanceof Error ? error.message : undefined, variant: "destructive" })
    }
  }

  const changeRole = async (user: UserProfile, role: UserRole) => {
    try {
      await updateUserAccount({ uid: user.uid, role })
      await refresh()
    } catch (error) {
      toast({ title: "Gagal mengubah peran", description: error instanceof Error ? error.message : undefined, variant: "destructive" })
    }
  }

  const toggleDisabled = async (user: UserProfile) => {
    try {
      await updateUserAccount({ uid: user.uid, disabled: !user.disabled })
      await refresh()
    } catch (error) {
      toast({ title: "Gagal mengubah status akun", description: error instanceof Error ? error.message : undefined, variant: "destructive" })
    }
  }

  const resetPassword = async (user: UserProfile) => {
    try {
      const link = await createPasswordResetLink(user.email)
      setCredential({
        title: "Tautan reset kata sandi",
        description: "Salin tautan ini dan kirim kepada pengguna. Tautan hanya ditampilkan sekali.",
        fields: [
          { label: "Email", value: user.email },
          { label: "Tautan reset", value: link, mono: true },
        ],
      })
    } catch (error) {
      toast({ title: "Gagal membuat tautan reset", description: error instanceof Error ? error.message : undefined, variant: "destructive" })
    }
  }

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Administrasi Pengguna</h1>
          <p className="text-sm text-muted-foreground">Buat akun internal, atur peran, dan cabut akses.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild><a href="/admin/devices">Kelola Scanner</a></Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-2" />Tambah Pengguna</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Pengguna Baru</DialogTitle></DialogHeader>
              <div className="space-y-4 py-3">
                <div className="space-y-2"><Label>Email</Label><Input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></div>
                <div className="space-y-2"><Label>Nama</Label><Input value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} /></div>
                <div className="space-y-2">
                  <Label>Peran</Label>
                  <Select value={form.role} onValueChange={(role: UserRole) => setForm({ ...form, role })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="operator">Operator</SelectItem>
                      <SelectItem value="viewer">Viewer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter><Button onClick={create} disabled={!form.email || !form.displayName}>Buat Akun</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div><CardTitle>Daftar Pengguna</CardTitle><CardDescription>Pendaftaran publik tidak tersedia.</CardDescription></div>
          <Button variant="ghost" size="sm" onClick={() => void refresh()}><RefreshCw className="w-4 h-4" /></Button>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Pengguna</TableHead><TableHead>Peran</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Aksi</TableHead></TableRow></TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={4} className="text-center py-10">Memuat...</TableCell></TableRow>
              ) : users.map((user) => (
                <TableRow key={user.uid}>
                  <TableCell><div className="font-medium">{user.displayName || user.email}</div><div className="text-xs text-muted-foreground">{user.email}</div></TableCell>
                  <TableCell>
                    <Select value={user.role} onValueChange={(role: UserRole) => void changeRole(user, role)}>
                      <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="admin">Admin</SelectItem><SelectItem value="operator">Operator</SelectItem><SelectItem value="viewer">Viewer</SelectItem></SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell><Badge variant={user.disabled ? "destructive" : "default"}>{user.disabled ? "Nonaktif" : "Aktif"}</Badge></TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button variant="ghost" size="sm" onClick={() => void resetPassword(user)} title="Salin tautan reset"><KeyRound className="w-4 h-4" /></Button>
                    <Button variant="outline" size="sm" onClick={() => void toggleDisabled(user)}><UserCog className="w-4 h-4 mr-2" />{user.disabled ? "Aktifkan" : "Nonaktifkan"}</Button>
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
