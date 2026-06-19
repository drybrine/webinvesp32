"use client"

import { FormEvent, useState } from "react"
import { useRouter } from "next/navigation"
import { LockKeyhole, Package } from "lucide-react"
import { firebaseAuth } from "@/lib/firebase"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"

export default function LoginPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [resetMode, setResetMode] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!email.trim() || (!resetMode && !password)) return

    setLoading(true)
    try {
      if (resetMode) {
        await firebaseAuth.sendPasswordReset(email.trim())
        toast({
          title: "Email reset dikirim",
          description: "Periksa kotak masuk dan folder spam Anda.",
        })
        setResetMode(false)
      } else {
        await firebaseAuth.signIn(email.trim(), password)
        router.replace("/")
      }
    } catch {
      toast({
        title: resetMode ? "Reset gagal" : "Login gagal",
        description: resetMode
          ? "Alamat email tidak dapat diproses."
          : "Email, kata sandi, atau status akun tidak valid.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center space-y-3">
          <div className="mx-auto w-12 h-12 rounded-xl bg-primary flex items-center justify-center">
            <Package className="w-6 h-6 text-primary-foreground" />
          </div>
          <div>
            <CardTitle className="text-2xl">StokManager</CardTitle>
            <CardDescription>
              {resetMode ? "Kirim tautan reset kata sandi" : "Masuk ke sistem inventory internal"}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={submit}>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>
            {!resetMode && (
              <div className="space-y-2">
                <Label htmlFor="password">Kata sandi</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </div>
            )}
            <Button className="w-full" type="submit" disabled={loading}>
              <LockKeyhole className="w-4 h-4 mr-2" />
              {loading ? "Memproses..." : resetMode ? "Kirim Reset" : "Masuk"}
            </Button>
            <Button
              className="w-full"
              type="button"
              variant="ghost"
              onClick={() => setResetMode((value) => !value)}
              disabled={loading}
            >
              {resetMode ? "Kembali ke login" : "Lupa kata sandi?"}
            </Button>
          </form>
          <p className="mt-5 text-center text-xs text-muted-foreground">
            Pendaftaran publik dinonaktifkan. Hubungi administrator untuk akun baru.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

