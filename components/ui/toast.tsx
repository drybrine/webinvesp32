"use client"

import * as React from "react"
import * as ToastPrimitives from "@radix-ui/react-toast"
import { cva, type VariantProps } from "class-variance-authority"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"

const ToastProvider = ToastPrimitives.Provider

const ToastViewport = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Viewport>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Viewport>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Viewport
    ref={ref}
    className={cn(
      "fixed inset-x-0 bottom-0 z-[100] flex max-h-screen w-full flex-col-reverse p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] sm:inset-x-auto sm:bottom-5 sm:right-5 sm:w-[min(420px,calc(100vw-2.5rem))] sm:flex-col sm:p-0",
      className
    )}
    {...props}
  />
))
ToastViewport.displayName = ToastPrimitives.Viewport.displayName

const toastVariants = cva(
  "toast-motion group pointer-events-auto relative my-1 flex w-full items-start gap-3 overflow-hidden rounded-lg border p-4 pr-10 shadow-[0_18px_45px_-24px_rgb(0_0_0_/_0.55),0_8px_20px_-16px_rgb(0_0_0_/_0.35)] backdrop-blur-sm transition-[transform,opacity] data-[swipe=cancel]:translate-x-0 data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)] data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=move]:transition-none",
  {
    variants: {
      variant: {
        default: "border-border/80 bg-card/95 text-card-foreground",
        destructive:
          "destructive border-destructive/30 bg-red-50/95 text-red-950 dark:border-red-900/70 dark:bg-red-950/95 dark:text-red-50",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

const Toast = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Root> &
    VariantProps<typeof toastVariants>
>(({ className, variant, ...props }, ref) => {
  const toastRef = React.useRef<React.ElementRef<typeof ToastPrimitives.Root>>(null)

  const setRefs = React.useCallback(
    (node: React.ElementRef<typeof ToastPrimitives.Root> | null) => {
      toastRef.current = node

      if (typeof ref === "function") {
        ref(node)
      } else if (ref) {
        ref.current = node
      }
    },
    [ref],
  )

  React.useLayoutEffect(() => {
    const node = toastRef.current
    if (node?.dataset.state === "open") {
      node.style.setProperty("--toast-height", `${node.getBoundingClientRect().height}px`)
    }
  })

  return (
    <ToastPrimitives.Root
      ref={setRefs}
      className={cn(toastVariants({ variant }), className)}
      {...props}
    />
  )
})
Toast.displayName = ToastPrimitives.Root.displayName

const ToastAction = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Action>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Action>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Action
    ref={ref}
    className={cn(
      "inline-flex h-9 shrink-0 items-center justify-center rounded-md border bg-background/80 px-3 text-sm font-medium ring-offset-background transition-colors hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 group-[.destructive]:border-red-200 group-[.destructive]:bg-white/80 group-[.destructive]:text-red-950 group-[.destructive]:hover:bg-red-100 group-[.destructive]:focus:ring-destructive dark:group-[.destructive]:border-red-900 dark:group-[.destructive]:bg-red-950 dark:group-[.destructive]:text-red-50",
      className
    )}
    {...props}
  />
))
ToastAction.displayName = ToastPrimitives.Action.displayName

const ToastClose = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Close>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Close>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Close
    ref={ref}
    className={cn(
      "absolute right-2.5 top-2.5 inline-flex h-7 w-7 items-center justify-center rounded-md text-foreground/45 opacity-70 transition-colors hover:bg-muted hover:text-foreground focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring group-hover:opacity-100 group-[.destructive]:text-red-700/70 group-[.destructive]:hover:bg-red-100 group-[.destructive]:hover:text-red-950 group-[.destructive]:focus:ring-red-400 dark:group-[.destructive]:text-red-200/70 dark:group-[.destructive]:hover:bg-red-900/60 dark:group-[.destructive]:hover:text-red-50",
      className
    )}
    toast-close=""
    aria-label="Tutup notifikasi"
    {...props}
  >
    <X className="h-4 w-4" />
    <span className="sr-only">Tutup</span>
  </ToastPrimitives.Close>
))
ToastClose.displayName = ToastPrimitives.Close.displayName

const ToastTitle = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Title>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Title>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Title
    ref={ref}
    className={cn("text-sm font-semibold leading-5 tracking-normal", className)}
    {...props}
  />
))
ToastTitle.displayName = ToastPrimitives.Title.displayName

const ToastDescription = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Description>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Description>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Description
    ref={ref}
    className={cn("text-sm leading-5 text-muted-foreground group-[.destructive]:text-red-800 dark:group-[.destructive]:text-red-100/85", className)}
    {...props}
  />
))
ToastDescription.displayName = ToastPrimitives.Description.displayName

type ToastProps = React.ComponentPropsWithoutRef<typeof Toast>

type ToastActionElement = React.ReactElement<typeof ToastAction>

export {
  type ToastProps,
  type ToastActionElement,
  ToastProvider,
  ToastViewport,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastClose,
  ToastAction,
}
