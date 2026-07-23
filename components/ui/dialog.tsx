"use client"

import * as React from "react"
import { Modal } from "@heroui/react"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

type DialogContextValue = {
  open: boolean
  setOpen: (open: boolean) => void
}

const DialogContext = React.createContext<DialogContextValue | null>(null)

function useDialogCtx() {
  const ctx = React.useContext(DialogContext)
  if (!ctx) throw new Error("Dialog components must be used within <Dialog>")
  return ctx
}

type DialogProps = {
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  children?: React.ReactNode
}

function Dialog({ open: controlledOpen, defaultOpen = false, onOpenChange, children }: DialogProps) {
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

  return <DialogContext.Provider value={{ open, setOpen }}>{children}</DialogContext.Provider>
}

function DialogTrigger({
  asChild,
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }) {
  const { setOpen } = useDialogCtx()
  if (asChild && React.isValidElement(children)) {
    const child = children as React.ReactElement<{ onClick?: React.MouseEventHandler; className?: string }>
    return React.cloneElement(child, {
      className: cn(className, child.props.className),
      onClick: (e: React.MouseEvent) => {
        child.props.onClick?.(e)
        setOpen(true)
      },
    })
  }
  return (
    <button type="button" className={className} onClick={() => setOpen(true)} {...props}>
      {children}
    </button>
  )
}

function DialogPortal({ children }: { children?: React.ReactNode }) {
  return <>{children}</>
}

function DialogClose({
  asChild,
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }) {
  const { setOpen } = useDialogCtx()
  if (asChild && React.isValidElement(children)) {
    const child = children as React.ReactElement<{ onClick?: React.MouseEventHandler }>
    return React.cloneElement(child, {
      onClick: (e: React.MouseEvent) => {
        child.props.onClick?.(e)
        setOpen(false)
      },
    })
  }
  return (
    <button type="button" className={className} onClick={() => setOpen(false)} {...props}>
      {children}
    </button>
  )
}

function DialogOverlay({ className }: { className?: string }) {
  return null // Modal.Backdrop owns overlay
  void className
}

function DialogContent({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  const { open, setOpen } = useDialogCtx()

  return (
    <Modal.Backdrop isOpen={open} onOpenChange={setOpen} variant="blur">
      <Modal.Container>
        <Modal.Dialog
          className={cn("sm:max-w-lg w-full max-w-[95vw] p-0 gap-0 relative", className)}
          {...(props as Record<string, unknown>)}
        >
          <div className="relative flex flex-col gap-4 p-6">
            {children}
            <button
              type="button"
              className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring min-w-[44px] min-h-[44px] flex items-center justify-center"
              aria-label="Tutup dialog"
              onClick={() => setOpen(false)}
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Tutup</span>
            </button>
          </div>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  )
}

function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)} {...props} />
}

function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)} {...props} />
  )
}

function DialogTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <Modal.Heading className={cn("text-lg font-semibold leading-none tracking-tight", className)} {...props} />
}

function DialogDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm text-muted-foreground", className)} {...props} />
}

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}
