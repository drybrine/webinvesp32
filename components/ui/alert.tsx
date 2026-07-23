"use client"

import * as React from "react"
import { Alert as HeroAlert } from "@heroui/react"
import { cn } from "@/lib/utils"

const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { variant?: "default" | "destructive" }
>(({ className, variant = "default", children, ...props }, ref) => (
  <HeroAlert
    ref={ref as never}
    status={variant === "destructive" ? "danger" : "default"}
    className={cn(className)}
    {...(props as Record<string, unknown>)}
  >
    <HeroAlert.Indicator />
    <HeroAlert.Content>{children}</HeroAlert.Content>
  </HeroAlert>
))
Alert.displayName = "Alert"

const AlertTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, children, ...props }, ref) => (
    <HeroAlert.Title ref={ref as never} className={cn(className)} {...(props as Record<string, unknown>)}>
      {children}
    </HeroAlert.Title>
  ),
)
AlertTitle.displayName = "AlertTitle"

const AlertDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, children, ...props }, ref) => (
    <HeroAlert.Description ref={ref as never} className={cn(className)} {...(props as Record<string, unknown>)}>
      {children}
    </HeroAlert.Description>
  ),
)
AlertDescription.displayName = "AlertDescription"

export { Alert, AlertTitle, AlertDescription }
