"use client"

import { useState, useCallback, useEffect } from "react"

export type ScanMode = "ask" | "in" | "out"

const STORAGE_KEY = "scanDefaultMode"
const DEFAULT_MODE: ScanMode = "ask"
const EVENT_NAME = "localScanModeChange"

const MODE_LABELS: Record<ScanMode, string> = {
  ask: "Manual",
  in: "Auto IN",
  out: "Auto OUT",
}

const MODE_CYCLE: ScanMode[] = ["ask", "in", "out"]

function nextMode(current: ScanMode): ScanMode {
  const idx = MODE_CYCLE.indexOf(current)
  return MODE_CYCLE[(idx + 1) % MODE_CYCLE.length]
}

function readMode(): ScanMode {
  if (typeof window === "undefined") return DEFAULT_MODE
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === "in" || stored === "out" || stored === "ask") return stored
  } catch { /* localStorage unavailable */ }
  return DEFAULT_MODE
}

function writeMode(mode: ScanMode) {
  try {
    localStorage.setItem(STORAGE_KEY, mode)
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: mode }))
    }
  } catch { /* localStorage unavailable */ }
}

export function useScanMode() {
  const [scanMode, setScanModeState] = useState<ScanMode>(readMode)

  // Sync from other tabs and within the same tab
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        const val = e.newValue as ScanMode | null
        if (val === "in" || val === "out" || val === "ask") setScanModeState(val)
      }
    }
    const handleLocal = (e: Event) => {
      const val = (e as CustomEvent).detail as ScanMode
      if (val === "in" || val === "out" || val === "ask") setScanModeState(val)
    }

    window.addEventListener("storage", handleStorage)
    window.addEventListener(EVENT_NAME, handleLocal)
    return () => {
      window.removeEventListener("storage", handleStorage)
      window.removeEventListener(EVENT_NAME, handleLocal)
    }
  }, [])

  const setScanMode = useCallback((mode: ScanMode) => {
    setScanModeState(mode)
    writeMode(mode)
  }, [])

  const cycleMode = useCallback(() => {
    setScanMode(nextMode(scanMode))
  }, [scanMode, setScanMode])

  return { scanMode, setScanMode, cycleMode }
}

export { MODE_LABELS, MODE_CYCLE, nextMode }
