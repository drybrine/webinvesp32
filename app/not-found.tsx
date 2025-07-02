'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FileQuestion, Home, ArrowLeft } from 'lucide-react'

export default function NotFound() {
  const handleGoBack = () => {
    window.history.back()
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
            <FileQuestion className="w-8 h-8 text-blue-600" />
          </div>
          <CardTitle className="text-2xl text-gray-900">
            Halaman Tidak Ditemukan
          </CardTitle>
          <CardDescription>
            Maaf, halaman yang Anda cari tidak dapat ditemukan. Periksa kembali URL atau navigasi ke halaman lain.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2">
            <Link href="/" passHref>
              <Button className="w-full" variant="default">
                <Home className="w-4 h-4 mr-2" />
                Kembali ke Beranda
              </Button>
            </Link>
            
            <Button 
              onClick={handleGoBack}
              variant="outline"
              className="w-full"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Halaman Sebelumnya
            </Button>
          </div>
          
          <div className="text-center">
            <p className="text-sm text-gray-500">
              Jika masalah berlanjut, silakan hubungi administrator sistem.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
