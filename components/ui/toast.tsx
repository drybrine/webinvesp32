"use client"

import type * as React from "react"

export type ToastProps = {
  id?: string
  title?: React.ReactNode
  description?: React.ReactNode
  variant?: "default" | "destructive"
  open?: boolean
  onOpenChange?: (open: boolean) => void
  duration?: number
}

export type ToastActionElement = React.ReactElement
