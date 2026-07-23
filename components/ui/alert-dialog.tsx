"use client"

import * as React from "react"
import { Button, Modal } from "@heroui/react"
import { cn } from "@/lib/utils"

const EXIT_MS = 280

type Ctx = { open: boolean; setOpen: (open: boolean) => void }
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
function AlertDialogOverlay() {
  return null
}

function AlertDialogContent({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const { open, setOpen } = useAlertDialogCtx()
  const [mounted, setMounted] = React.useState(open)
  const [visible, setVisible] = React.useState(open)
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

  return (
    <Modal.Backdrop
      isOpen={visible}
      onOpenChange={setOpen}
      isDismissable={false}
      variant="opaque"
      className="dialog-backdrop-motion"
    >
      <Modal.Container placement="center" size="sm" className="dialog-container-motion">
        <Modal.Dialog
          className={cn("dialog-panel-motion sm:max-w-md", className)}
          {...(props as Record<string, unknown>)}
        >
          {open ? children : frozenChildren}
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  )
}

function AlertDialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <Modal.Header className={cn(className)} {...props} />
}
function AlertDialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <Modal.Footer className={cn(className)} {...props} />
}
function AlertDialogTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <Modal.Heading className={cn(className)} {...props} />
}
function AlertDialogDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm text-muted", className)} {...props} />
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
    <Button
      variant="danger"
      isDisabled={disabled}
      className={className}
      onPress={() => {
        onClick?.({} as React.MouseEvent<HTMLButtonElement>)
        setOpen(false)
      }}
      {...(props as Record<string, unknown>)}
    >
      {children}
    </Button>
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
    <Button
      variant="outline"
      isDisabled={disabled}
      className={className}
      onPress={() => {
        onClick?.({} as React.MouseEvent<HTMLButtonElement>)
        setOpen(false)
      }}
      {...(props as Record<string, unknown>)}
    >
      {children}
    </Button>
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
