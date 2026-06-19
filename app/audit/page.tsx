"use client"

import { useEffect, useMemo, useState } from "react"
import { limitToLast, onValue, orderByChild, query, ref } from "firebase/database"
import { database } from "@/lib/firebase"
import type { AuditLogEntry } from "@/types/security"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([])
  const [actor, setActor] = useState("")
  const [action, setAction] = useState("all")
  const [entity, setEntity] = useState("all")
  const [date, setDate] = useState("")

  useEffect(() => {
    if (!database) return
    return onValue(query(ref(database, "auditLogs"), orderByChild("timestamp"), limitToLast(1000)), (snapshot) => {
      const value = snapshot.val() || {}
      setLogs(
        Object.entries(value)
          .map(([id, entry]) => ({ ...(entry as Omit<AuditLogEntry, "id">), id }))
          .sort((a, b) => b.timestamp - a.timestamp),
      )
    })
  }, [])

  const filtered = useMemo(() => logs.filter((log) => {
    const actorMatch = !actor || log.actorUid.toLowerCase().includes(actor.toLowerCase())
    const actionMatch = action === "all" || log.action === action
    const entityMatch = entity === "all" || log.entity === entity
    const dateMatch = !date || new Date(log.timestamp).toISOString().slice(0, 10) === date
    return actorMatch && actionMatch && entityMatch && dateMatch
  }), [action, actor, date, entity, logs])

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      <div><h1 className="text-3xl font-bold">Audit Administrasi</h1><p className="text-sm text-muted-foreground">Riwayat operasi admin yang dibuat Vercel Function. Entri tidak dapat diedit atau dihapus oleh klien.</p></div>
      <Card>
        <CardHeader><CardTitle>Filter Audit</CardTitle><CardDescription>{filtered.length} dari {logs.length} entri terbaru</CardDescription></CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <Input placeholder="UID aktor" value={actor} onChange={(event) => setActor(event.target.value)} />
          <Select value={action} onValueChange={setAction}><SelectTrigger><SelectValue placeholder="Aksi" /></SelectTrigger><SelectContent><SelectItem value="all">Semua aksi</SelectItem><SelectItem value="create">Create</SelectItem><SelectItem value="update">Update</SelectItem><SelectItem value="delete">Delete</SelectItem><SelectItem value="disable">Disable</SelectItem><SelectItem value="enable">Enable</SelectItem><SelectItem value="rotate">Rotate</SelectItem></SelectContent></Select>
          <Select value={entity} onValueChange={setEntity}><SelectTrigger><SelectValue placeholder="Entitas" /></SelectTrigger><SelectContent><SelectItem value="all">Semua entitas</SelectItem><SelectItem value="inventory">Inventory</SelectItem><SelectItem value="transaction">Transaksi</SelectItem><SelectItem value="user">Pengguna</SelectItem><SelectItem value="device">Perangkat</SelectItem><SelectItem value="scan">Scan</SelectItem></SelectContent></Select>
          <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </CardContent>
      </Card>
      <Card><CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Waktu</TableHead><TableHead>Aktor</TableHead><TableHead>Entitas</TableHead><TableHead>Aksi</TableHead><TableHead>Perubahan</TableHead><TableHead>Operation ID</TableHead></TableRow></TableHeader>
          <TableBody>{filtered.map((log) => (
            <TableRow key={log.id}>
              <TableCell className="whitespace-nowrap text-sm">{new Date(log.timestamp).toLocaleString("id-ID")}</TableCell>
              <TableCell><div className="font-mono text-xs">{log.actorUid}</div><div className="text-xs text-muted-foreground">{log.actorType}</div></TableCell>
              <TableCell><div className="font-medium">{log.entity}</div><div className="font-mono text-xs text-muted-foreground">{log.entityId}</div></TableCell>
              <TableCell><Badge variant="outline">{log.action}</Badge></TableCell>
              <TableCell className="max-w-xs text-xs">{log.changedFields?.join(", ") || "—"}</TableCell>
              <TableCell className="font-mono text-xs">{log.operationId || "—"}</TableCell>
            </TableRow>
          ))}</TableBody>
        </Table>
      </CardContent></Card>
    </div>
  )
}

