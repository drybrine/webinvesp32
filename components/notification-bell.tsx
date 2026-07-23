"use client"

import * as React from "react"
import { Bell, AlertTriangle, CheckCheck, Trash2, Info } from "lucide-react"
import { useToastHistory, type ToastHistoryEntry } from "@/hooks/use-toast"
import { Button } from "@heroui/react"
import { cn } from "@/lib/utils"

function formatTime(ts: number) {
  const d = new Date(ts)
  return d.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  })
}

function renderNode(node: React.ReactNode): string {
  if (node == null || node === false) return ""
  if (typeof node === "string" || typeof node === "number") return String(node)
  return ""
}

function EntryRow({ entry }: { entry: ToastHistoryEntry }) {
  const title = renderNode(entry.title)
  const description = renderNode(entry.description)
  const isDestructive = entry.variant === "destructive"
  return (
    <div
      className={cn(
        "flex gap-2 border-b border-border px-3 py-2 last:border-b-0",
        !entry.read ? "bg-default" : "bg-overlay",
      )}
    >
      <div className="mt-0.5 shrink-0">
        {isDestructive ? (
          <AlertTriangle className="h-4 w-4 text-danger" />
        ) : (
          <Info className="h-4 w-4 text-muted" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        {title && (
          <p className="truncate text-sm font-medium text-foreground">{title}</p>
        )}
        {description && (
          <p className="line-clamp-2 text-xs text-muted">{description}</p>
        )}
        <p className="mt-1 text-[10px] uppercase tracking-wide text-muted">
          {formatTime(entry.createdAt)}
          {entry.dismissedAt ? " · dilihat" : ""}
        </p>
      </div>
    </div>
  )
}

export function NotificationBell() {
  const { entries, unreadCount, markAllRead, clearHistory } = useToastHistory()
  const [open, setOpen] = React.useState(false)
  const containerRef = React.useRef<HTMLDivElement | null>(null)

  React.useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (!containerRef.current) return
      if (!containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", handleClick)
    document.addEventListener("keydown", handleKey)
    return () => {
      document.removeEventListener("mousedown", handleClick)
      document.removeEventListener("keydown", handleKey)
    }
  }, [open])

  const handleToggle = () => {
    const next = !open
    setOpen(next)
    if (next && unreadCount > 0) markAllRead()
  }

  return (
    <div ref={containerRef} className="relative">
      <Button
        variant="ghost"
        size="sm"
        isIconOnly
        onPress={handleToggle}
        className="relative"
        aria-label="Riwayat notifikasi"
        aria-expanded={open}
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span
            className={cn(
              "pointer-events-none absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full px-1",
              "bg-danger text-[10px] font-semibold text-danger-foreground",
            )}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </Button>

      {open && (
        <div
          role="dialog"
          aria-label="Riwayat notifikasi"
          className={cn(
            "absolute right-0 z-50 mt-2 flex w-80 max-w-[calc(100vw-1rem)] flex-col overflow-hidden",
            "rounded-2xl border border-border bg-overlay text-overlay-foreground shadow-overlay",
          )}
        >
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <p className="text-sm font-semibold text-foreground">Riwayat Notifikasi</p>
            <div className="flex items-center gap-1">
              {entries.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  isIconOnly
                  onPress={clearHistory}
                  className="h-7 text-xs text-muted"
                  aria-label="Hapus semua notifikasi"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {entries.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-muted">
                Belum ada notifikasi hari ini.
              </div>
            ) : (
              entries.map((entry) => <EntryRow key={entry.id} entry={entry} />)
            )}
          </div>

          {entries.length > 0 && (
            <div className="flex items-center justify-end gap-1 border-t border-border bg-surface-secondary px-3 py-2">
              <Button
                variant="ghost"
                size="sm"
                onPress={markAllRead}
                className="h-7 px-2 text-xs"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                Tandai dibaca
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default NotificationBell