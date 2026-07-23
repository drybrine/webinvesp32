'use client'

import { useEffect } from 'react'
import { AlertCircle, RefreshCw, Home } from 'lucide-react'
import { Button, Card } from '@heroui/react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Application error:', error)
  }, [error])

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <Card.Header className="items-center text-center gap-3">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-danger/10">
            <AlertCircle className="h-7 w-7 text-danger" />
          </div>
          <Card.Title>Terjadi Kesalahan</Card.Title>
          <Card.Description>
            Maaf, terjadi kesalahan yang tidak terduga. Silakan coba lagi atau kembali ke beranda.
          </Card.Description>
        </Card.Header>
        <Card.Content className="flex flex-col gap-3">
          {process.env.NODE_ENV === 'development' && (
            <div className="rounded-xl bg-surface-secondary p-3">
              <p className="break-all font-mono text-sm text-muted">{error.message}</p>
            </div>
          )}
          <Button onPress={reset} fullWidth>
            <RefreshCw className="h-4 w-4" />
            Coba Lagi
          </Button>
          <Button onPress={() => { window.location.href = '/' }} variant="outline" fullWidth>
            <Home className="h-4 w-4" />
            Kembali ke Beranda
          </Button>
        </Card.Content>
      </Card>
    </div>
  )
}
