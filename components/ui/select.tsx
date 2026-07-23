"use client"

import * as React from "react"
import { Check, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

type Item = {
  value: string
  label: React.ReactNode
  disabled?: boolean
}

type SelectCtx = {
  value?: string
  onValueChange?: (value: string) => void
  items: Item[]
  registerItem: (item: Item) => void
  open: boolean
  setOpen: (open: boolean) => void
  disabled?: boolean
  triggerRef: React.RefObject<HTMLButtonElement | null>
}

const SelectContext = React.createContext<SelectCtx | null>(null)

function useSelectCtx() {
  const ctx = React.useContext(SelectContext)
  if (!ctx) throw new Error("Select parts must be inside <Select>")
  return ctx
}

type SelectProps = {
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  disabled?: boolean
  children?: React.ReactNode
}

function Select({ value: controlledValue, defaultValue, onValueChange, disabled, children }: SelectProps) {
  const [uncontrolled, setUncontrolled] = React.useState(defaultValue)
  const [items, setItems] = React.useState<Item[]>([])
  const [open, setOpen] = React.useState(false)
  const triggerRef = React.useRef<HTMLButtonElement | null>(null)
  const isControlled = controlledValue !== undefined
  const value = isControlled ? controlledValue : uncontrolled

  const registerItem = React.useCallback((item: Item) => {
    setItems((prev) => {
      const idx = prev.findIndex((p) => p.value === item.value)
      if (idx === -1) return [...prev, item]
      const next = [...prev]
      next[idx] = item
      return next
    })
  }, [])

  const handleChange = React.useCallback(
    (next: string) => {
      if (!isControlled) setUncontrolled(next)
      onValueChange?.(next)
    },
    [isControlled, onValueChange],
  )

  return (
    <SelectContext.Provider
      value={{ value, onValueChange: handleChange, items, registerItem, open, setOpen, disabled, triggerRef }}
    >
      <div className="relative w-full">{children}</div>
    </SelectContext.Provider>
  )
}

function SelectGroup({ children }: { children?: React.ReactNode }) {
  return <>{children}</>
}

function SelectValue({ placeholder, className }: { placeholder?: string; className?: string }) {
  const { value, items } = useSelectCtx()
  const selected = items.find((i) => i.value === value)
  return (
    <span className={cn("line-clamp-1", !selected && "text-muted-foreground", className)}>
      {selected ? selected.label : placeholder}
    </span>
  )
}

function SelectTrigger({
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { setOpen, open, disabled, triggerRef } = useSelectCtx()
  return (
    <button
      ref={triggerRef}
      type="button"
      disabled={disabled}
      className={cn(
        "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1",
        className,
      )}
      onClick={() => setOpen(!open)}
      aria-expanded={open}
      {...props}
    >
      {children}
      <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
    </button>
  )
}

function SelectContent({
  className,
  children,
  ..._rest
}: {
  className?: string
  children?: React.ReactNode
  position?: string
  align?: string
  side?: string
  sideOffset?: number
}) {
  void _rest
  const { open, setOpen, items, value, onValueChange, disabled } = useSelectCtx()
  const listRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    const onPointer = (e: MouseEvent) => {
      if (listRef.current && !listRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("keydown", onKey)
    document.addEventListener("mousedown", onPointer)
    return () => {
      document.removeEventListener("keydown", onKey)
      document.removeEventListener("mousedown", onPointer)
    }
  }, [open, setOpen])

  return (
    <>
      <div className="hidden">{children}</div>
      {open ? (
        <div
          ref={listRef}
          className={cn(
            "absolute left-0 right-0 top-full z-50 mt-1 max-h-96 min-w-[8rem] overflow-auto rounded-md border bg-popover text-popover-foreground shadow-md p-1",
            className,
          )}
          role="listbox"
        >
          {items.map((item) => (
            <button
              key={item.value}
              type="button"
              role="option"
              aria-selected={item.value === value}
              disabled={item.disabled || disabled}
              className={cn(
                "relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground",
                item.value === value && "bg-accent",
                (item.disabled || disabled) && "pointer-events-none opacity-50",
              )}
              onClick={() => {
                onValueChange?.(item.value)
                setOpen(false)
              }}
            >
              {item.value === value && (
                <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                  <Check className="h-4 w-4" />
                </span>
              )}
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </>
  )
}

function SelectLabel({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("py-1.5 pl-8 pr-2 text-sm font-semibold", className)} {...props} />
}

function SelectItem({
  value,
  children,
  disabled,
  className,
  ...props
}: {
  value: string
  children?: React.ReactNode
  disabled?: boolean
  className?: string
} & React.HTMLAttributes<HTMLDivElement>) {
  const { registerItem } = useSelectCtx()

  React.useEffect(() => {
    registerItem({ value, label: children, disabled })
  }, [value, children, disabled, registerItem])

  return (
    <div className={cn("hidden", className)} data-value={value} {...props}>
      {children}
    </div>
  )
}

function SelectSeparator({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("-mx-1 my-1 h-px bg-muted", className)} {...props} />
}

function SelectScrollUpButton() {
  return null
}

function SelectScrollDownButton() {
  return null
}

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
}
