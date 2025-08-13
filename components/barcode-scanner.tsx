"use client"

import { useRef, useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { toast } from "@/hooks/use-toast"
import { Camera, Square } from "lucide-react"
import Quagga from "quagga"

interface BarcodeScannerProps {
  onDetected: (barcode: string) => void
  className?: string
}

export function BarcodeScanner({ onDetected, className = "" }: BarcodeScannerProps) {
  const [isScanning, setIsScanning] = useState(false)
  const scannerRef = useRef<HTMLDivElement>(null)

  const startScanner = () => {
    if (!scannerRef.current) return

    setIsScanning(true)

    Quagga.init(
      {
        inputStream: {
          name: "Live",
          type: "LiveStream",
          target: scannerRef.current,
          constraints: {
            facingMode: "environment", // Use back camera if available
            width: { min: 450 },
            height: { min: 300 },
            aspectRatio: { min: 1, max: 2 },
          },
        },
        locator: {
          patchSize: "medium",
          halfSample: true,
        },
        numOfWorkers: navigator.hardwareConcurrency || 4,
        frequency: 10,
        decoder: {
          readers: ["ean_reader", "ean_8_reader", "code_128_reader", "code_39_reader", "code_93_reader"],
        },
        locate: true,
      },
      (err: Error) => {
        if (err) {
          console.error("Error starting Quagga:", err)
          toast({
            title: "Error",
            description: "Tidak dapat mengakses kamera. Pastikan izin kamera telah diberikan.",
            variant: "destructive",
            duration: 6000, // Error toast lebih lama (6 detik)
          })
          setIsScanning(false)
          return
        }

        Quagga.start()

        toast({
          title: "Scanner Aktif",
          description: "Kamera berhasil diaktifkan untuk scanning barcode",
          duration: 3000, // Success toast (3 detik)
        })
      },
    )

    // Add detection event listener
    Quagga.onDetected((result: { codeResult?: { code?: string }, box?: { x: number, y: number, width: number, height: number } }) => {
      if (result && result.codeResult && result.codeResult.code) {
        const code = result.codeResult.code
        onDetected(code)

        // Play beep sound
        const beep = new Audio("/beep.mp3")
        beep.play().catch((e) => console.log("Error playing beep:", e))

        // Highlight detected barcode
        const drawingCanvas = document.querySelector("canvas.drawingBuffer") as HTMLCanvasElement
        if (drawingCanvas) {
          const context = drawingCanvas.getContext("2d")
          if (context) {
            context.strokeStyle = "#00FF00"
            context.lineWidth = 5

            // Draw rectangle around detected barcode
            if (result.box) {
              context.strokeRect(result.box.x, result.box.y, result.box.width, result.box.height)
            }
          }
        }
      }
    })
  }

  const stopScanner = () => {
    Quagga.stop()
    setIsScanning(false)
    toast({
      title: "Scanner Dihentikan",
      description: "Kamera scanner telah dimatikan",
      duration: 2000, // Quick notification (2 detik)
    })
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (isScanning) {
        Quagga.stop()
      }
    }
  }, [isScanning])

  return (
    <div className={`space-y-4 ${className}`}>
      <div
        ref={scannerRef}
        className={`relative bg-gray-900 rounded-lg overflow-hidden aspect-video ${isScanning ? "block" : "hidden"}`}
      >
        {/* Scanner will be injected here */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="border-2 border-white border-dashed rounded-lg w-64 h-32 opacity-75"></div>
        </div>
      </div>

      {!isScanning && (
        <div className="bg-gray-900 rounded-lg overflow-hidden aspect-video flex items-center justify-center">
          <div className="text-center text-gray-600 dark:text-gray-300">
            <Camera className="w-12 h-12 mx-auto mb-2" />
            <p>Kamera tidak aktif</p>
          </div>
        </div>
      )}

      <div className="flex justify-center">
        {!isScanning ? (
          <Button onClick={startScanner} className="w-full bg-gray-900 hover:bg-gray-800">
            <Camera className="w-4 h-4 mr-2" />
            Mulai Scanner
          </Button>
        ) : (
          <Button onClick={stopScanner} variant="destructive" className="w-full">
            <Square className="w-4 h-4 mr-2" />
            Hentikan Scanner
          </Button>
        )}
      </div>
    </div>
  )
}
