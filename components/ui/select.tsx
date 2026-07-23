"use client"

import * as React from "react"
import { ListBox, Select as HeroSelect } from "@heroui/react"
import { cn } from "@/lib/utils"

type Item = { value: string; label: React.ReactNode; textValue: string; disabled?: boolean }

type SelectCtx = {
  value?: string
  onValueChange?: (value: string) => void
  items: Item[]
  registerItem: (item: Item) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  triggerClassName?: string
  setTriggerClassName: (c: string) => void
  setPlaceholder: (p: string) => void
}

const SelectContext = React.createContext<SelectCtx | null>(null)

function useSelectCtx() {
  const ctx = React.useContext(SelectContext)
  if (!ctx) throw new Error("Select parts must be inside <Select>")
  return ctx
}

function Select({
  value,
  defaultValue,
  onValueChange,
  disabled,
  children,
  className,
}: {
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  disabled?: boolean
  children?: React.ReactNode
  className?: string
}) {
  const [items, setItems] = React.useState<Item[]>([])
  const [placeholder, setPlaceholder] = React.useState("Pilih…")
  const [triggerClassName, setTriggerClassName] = React.useState("")
  const [internal, setInternal] = React.useState(defaultValue)
  const isControlled = value !== undefined
  const current = isControlled ? value : internal

  const registerItem = React.useCallback((item: Item) => {
    setItems((prev) => {
      const idx = prev.findIndex((p) => p.value === item.value)
      if (idx === -1) return [...prev, item]
      const next = [...prev]
      next[idx] = item
      return next
    })
  }, [])

  const handleChange = (key: React.Key | null) => {
    if (key == null) return
    const next = String(key)
    if (!isControlled) setInternal(next)
    onValueChange?.(next)
  }

  return (
    <SelectContext.Provider
      value={{
        value: current,
        onValueChange,
        items,
        registerItem,
        placeholder,
        disabled,
        className,
        triggerClassName,
        setTriggerClassName,
        setPlaceholder,
      }}
    >
      {/* Register SelectItem children */}
      <div className="hidden">{children}</div>
      <HeroSelect
        className={cn("w-full", className)}
        isDisabled={disabled}
        placeholder={placeholder}
        value={current ?? null}
        onChange={handleChange}
        fullWidth
        variant="primary"
      >
        <HeroSelect.Trigger className={cn("tracking-normal bg-surface", triggerClassName)}>
          <HeroSelect.Value />
          <HeroSelect.Indicator />
        </HeroSelect.Trigger>
        <HeroSelect.Popover>
          <ListBox>
            {items.map((item) => (
              <ListBox.Item key={item.value} id={item.value} textValue={item.textValue} isDisabled={item.disabled}>
                {item.label}
                <ListBox.ItemIndicator />
              </ListBox.Item>
            ))}
          </ListBox>
        </HeroSelect.Popover>
      </HeroSelect>
    </SelectContext.Provider>
  )
}

function SelectGroup({ children }: { children?: React.ReactNode }) {
  return <>{children}</>
}

function SelectValue({ placeholder }: { placeholder?: string; className?: string }) {
  const { setPlaceholder } = useSelectCtx()
  React.useEffect(() => {
    if (placeholder) setPlaceholder(placeholder)
  }, [placeholder, setPlaceholder])
  return null
}

function SelectTrigger({
  className,
  children,
  id,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { setTriggerClassName } = useSelectCtx()
  React.useEffect(() => {
    if (className) setTriggerClassName(className)
  }, [className, setTriggerClassName])
  // children include SelectValue — render hidden for registration
  return (
    <div className="hidden" id={id} {...(props as Record<string, unknown>)}>
      {children}
    </div>
  )
}

function SelectContent({ children }: { className?: string; children?: React.ReactNode; position?: string; align?: string; side?: string; sideOffset?: number }) {
  return <>{children}</>
}

function SelectLabel({ children }: { className?: string; children?: React.ReactNode }) {
  return <>{children}</>
}

function SelectItem({
  value,
  children,
  disabled,
  title,
}: {
  value: string
  children?: React.ReactNode
  disabled?: boolean
  className?: string
  title?: string
}) {
  const { registerItem } = useSelectCtx()
  const textValue = typeof children === "string" ? children : title || value
  React.useEffect(() => {
    registerItem({ value, label: children, textValue: String(textValue), disabled })
  }, [value, children, textValue, disabled, registerItem])
  return null
}

function SelectSeparator() {
  return null
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
