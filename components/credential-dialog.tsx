"use client"

import { useState } from "react"
import { Check, Copy } from "lucide-react"
import Pdf417Barcode from "@/components/pdf417-barcode"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"

export interface CredentialField {
  label: string
  value: string
  mono?: boolean
}

export interface Credential {
  title: string
  description?: string
  fields: CredentialField[]
  barcodeValue?: string
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }
  return (
    <Button type="button" variant="outline" size="sm" onClick={() => void copy()} className="shrink-0">
      {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
    </Button>
  )
}

export function CredentialDialog({ credential, onClose }: { credential: Credential | null; onClose: () => void }) {
  return (
    <Dialog open={!!credential} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{credential?.title}</DialogTitle>
          <DialogDescription>
            {credential?.description ?? "Salin dan simpan sekarang. Nilai ini hanya ditampilkan satu kali."}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-2">
          {credential?.barcodeValue ? (
            <div className="flex flex-col items-center gap-2 rounded-md border p-3">
              <Label className="text-xs text-muted-foreground">Pindai dengan scanner</Label>
              <Pdf417Barcode
                value={credential.barcodeValue}
                height={90}
                className="h-auto max-w-full"
                ariaLabel="Barcode provisioning scanner"
              />
            </div>
          ) : null}
          {credential?.fields.map((field) => (
            <div key={field.label} className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">{field.label}</Label>
              <div className="flex items-center gap-2">
                <code className={`flex-1 rounded-md bg-muted px-3 py-2 text-sm break-all ${field.mono ? "font-mono" : ""}`}>
                  {field.value}
                </code>
                <CopyButton value={field.value} />
              </div>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Selesai</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
