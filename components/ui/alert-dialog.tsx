"use client"

import * as React from "react"
import { Modal } from "@heroui/react"
import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"

type Ctx = {
  open: boolean
  setOpen: (open: boolean) => void
}

const AlertDialogContext = React.createContext<Ctx | null>(null)

function useAlertDialogCtx() {
  const ctx = React.useContext(AlertDialogContext)
  if (!ctx) throw new Error("AlertDialog parts must be inside <AlertDialog>")
  return ctx
}

function AlertDialog({
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  children,
}: {
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  children?: React.ReactNode
}) {
  const [uncontrolled, setUncontrolled] = React.useState(defaultOpen)
  const isControlled = controlledOpen !== undefined
  const open = isControlled ? controlledOpen : uncontrolled
  const setOpen = React.useCallback(
    (next: boolean) => {
      if (!isControlled) setUncontrolled(next)
      onOpenChange?.(next)
    },
    [isControlled, onOpenChange],
  )
  return <AlertDialogContext.Provider value={{ open, setOpen }}>{children}</AlertDialogContext.Provider>
}

function AlertDialogTrigger({
  asChild,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }) {
  const { setOpen } = useAlertDialogCtx()
  if (asChild && React.isValidElement(children)) {
    const child = children as React.ReactElement<{ onClick?: React.MouseEventHandler }>
    return React.cloneElement(child, {
      onClick: (e: React.MouseEvent) => {
        child.props.onClick?.(e)
        setOpen(true)
      },
    })
  }
  return (
    <button type="button" onClick={() => setOpen(true)} {...props}>
      {children}
    </button>
  )
}

function AlertDialogPortal({ children }: { children?: React.ReactNode }) {
  return <>{children}</>
}

function AlertDialogOverlay({ className }: { className?: string }) {
  void className
  return null
}

function AlertDialogContent({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const { open, setOpen } = useAlertDialogCtx()
  return (
    <Modal.Backdrop isOpen={open} onOpenChange={setOpen} isDismissable={false} variant="opaque">
      <Modal.Container>
        <Modal.Dialog className={cn("sm:max-w-lg w-full max-w-[95vw] p-6 gap-4", className)} {...(props as Record<string, unknown>)}>
          {children}
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  )
}

function AlertDialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col space-y-2 text-center sm:text-left", className)} {...props} />
}

function AlertDialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)} {...props} />
  )
}

function AlertDialogTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <Modal.Heading className={cn("text-lg font-semibold", className)} {...props} />
}

function AlertDialogDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm text-muted-foreground", className)} {...props} />
}

function AlertDialogAction({
  className,
  onClick,
  children,
  disabled,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { setOpen } = useAlertDialogCtx()
  return (
    <button
      type="button"
      className={cn(buttonVariants(), className)}
      disabled={disabled}
      onClick={(e) => {
        onClick?.(e)
        if (!e.defaultPrevented) setOpen(false)
      }}
      {...props}
    >
      {children}
    </button>
  )
}

function AlertDialogCancel({
  className,
  onClick,
  children,
  disabled,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { setOpen } = useAlertDialogCtx()
  return (
    <button
      type="button"
      className={cn(buttonVariants({ variant: "outline" }), "mt-2 sm:mt-0", className)}
      disabled={disabled}
      onClick={(e) => {
        onClick?.(e)
        setOpen(false)
      }}
      {...props}
    >
      {children}
    </button>
  )
}

export {
  AlertDialog,
  AlertDialogPortal,
  AlertDialogOverlay,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
}
