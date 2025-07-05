"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import { useSession } from "@/hooks/use-session"
import { Shield, Clock, AlertTriangle } from "lucide-react"

export default function LoginPage() {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [showSessionExpired, setShowSessionExpired] = useState(false)
  const { toast } = useToast()
  const { login } = useSession()

  // Check if user was redirected due to session expiry
  useEffect(() => {
    if (typeof window !== "undefined") {
      const wasLoggedIn = localStorage.getItem("wasLoggedIn")
      if (wasLoggedIn) {
        setShowSessionExpired(true)
        localStorage.removeItem("wasLoggedIn")
        toast({
          title: "Sesi Telah Berakhir",
          description: "Anda telah logout otomatis karena tidak ada aktivitas selama 30 menit",
          variant: "destructive",
        })
      }
    }
  }, [toast])

  // Don't redirect here - let AdminGuard handle it after state update

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const success = login(username, password)
      
      if (success) {
        toast({ 
          title: "Login Berhasil", 
          description: "Selamat datang! Sesi aktif selama 30 menit." 
        })
        // AdminGuard will handle redirect after state update
      } else {
        toast({ 
          title: "Login Gagal", 
          description: "Username atau password salah", 
          variant: "destructive" 
        })
      }
    } catch {
      toast({ 
        title: "Error", 
        description: "Terjadi kesalahan saat login", 
        variant: "destructive" 
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 px-4">
      <div className="w-full max-w-md space-y-6">
        
        {/* Session Expired Alert */}
        {showSessionExpired && (
          <Card className="border-orange-200 bg-orange-50">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-orange-600" />
                <div>
                  <p className="text-sm font-medium text-orange-800">Sesi Telah Berakhir</p>
                  <p className="text-xs text-orange-600">Silakan login kembali untuk melanjutkan</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Login Card */}
        <Card className="shadow-lg">
          <CardHeader className="text-center space-y-4">
            <div className="mx-auto w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center">
              <Shield className="h-6 w-6 text-white" />
            </div>
            <div>
              <CardTitle className="text-2xl font-bold text-gray-900">StokManager Admin</CardTitle>
              <CardDescription className="text-gray-600">
                Masuk ke panel administrasi sistem
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            
            {/* Security Info */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <div className="flex items-center gap-2 text-blue-800">
                <Clock className="h-4 w-4" />
                <span className="text-sm font-medium">Keamanan Sesi</span>
              </div>
              <p className="text-xs text-blue-600 mt-1">
                Sesi akan berakhir otomatis setelah 30 menit tidak ada aktivitas
              </p>
            </div>

            {/* Login Form */}
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="username" className="text-sm font-medium text-gray-700">
                  Username
                </label>
                <Input
                  id="username"
                  type="text"
                  placeholder="Masukkan username"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  required
                  autoFocus
                  className="mobile-input"
                />
              </div>
              
              <div className="space-y-2">
                <label htmlFor="password" className="text-sm font-medium text-gray-700">
                  Password
                </label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Masukkan password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  className="mobile-input"
                />
              </div>
              
              <Button 
                type="submit" 
                className="w-full btn-mobile bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700" 
                disabled={loading}
              >
                {loading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Memproses...
                  </div>
                ) : (
                  "Masuk ke Dashboard"
                )}
              </Button>
            </form>

            {/* Demo Credentials */}
            <div className="border-t pt-4">
              <p className="text-xs text-gray-500 text-center mb-2">Demo Credentials:</p>
              <div className="flex gap-2 justify-center">
                <Badge variant="outline" className="text-xs">admin</Badge>
                <Badge variant="outline" className="text-xs">admin123</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <p className="text-center text-xs text-gray-500">
          © 2025 StokManager. Sistem Manajemen Inventaris
        </p>
      </div>
    </div>
  )
}