"use client"

import * as React from "react"
import { TextArea as HeroTextArea } from "@heroui/react"
import { cn } from "@/lib/utils"

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, disabled, ...props }, ref) => (
  <HeroTextArea
    ref={ref as never}
    disabled={disabled}
    fullWidth
    variant="primary"
    className={cn("min-h-[80px] bg-surface tracking-normal", className)}
    {...(props as Record<string, unknown>)}
  />
))
Textarea.displayName = "Textarea"

export { Textarea }
