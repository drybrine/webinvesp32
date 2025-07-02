"use client"

import { createContext, useContext } from "react"

export interface RealtimeAttendanceContextType {
  isProcessing: boolean
  lastProcessedNim: string | null
  processCount: number
}

export const RealtimeAttendanceContext = createContext<RealtimeAttendanceContextType>({
  isProcessing: false,
  lastProcessedNim: null,
  processCount: 0,
})

export const useRealtimeAttendance = () => useContext(RealtimeAttendanceContext)
