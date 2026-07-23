"use client"

import * as React from "react"
import { toast as heroToast } from "@heroui/react"

const TOAST_LIMIT = 5
const DEFAULT_TOAST_DURATION = 5000

type ToasterToast = {
  id: string
  title?: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactElement
  variant?: "default" | "destructive"
  open?: boolean
  onOpenChange?: (open: boolean) => void
  duration?: number
}

let count = 0

function genId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER
  return count.toString()
}

export type ToastHistoryEntry = {
  id: string
  title?: React.ReactNode
  description?: React.ReactNode
  variant?: "default" | "destructive"
  createdAt: number
  dismissedAt: number | null
  read: boolean
}

const HISTORY_LIMIT = 50
const HISTORY_LISTENERS: Array<() => void> = []
let historyMemory: ToastHistoryEntry[] = []

function todayKey() {
  return new Date().toISOString().slice(0, 10)
}

function loadHistoryFromStorage(): ToastHistoryEntry[] {
  if (typeof window === "undefined") return []
  try {
    const raw = sessionStorage.getItem(`notification-history-${todayKey()}`)
    if (!raw) return []
    const parsed = JSON.parse(raw) as ToastHistoryEntry[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function persistHistory() {
  if (typeof window === "undefined") return
  try {
    sessionStorage.setItem(`notification-history-${todayKey()}`, JSON.stringify(historyMemory))
  } catch {
    // ignore
  }
}

function notifyHistoryListeners() {
  HISTORY_LISTENERS.forEach((l) => l())
}

function recordToastAdded(toast: ToasterToast) {
  const entry: ToastHistoryEntry = {
    id: toast.id,
    title: toast.title,
    description: toast.description,
    variant: toast.variant,
    createdAt: Date.now(),
    dismissedAt: null,
    read: false,
  }
  historyMemory = [entry, ...historyMemory].slice(0, HISTORY_LIMIT)
  persistHistory()
  notifyHistoryListeners()
}

function recordToastDismissed(toastId: string | undefined) {
  if (!toastId) return
  const idx = historyMemory.findIndex((h) => h.id === toastId)
  if (idx === -1) return
  historyMemory = historyMemory.map((h) =>
    h.id === toastId ? { ...h, dismissedAt: h.dismissedAt ?? Date.now() } : h,
  )
  persistHistory()
  notifyHistoryListeners()
}

function clearHistory() {
  historyMemory = []
  persistHistory()
  notifyHistoryListeners()
}

function markAllRead() {
  historyMemory = historyMemory.map((h) => ({ ...h, read: true }))
  persistHistory()
  notifyHistoryListeners()
}

type ToastInput = Omit<ToasterToast, "id">

const activeKeys = new Map<string, string>()

function toast(props: ToastInput) {
  const id = genId()
  const title = typeof props.title === "string" ? props.title : props.title != null ? String(props.title) : undefined
  const description =
    typeof props.description === "string"
      ? props.description
      : props.description != null
        ? String(props.description)
        : undefined
  const timeout = props.duration ?? DEFAULT_TOAST_DURATION
  const isDestructive = props.variant === "destructive"

  const message = title ?? description ?? ""
  const opts = {
    description: title ? description : undefined,
    timeout,
    onClose: () => {
      activeKeys.delete(id)
      recordToastDismissed(id)
    },
  }

  const key = isDestructive
    ? heroToast.danger(message, opts)
    : heroToast(message, { ...opts, variant: "default" })

  activeKeys.set(id, key)
  recordToastAdded({ ...props, id })

  return {
    id,
    dismiss: () => {
      const k = activeKeys.get(id)
      if (k) heroToast.close(k)
      activeKeys.delete(id)
      recordToastDismissed(id)
    },
    update: () => {
      // HeroUI queue has no in-place update; no-op for compat
    },
  }
}

function useToast() {
  return {
    toasts: [] as ToasterToast[],
    toast,
    dismiss: (toastId?: string) => {
      if (!toastId) {
        heroToast.clear()
        return
      }
      const k = activeKeys.get(toastId)
      if (k) heroToast.close(k)
      activeKeys.delete(toastId)
      recordToastDismissed(toastId)
    },
  }
}

function useToastHistory() {
  const [entries, setEntries] = React.useState<ToastHistoryEntry[]>(() =>
    typeof window === "undefined" ? [] : loadHistoryFromStorage(),
  )

  React.useEffect(() => {
    const listener = () => setEntries(loadHistoryFromStorage())
    HISTORY_LISTENERS.push(listener)
    // hydrate once
    setEntries(loadHistoryFromStorage())
    return () => {
      const idx = HISTORY_LISTENERS.indexOf(listener)
      if (idx > -1) HISTORY_LISTENERS.splice(idx, 1)
    }
  }, [])

  return {
    entries,
    unreadCount: entries.filter((e) => !e.read).length,
    markAllRead,
    clearHistory,
  }
}

// keep export surface for any reducer consumers (none expected)
export const reducer = () => ({ toasts: [] as ToasterToast[] })

export { useToast, useToastHistory, toast }
