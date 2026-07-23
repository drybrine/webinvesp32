"use client"

import * as React from "react"
import { Modal } from "@heroui/react"
import { cn } from "@/lib/utils"

const EXIT_MS = 280

type DialogContextValue = {
  open: boolean
  setOpen: (open: boolean) => void
}

const DialogContext = React.createContext<DialogContextValue | null>(null)

function useDialogCtx() {
  const ctx = React.useContext(DialogContext)
  if (!ctx) throw new Error("Dialog parts must be inside <Dialog>")
  return ctx
}

function Dialog({
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

function DialogOverlay() {
  return null
}

function isDialogFooter(child: React.ReactNode): boolean {
  return (
    React.isValidElement(child) &&
    typeof child.type !== "string" &&
    (child.type as { displayName?: string }).displayName === "DialogFooter"
  )
}

function DialogContent({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const { open, setOpen } = useDialogCtx()
  const [mounted, setMounted] = React.useState(open)
  const [visible, setVisible] = React.useState(open)
  // Freeze last open children in state (not ref) so close animation keeps content
  // and react-hooks/refs lint stays clean.
  const [frozenChildren, setFrozenChildren] = React.useState(children)

  React.useEffect(() => {
    if (open) {
      setFrozenChildren(children)
      setMounted(true)
      const id = requestAnimationFrame(() => setVisible(true))
      return () => cancelAnimationFrame(id)
    }

    setVisible(false)
    const t = window.setTimeout(() => setMounted(false), EXIT_MS)
    return () => window.clearTimeout(t)
  }, [open, children])

  if (!mounted) return null

  const rendered = open ? children : frozenChildren
  const childArray = React.Children.toArray(rendered)
  const footers = childArray.filter(isDialogFooter)
  const rest = childArray.filter((child) => !isDialogFooter(child))

  return (
    <Modal.Backdrop
      isOpen={visible}
      onOpenChange={setOpen}
      variant="blur"
      className="dialog-backdrop-motion"
    >
      <Modal.Container
        placement="center"
        size="md"
        scroll="inside"
        className="dialog-container-motion"
      >
        <Modal.Dialog
          className={cn(
            "dialog-panel-motion flex w-full max-h-[min(90dvh,720px)] flex-col overflow-hidden sm:max-w-lg",
            className,
          )}
          {...(props as Record<string, unknown>)}
        >
          <Modal.CloseTrigger />
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain pr-1">
            {rest}
          </div>
          {footers}
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  )
}

function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <Modal.Header className={cn("shrink-0 gap-1", className)} {...props} />
}

function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <Modal.Footer
      className={cn(
        "mt-0 shrink-0 gap-2 border-t border-border bg-overlay pt-4",
        "flex w-full flex-col-reverse sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    />
  )
}
DialogFooter.displayName = "DialogFooter"

function DialogTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <Modal.Heading className={cn("text-foreground", className)} {...props} />
}

function DialogDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm text-muted", className)} style={{ color: "var(--muted)" }} {...props} />
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
