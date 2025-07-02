"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useSession } from "@/hooks/use-session"
import { Shield, Clock, LogOut } from "lucide-react"

export default function DashboardPage() {
  const { logout, sessionTimeLeft, isAuthenticated } = useSession()

  const formatTime = (milliseconds: number) => {
    const minutes = Math.floor(milliseconds / 60000)
    const seconds = Math.floor((milliseconds % 60000) / 1000)
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  const handleLogout = () => {
    logout()
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-gray-600">Redirecting to login...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Dashboard Admin</h1>
            <p className="text-gray-600">Selamat datang di StokManager</p>
          </div>
          
          <div className="flex items-center gap-4">
            {/* Session Timer */}
            <div className="flex items-center gap-2 bg-blue-50 px-3 py-2 rounded-lg">
              <Clock className="h-4 w-4 text-blue-600" />
              <span className="text-sm font-medium text-blue-800">
                Sisa waktu: {formatTime(sessionTimeLeft)}
              </span>
            </div>
            
            {/* Logout Button */}
            <Button 
              onClick={handleLogout}
              variant="outline"
              className="flex items-center gap-2"
            >
              <LogOut className="h-4 w-4" />
              Logout
            </Button>
          </div>
        </div>

        {/* Success Message */}
        <Card className="mb-6 border-green-200 bg-green-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Shield className="h-6 w-6 text-green-600" />
              <div>
                <h3 className="font-semibold text-green-800">Login Berhasil!</h3>
                <p className="text-sm text-green-600">
                  Anda telah berhasil masuk ke dashboard admin StokManager.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Dashboard Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Inventaris</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600">Kelola stok barang dan inventaris</p>
              <Button className="mt-4 w-full" disabled>
                Coming Soon
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Transaksi</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600">Riwayat transaksi dan pembelian</p>
              <Button className="mt-4 w-full" disabled>
                Coming Soon
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Absensi</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600">Sistem absensi karyawan</p>
              <Button className="mt-4 w-full" disabled>
                Coming Soon
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Authentication Status */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-lg">Status Sesi</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span>Status:</span>
                <span className="text-green-600 font-medium">Aktif</span>
              </div>
              <div className="flex justify-between">
                <span>Waktu tersisa:</span>
                <span className="font-medium">{formatTime(sessionTimeLeft)}</span>
              </div>
              <div className="text-sm text-gray-500 mt-4">
                Sesi akan berakhir otomatis setelah 30 menit tidak ada aktivitas.
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
