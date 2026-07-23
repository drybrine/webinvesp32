"use client"

import * as React from "react"
import { Chip } from "@heroui/react"
import { cn } from "@/lib/utils"

type BadgeVariant = "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "danger" | "accent"

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: BadgeVariant
}

function mapVariant(variant: BadgeVariant): {
  color: "default" | "accent" | "success" | "warning" | "danger"
  chipVariant: "primary" | "secondary" | "tertiary" | "soft"
} {
  switch (variant) {
    case "destructive":
    case "danger":
      return { color: "danger", chipVariant: "soft" }
    case "success":
      return { color: "success", chipVariant: "soft" }
    case "warning":
      return { color: "warning", chipVariant: "soft" }
    case "accent":
      return { color: "accent", chipVariant: "soft" }
    case "secondary":
      return { color: "default", chipVariant: "soft" }
    case "outline":
      return { color: "default", chipVariant: "secondary" }
    default:
      return { color: "accent", chipVariant: "primary" }
  }
}

function Badge({ className, variant = "default", children, ...props }: BadgeProps) {
  const { color, chipVariant } = mapVariant(variant)
  return (
    <Chip color={color} variant={chipVariant} size="sm" className={cn(className)} {...(props as Record<string, unknown>)}>
      {children}
    </Chip>
  )
}

export { Badge }
