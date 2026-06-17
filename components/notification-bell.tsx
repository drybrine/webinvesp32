"use client"

import * as React from "react"
import { Bell, AlertTriangle, CheckCheck, Trash2, Info } from "lucide-react"
import { useToastHistory, type ToastHistoryEntry } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
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
        "flex gap-2 px-3 py-2 border-b border-border last:border-b-0",
        !entry.read && "bg-accent/40",
      )}
    >
      <div className="mt-0.5 shrink-0">
        {isDestructive ? (
          <AlertTriangle className="w-4 h-4 text-destructive" />
        ) : (
          <Info className="w-4 h-4 text-muted-foreground" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        {title && (
          <p className="text-sm font-medium text-foreground truncate">{title}</p>
        )}
        {description && (
          <p className="text-xs text-muted-foreground line-clamp-2">{description}</p>
        )}
        <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground/70">
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
        onClick={handleToggle}
        className="relative p-2 rounded-md hover:bg-accent"
        aria-label="Riwayat notifikasi"
        aria-expanded={open}
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span
            className={cn(
              "absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full",
              "bg-destructive text-destructive-foreground text-[10px] font-semibold",
              "flex items-center justify-center pointer-events-none",
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
            "absolute right-0 mt-2 w-80 max-w-[calc(100vw-1rem)] z-50",
            "bg-popover text-popover-foreground border border-border rounded-md shadow-lg",
            "flex flex-col overflow-hidden",
          )}
        >
          <div className="flex items-center justify-between px-3 py-2 border-b border-border">
            <p className="text-sm font-semibold">Riwayat Notifikasi</p>
            <div className="flex items-center gap-1">
              {entries.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearHistory}
                  className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                  aria-label="Hapus semua notifikasi"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {entries.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                Belum ada notifikasi hari ini.
              </div>
            ) : (
              entries.map((entry) => <EntryRow key={entry.id} entry={entry} />)
            )}
          </div>

          {entries.length > 0 && (
            <div className="flex items-center justify-end gap-1 px-3 py-2 border-t border-border bg-muted/40">
              <Button
                variant="ghost"
                size="sm"
                onClick={markAllRead}
                className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
              >
                <CheckCheck className="w-3.5 h-3.5 mr-1" />
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