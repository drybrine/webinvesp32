"use client"

import { Toast, ToastClose, ToastDescription, ToastProvider, ToastTitle, ToastViewport } from "@/components/ui/toast"
import { useToast } from "@/hooks/use-toast"
import { AlertTriangle, CheckCircle2 } from "lucide-react"

export function Toaster() {
  const { toasts } = useToast()

  return (
    <ToastProvider duration={5000} swipeDirection="right">
      {toasts.map(({ id, title, description, action, variant, ...props }) => {
        const isDestructive = variant === "destructive"
        const Icon = isDestructive ? AlertTriangle : CheckCircle2

        return (
          <Toast key={id} variant={variant} {...props}>
            <div
              className={
                isDestructive
                  ? "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-700 dark:bg-red-900/70 dark:text-red-100"
                  : "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
              }
              aria-hidden="true"
            >
              <Icon className="h-4 w-4" />
            </div>
            <div className="grid min-w-0 flex-1 gap-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && <ToastDescription>{description}</ToastDescription>}
            </div>
            {action}
            <ToastClose />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
