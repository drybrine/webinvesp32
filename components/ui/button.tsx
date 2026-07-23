"use client"

import * as React from "react"
import { Button as HeroButton } from "@heroui/react"
import { cn } from "@/lib/utils"

type AppVariant = "default" | "destructive" | "outline" | "secondary" | "ghost" | "link" | "primary" | "tertiary" | "danger"
type AppSize = "default" | "sm" | "lg" | "icon" | "md"

const variantMap: Record<string, "primary" | "secondary" | "tertiary" | "outline" | "ghost" | "danger" | "danger-soft"> = {
  default: "primary",
  primary: "primary",
  destructive: "danger",
  danger: "danger",
  outline: "outline",
  secondary: "secondary",
  ghost: "ghost",
  tertiary: "tertiary",
  link: "ghost",
}

export interface ButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "color"> {
  variant?: AppVariant
  size?: AppSize
  asChild?: boolean
  isPending?: boolean
  isIconOnly?: boolean
  fullWidth?: boolean
  onPress?: () => void
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "default",
      size = "default",
      asChild = false,
      disabled,
      isPending,
      isIconOnly,
      fullWidth,
      children,
      onClick,
      onPress,
      type = "button",
      ...props
    },
    ref,
  ) => {
    const heroVariant = variantMap[variant] ?? "primary"
    const iconOnly = isIconOnly || size === "icon"
    const heroSize = size === "icon" || size === "default" ? "md" : size === "md" ? "md" : size

    if (asChild && React.isValidElement(children)) {
      const child = children as React.ReactElement<{ className?: string; onClick?: React.MouseEventHandler }>
      return React.cloneElement(child, {
        className: cn(
          "inline-flex items-center justify-center gap-2 rounded-full text-sm font-medium transition-colors",
          heroVariant === "primary" && "bg-accent text-accent-foreground hover:opacity-90",
          heroVariant === "outline" && "border border-border bg-transparent hover:bg-default",
          heroVariant === "ghost" && "hover:bg-default",
          heroVariant === "danger" && "bg-danger text-danger-foreground",
          className,
          child.props.className,
        ),
        onClick: (e: React.MouseEvent) => {
          child.props.onClick?.(e)
          onClick?.(e as React.MouseEvent<HTMLButtonElement>)
          onPress?.()
        },
      })
    }

    return (
      <HeroButton
        ref={ref as never}
        variant={heroVariant}
        size={heroSize as "sm" | "md" | "lg"}
        isIconOnly={iconOnly}
        isDisabled={disabled}
        isPending={isPending}
        fullWidth={fullWidth}
        type={type}
        className={cn(
          "gap-2 tracking-normal",
          variant === "link" && "bg-transparent shadow-none underline-offset-4 hover:underline",
          className,
        )}
        onPress={() => {
          onPress?.()
          if (onClick) onClick({} as React.MouseEvent<HTMLButtonElement>)
        }}
        {...(props as Record<string, unknown>)}
      >
        {children}
      </HeroButton>
    )
  },
)
Button.displayName = "Button"

export function buttonVariants(opts?: { variant?: AppVariant; className?: string }) {
  return cn("inline-flex items-center justify-center gap-2 rounded-full text-sm font-medium", opts?.className)
}

export { Button }
