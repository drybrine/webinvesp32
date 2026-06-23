"use client"

import { useState, useCallback, useEffect } from "react"

export type ScanMode = "ask" | "in" | "out"

const STORAGE_KEY = "scanDefaultMode"
const DEFAULT_MODE: ScanMode = "ask"

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
  } catch { /* localStorage unavailable */ }
}

export function useScanMode() {
  const [scanMode, setScanModeState] = useState<ScanMode>(readMode)

  // Sync from other tabs
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        const val = e.newValue as ScanMode | null
        if (val === "in" || val === "out" || val === "ask") setScanModeState(val)
      }
    }
    window.addEventListener("storage", handler)
    return () => window.removeEventListener("storage", handler)
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
