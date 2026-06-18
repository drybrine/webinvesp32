"use client"

import * as React from "react"

const TOAST_LIMIT = 5
const DEFAULT_TOAST_DURATION = 5000
const TOAST_DISMISS_GAP = 450
const TOAST_REMOVE_DELAY = 350

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

const actionTypes = {
  ADD_TOAST: "ADD_TOAST",
  UPDATE_TOAST: "UPDATE_TOAST",
  DISMISS_TOAST: "DISMISS_TOAST",
  REMOVE_TOAST: "REMOVE_TOAST",
} as const

let count = 0
let lastAutoDismissAt = 0

function genId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER
  return count.toString()
}

function getStaggeredDuration(duration: number) {
  if (!Number.isFinite(duration) || duration <= 0) {
    return duration
  }

  const now = Date.now()
  const dismissAt = Math.max(
    now + duration,
    lastAutoDismissAt + TOAST_DISMISS_GAP,
  )

  lastAutoDismissAt = dismissAt
  return dismissAt - now
}

type ActionType = typeof actionTypes

type Action =
  | {
      type: ActionType["ADD_TOAST"]
      toast: ToasterToast
    }
  | {
      type: ActionType["UPDATE_TOAST"]
      toast: Partial<ToasterToast>
    }
  | {
      type: ActionType["DISMISS_TOAST"]
      toastId?: ToasterToast["id"]
    }
  | {
      type: ActionType["REMOVE_TOAST"]
      toastId?: ToasterToast["id"]
    }

interface State {
  toasts: ToasterToast[]
}

const toastTimeouts = new Map<string, ReturnType<typeof setTimeout>>()

const addToRemoveQueue = (toastId: string) => {
  if (toastTimeouts.has(toastId)) {
    return
  }

  const timeout = setTimeout(() => {
    toastTimeouts.delete(toastId)
    dispatch({
      type: "REMOVE_TOAST",
      toastId: toastId,
    })
  }, TOAST_REMOVE_DELAY)

  toastTimeouts.set(toastId, timeout)
}

export const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case "ADD_TOAST":
      return {
        ...state,
        toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT),
      }

    case "UPDATE_TOAST":
      return {
        ...state,
        toasts: state.toasts.map((t) => (t.id === action.toast.id ? { ...t, ...action.toast } : t)),
      }

    case "DISMISS_TOAST": {
      const { toastId } = action

      if (toastId) {
        addToRemoveQueue(toastId)
      } else {
        state.toasts.forEach((toast) => {
          addToRemoveQueue(toast.id)
        })
      }

      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === toastId || toastId === undefined
            ? {
                ...t,
                open: false,
              }
            : t,
        ),
      }
    }
    case "REMOVE_TOAST":
      if (action.toastId === undefined) {
        return {
          ...state,
          toasts: [],
        }
      }
      return {
        ...state,
        toasts: state.toasts.filter((t) => t.id !== action.toastId),
      }
  }
}

const listeners: Array<(state: State) => void> = []

let memoryState: State = { toasts: [] }

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
    sessionStorage.setItem(
      `notification-history-${todayKey()}`,
      JSON.stringify(historyMemory),
    )
  } catch {
    // ignore quota/serialization errors
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

function dispatch(action: Action) {
  memoryState = reducer(memoryState, action)
  listeners.forEach((listener) => {
    listener(memoryState)
  })

  if (action.type === "ADD_TOAST") {
    recordToastAdded(action.toast)
  } else if (action.type === "DISMISS_TOAST") {
    recordToastDismissed(action.toastId)
  }
}

type Toast = Omit<ToasterToast, "id">

function toast({ ...props }: Toast) {
  const id = genId()
  const duration = getStaggeredDuration(
    props.duration ?? DEFAULT_TOAST_DURATION,
  )

  const update = (props: ToasterToast) =>
    dispatch({
      type: "UPDATE_TOAST",
      toast: { ...props, id },
    })
  const dismiss = () => dispatch({ type: "DISMISS_TOAST", toastId: id })

  dispatch({
    type: "ADD_TOAST",
    toast: {
      ...props,
      id,
      open: true,
      duration,
      onOpenChange: (open: boolean) => {
        if (!open) dismiss()
      },
    },
  })

  return {
    id: id,
    dismiss,
    update,
  }
}

function useToast() {
  const [state, setState] = React.useState<State>(memoryState)

  React.useEffect(() => {
    listeners.push(setState)
    return () => {
      const index = listeners.indexOf(setState)
      if (index > -1) {
        listeners.splice(index, 1)
      }
    }
  }, [state])

  return {
    ...state,
    toast,
    dismiss: (toastId?: string) => dispatch({ type: "DISMISS_TOAST", toastId }),
  }
}

function useToastHistory() {
  const [entries, setEntries] = React.useState<ToastHistoryEntry[]>(() =>
    typeof window === "undefined" ? [] : loadHistoryFromStorage(),
  )

  React.useEffect(() => {
    HISTORY_LISTENERS.push(() => setEntries(loadHistoryFromStorage()))
    return () => {
      const idx = HISTORY_LISTENERS.indexOf(setEntries as unknown as () => void)
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

export { useToast, useToastHistory, toast }
