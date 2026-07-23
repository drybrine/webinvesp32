"use client"

import * as React from "react"
import { Input as HeroInput } from "@heroui/react"
import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input"> & { fullWidth?: boolean }>(
  ({ className, type, disabled, fullWidth = true, ...props }, ref) => (
    <HeroInput
      ref={ref as never}
      type={type}
      disabled={disabled}
      fullWidth={fullWidth}
      variant="primary"
      className={cn("tracking-normal bg-surface", className)}
      {...(props as Record<string, unknown>)}
    />
  ),
)
Input.displayName = "Input"

export { Input }
