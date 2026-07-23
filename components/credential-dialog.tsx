"use client"

import { useState } from "react"
import { AlertTriangle, Check, Copy } from "lucide-react"
import { Button, Label, Modal } from "@heroui/react"
import Pdf417Barcode from "@/components/pdf417-barcode"

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
  const [failed, setFailed] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setFailed(false)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
      setFailed(true)
    }
  }
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      isIconOnly
      onPress={() => void copy()}
      aria-label={failed ? "Gagal menyalin" : "Salin"}
    >
      {copied ? <Check className="h-4 w-4" /> : failed ? <AlertTriangle className="h-4 w-4 text-danger" /> : <Copy className="h-4 w-4" />}
    </Button>
  )
}

export function CredentialDialog({ credential, onClose }: { credential: Credential | null; onClose: () => void }) {
  return (
    <Modal.Backdrop isOpen={!!credential} onOpenChange={(open) => { if (!open) onClose() }} variant="blur">
      <Modal.Container placement="center" size="md">
        <Modal.Dialog className="sm:max-w-lg">
          <Modal.CloseTrigger />
          <Modal.Header>
            <Modal.Heading>{credential?.title}</Modal.Heading>
            <p className="text-sm text-muted">
              {credential?.description ?? "Salin dan simpan sekarang. Nilai ini hanya ditampilkan satu kali."}
            </p>
          </Modal.Header>
          <Modal.Body className="flex flex-col gap-3">
            {credential?.barcodeValue ? (
              <div className="flex flex-col items-center gap-2 rounded-2xl border border-border p-3">
                <Label className="text-xs text-muted">Pindai dengan scanner</Label>
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
                <Label className="text-xs text-muted">{field.label}</Label>
                <div className="flex items-center gap-2">
                  <code className={`flex-1 break-all rounded-xl bg-default px-3 py-2 text-sm ${field.mono ? "font-mono" : ""}`}>
                    {field.value}
                  </code>
                  <CopyButton value={field.value} />
                </div>
              </div>
            ))}
          </Modal.Body>
          <Modal.Footer>
            <Button onPress={onClose} fullWidth>
              Selesai
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  )
}
