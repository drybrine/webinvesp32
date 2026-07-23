"use client"

import * as React from "react"
import { Card as HeroCard } from "@heroui/react"
import { cn } from "@/lib/utils"

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & { variant?: "default" | "secondary" | "tertiary" | "transparent" }>(
  ({ className, variant = "default", children, ...props }, ref) => (
    <HeroCard ref={ref as never} variant={variant} className={cn("w-full text-foreground", className)} {...(props as Record<string, unknown>)}>
      {children}
    </HeroCard>
  ),
)
Card.displayName = "Card"

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => (
    <HeroCard.Header ref={ref as never} className={cn(className)} {...(props as Record<string, unknown>)}>
      {children}
    </HeroCard.Header>
  ),
)
CardHeader.displayName = "CardHeader"

const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, children, ...props }, ref) => (
    <HeroCard.Title ref={ref as never} className={cn("text-foreground", className)} {...(props as Record<string, unknown>)}>
      {children}
    </HeroCard.Title>
  ),
)
CardTitle.displayName = "CardTitle"

const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, children, ...props }, ref) => (
    <HeroCard.Description ref={ref as never} className={cn("text-muted", className)} {...(props as Record<string, unknown>)}>
      {children}
    </HeroCard.Description>
  ),
)
CardDescription.displayName = "CardDescription"

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => (
    <HeroCard.Content ref={ref as never} className={cn(className)} {...(props as Record<string, unknown>)}>
      {children}
    </HeroCard.Content>
  ),
)
CardContent.displayName = "CardContent"

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => (
    <HeroCard.Footer ref={ref as never} className={cn(className)} {...(props as Record<string, unknown>)}>
      {children}
    </HeroCard.Footer>
  ),
)
CardFooter.displayName = "CardFooter"

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }
