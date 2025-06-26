"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import QRCode from "react-qr-code"

interface AttendanceQRGeneratorProps {
  className?: string
}

export function AttendanceQRGenerator({ className }: AttendanceQRGeneratorProps) {
  const [nim, setNim] = useState("")
  const [nama, setNama] = useState("")
  const [showQR, setShowQR] = useState(false)

  const generateQR = () => {
    if (!nim) return
    setShowQR(true)
  }

  const downloadQR = () => {
    const svg = document.getElementById('qr-code')
    if (!svg) return

    const svgData = new XMLSerializer().serializeToString(svg)
    const canvas = document.createElement("canvas")
    const ctx = canvas.getContext("2d")
    const img = new Image()
    
    img.onload = () => {
      canvas.width = img.width
      canvas.height = img.height
      ctx?.drawImage(img, 0, 0)
      
      const link = document.createElement("a")
      link.download = `qr-${nim}.png`
      link.href = canvas.toDataURL()
      link.click()
    }
    
    img.src = "data:image/svg+xml;base64," + btoa(svgData)
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Generator QR Code Tiket</CardTitle>
        <CardDescription>
          Buat QR code untuk tiket peserta seminar
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label className="text-sm font-medium">NIM *</label>
          <Input
            placeholder="Masukkan NIM (contoh: 10222005)"
            value={nim}
            onChange={(e) => setNim(e.target.value)}
          />
        </div>
        <div>
          <label className="text-sm font-medium">Nama (Opsional)</label>
          <Input
            placeholder="Masukkan nama peserta"
            value={nama}
            onChange={(e) => setNama(e.target.value)}
          />
        </div>
        
        <Button onClick={generateQR} disabled={!nim} className="w-full">
          Buat QR Code
        </Button>

        {showQR && nim && (
          <div className="space-y-4">
            <div className="flex flex-col items-center space-y-2 p-4 border rounded-lg bg-white">
              <QRCode
                id="qr-code"
                value={nim}
                size={200}
                style={{ height: "auto", maxWidth: "100%", width: "100%" }}
              />
              <div className="text-center">
                <p className="font-medium">NIM: {nim}</p>
                {nama && <p className="text-sm text-gray-600">{nama}</p>}
              </div>
            </div>
            
            <Button onClick={downloadQR} variant="outline" className="w-full">
              Download QR Code
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
