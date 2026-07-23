"use client"

import { Spinner } from "@heroui/react"
import { cn } from "@/lib/utils"

export function LoadingSpinner({
  label = "Memuat...",
  size = "lg",
  className,
  fullScreen = false,
}: {
  label?: string
  size?: "sm" | "md" | "lg" | "xl"
  className?: string
  fullScreen?: boolean
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 text-center",
        fullScreen && "min-h-[100dvh] w-full bg-background",
        className,
      )}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <Spinner size={size} color="accent" className="text-accent" />
      {label ? <p className="text-sm text-muted">{label}</p> : null}
      <span className="sr-only">{label || "Loading"}</span>
    </div>
  )
}

export function InlineSpinner({
  size = "sm",
  className,
}: {
  size?: "sm" | "md" | "lg" | "xl"
  className?: string
}) {
  return <Spinner size={size} color="current" className={cn("text-current", className)} />
}
