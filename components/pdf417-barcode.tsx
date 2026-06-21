"use client"

import { useEffect, useRef, useState } from "react"

interface Pdf417BarcodeProps {
  value: string
  height?: number
  className?: string
  ariaLabel?: string
}

export default function Pdf417Barcode({ value, height = 60, className, ariaLabel }: Pdf417BarcodeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const render = async () => {
      if (!canvasRef.current || !value) return
      try {
        const bwipjs = (await import("bwip-js")).default
        if (cancelled || !canvasRef.current) return
        bwipjs.toCanvas(canvasRef.current, {
          bcid: "pdf417",
          text: value,
          scale: 2,
          height: Math.max(8, Math.round(height / 6)), // bwip height is in mm-ish units
          includetext: false,
          columns: 4,
        })
        setError(null)
      } catch (err) {
        if (!cancelled) {
          console.error("PDF417 render error:", err)
          setError("Gagal membuat barcode PDF417")
        }
      }
    }

    render()
    return () => {
      cancelled = true
    }
  }, [value, height])

  if (error) {
    return <p className="text-xs text-destructive">{error}</p>
  }

  return <canvas ref={canvasRef} className={className} aria-label={ariaLabel ?? `Barcode PDF417: ${value}`} />
}
