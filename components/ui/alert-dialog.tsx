"use client"

import * as React from "react"
import { Button, Modal } from "@heroui/react"
import { cn } from "@/lib/utils"

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
  return (
    <Modal.Backdrop isOpen={open} onOpenChange={setOpen} isDismissable={false} variant="opaque">
      <Modal.Container placement="center" size="sm">
        <Modal.Dialog className={cn("sm:max-w-md", className)} {...(props as Record<string, unknown>)}>
          {children}
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
