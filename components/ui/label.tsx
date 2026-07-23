"use client"

import * as React from "react"
import { Label as HeroLabel } from "@heroui/react"
import { cn } from "@/lib/utils"

const Label = React.forwardRef<HTMLLabelElement, React.LabelHTMLAttributes<HTMLLabelElement>>(
  ({ className, ...props }, ref) => (
    <HeroLabel ref={ref as never} className={cn("text-sm font-medium", className)} {...(props as Record<string, unknown>)} />
  ),
)
Label.displayName = "Label"

export { Label }
