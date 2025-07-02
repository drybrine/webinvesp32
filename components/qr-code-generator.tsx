"use client"

import { useEffect, useRef } from "react"

interface QRCodeGeneratorProps {
  value: string
  size?: number
  level?: "L" | "M" | "Q" | "H"
  includeMargin?: boolean
}

export default function QRCodeGenerator({
  value,
  size = 128,
  level = "M",
  includeMargin = true,
}: QRCodeGeneratorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!canvasRef.current || !value) return

    // Simple QR code generation using canvas
    // This is a basic implementation - in production, use a proper QR library like 'qrcode'
    const canvas = canvasRef.current
    const ctx = canvas.getContext("2d")

    if (!ctx) return

    // Set canvas size
    canvas.width = size
    canvas.height = size

    // Clear canvas
    ctx.fillStyle = "#ffffff"
    ctx.fillRect(0, 0, size, size)

    // Generate a simple pattern based on the value
    // This is a placeholder - replace with actual QR code generation
    const gridSize = 21 // Standard QR code is 21x21 modules
    const moduleSize = size / gridSize

    ctx.fillStyle = "#000000"

    // Create a simple pattern based on the hash of the value
    let hash = 0
    for (let i = 0; i < value.length; i++) {
      const char = value.charCodeAt(i)
      hash = (hash << 5) - hash + char
      hash = hash & hash // Convert to 32-bit integer
    }

    // Generate pattern
    for (let row = 0; row < gridSize; row++) {
      for (let col = 0; col < gridSize; col++) {
        const index = row * gridSize + col
        const shouldFill = (hash + index) % 3 === 0

        if (shouldFill) {
          ctx.fillRect(col * moduleSize, row * moduleSize, moduleSize, moduleSize)
        }
      }
    }

    // Add finder patterns (corners)
    const finderSize = moduleSize * 7

    // Top-left finder pattern
    ctx.fillStyle = "#000000"
    ctx.fillRect(0, 0, finderSize, finderSize)
    ctx.fillStyle = "#ffffff"
    ctx.fillRect(moduleSize, moduleSize, finderSize - 2 * moduleSize, finderSize - 2 * moduleSize)
    ctx.fillStyle = "#000000"
    ctx.fillRect(2 * moduleSize, 2 * moduleSize, finderSize - 4 * moduleSize, finderSize - 4 * moduleSize)

    // Top-right finder pattern
    ctx.fillStyle = "#000000"
    ctx.fillRect(size - finderSize, 0, finderSize, finderSize)
    ctx.fillStyle = "#ffffff"
    ctx.fillRect(size - finderSize + moduleSize, moduleSize, finderSize - 2 * moduleSize, finderSize - 2 * moduleSize)
    ctx.fillStyle = "#000000"
    ctx.fillRect(
      size - finderSize + 2 * moduleSize,
      2 * moduleSize,
      finderSize - 4 * moduleSize,
      finderSize - 4 * moduleSize,
    )

    // Bottom-left finder pattern
    ctx.fillStyle = "#000000"
    ctx.fillRect(0, size - finderSize, finderSize, finderSize)
    ctx.fillStyle = "#ffffff"
    ctx.fillRect(moduleSize, size - finderSize + moduleSize, finderSize - 2 * moduleSize, finderSize - 2 * moduleSize)
    ctx.fillStyle = "#000000"
    ctx.fillRect(
      2 * moduleSize,
      size - finderSize + 2 * moduleSize,
      finderSize - 4 * moduleSize,
      finderSize - 4 * moduleSize,
    )
  }, [value, size, level, includeMargin])

  const downloadQR = () => {
    if (!canvasRef.current) return

    const link = document.createElement("a")
    link.download = `qr-code-${Date.now()}.png`
    link.href = canvasRef.current.toDataURL()
    link.click()
  }

  return (
    <div className="flex flex-col items-center space-y-2">
      <canvas ref={canvasRef} className="border border-gray-200 rounded" style={{ maxWidth: "100%", height: "auto" }} />
      <button onClick={downloadQR} className="text-xs text-blue-600 hover:text-blue-800 underline">
        Download QR Code
      </button>
    </div>
  )
}
