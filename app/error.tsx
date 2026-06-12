'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertCircle, RefreshCw, Home } from 'lucide-react'

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
        <CardHeader className="text-center">
          <div className="mx-auto w-14 h-14 bg-destructive/10 rounded-full flex items-center justify-center mb-4">
            <AlertCircle className="w-7 h-7 text-destructive" />
          </div>
          <CardTitle className="text-xl text-foreground">
            Terjadi Kesalahan
          </CardTitle>
          <CardDescription>
            Maaf, terjadi kesalahan yang tidak terduga. Silakan coba lagi atau kembali ke beranda.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {process.env.NODE_ENV === 'production' && (
            <div className="p-3 bg-muted rounded-md">
              <p className="text-sm text-muted-foreground font-mono break-all">
                {error.message}
              </p>
            </div>
          )}
          
          <div className="flex flex-col gap-2">
            <Button onClick={reset} className="w-full" variant="default">
              <RefreshCw className="w-4 h-4 mr-2" />
              Coba Lagi
            </Button>
            <Button onClick={() => window.location.href = '/'} variant="outline" className="w-full">
              <Home className="w-4 h-4 mr-2" />
              Kembali ke Beranda
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
