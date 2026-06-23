"use client"

import { useEffect, useState } from "react"
import { equalTo, onValue, orderByChild, query, ref } from "firebase/database"
import { database } from "@/lib/firebase"
import type { AuditLogEntry } from "@/types/security"

export function AuditTimeline({ entityId }: { entityId: string }) {
  const [logs, setLogs] = useState<AuditLogEntry[]>([])

  useEffect(() => {
    if (!database) return
    return onValue(query(ref(database, "auditLogs"), orderByChild("entityId"), equalTo(entityId)), (snapshot) => {
      const value = snapshot.val() || {}
      setLogs(Object.entries(value).map(([id, entry]) => ({ ...(entry as Omit<AuditLogEntry, "id">), id })).sort((a, b) => b.timestamp - a.timestamp))
    })
  }, [entityId])

  if (!logs.length) return <p className="text-xs text-muted-foreground">Belum ada audit untuk item ini.</p>

  const grouped = logs.reduce<Record<string, AuditLogEntry[]>>((groups, log) => {
    const key = log.operationId || log.id
    groups[key] = [...(groups[key] || []), log]
    return groups
  }, {})

  return (
    <div className="space-y-3 max-h-52 overflow-y-auto">
      {Object.entries(grouped).map(([operationId, entries]) => (
        <div key={operationId} className="border-l-2 border-primary/30 pl-3">
          <div className="text-[10px] font-mono text-muted-foreground">{operationId}</div>
          {entries.map((entry) => (
            <div key={entry.id} className="text-xs mt-1">
              <span className="font-semibold">{entry.action}</span>{" "}
              <span className="text-muted-foreground">{entry.changedFields.join(", ") || entry.entity}</span>
              <div className="text-[10px] text-muted-foreground">{new Date(entry.timestamp || Date.now()).toLocaleString("id-ID")} · {entry.actorUid}</div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
