'use client'

import Link from 'next/link'
import { FileQuestion, Home, ArrowLeft } from 'lucide-react'
import { Button, Card } from '@heroui/react'

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <Card.Header className="items-center text-center gap-3">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-default">
            <FileQuestion className="h-7 w-7 text-muted" />
          </div>
          <Card.Title>Halaman Tidak Ditemukan</Card.Title>
          <Card.Description>
            Maaf, halaman yang Anda cari tidak dapat ditemukan. Periksa kembali URL atau navigasi ke halaman lain.
          </Card.Description>
        </Card.Header>
        <Card.Content className="flex flex-col gap-3">
          <Link href="/" className="w-full">
            <Button fullWidth>
              <Home className="h-4 w-4" />
              Kembali ke Beranda
            </Button>
          </Link>
          <Button onPress={() => window.history.back()} variant="outline" fullWidth>
            <ArrowLeft className="h-4 w-4" />
            Halaman Sebelumnya
          </Button>
          <p className="text-center text-sm text-muted">
            Jika masalah berlanjut, silakan hubungi administrator sistem.
          </p>
        </Card.Content>
      </Card>
    </div>
  )
}
