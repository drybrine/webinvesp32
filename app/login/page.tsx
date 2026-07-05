"use client"

import { FormEvent, useState } from "react"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { ArrowRight, LockKeyhole, Mail } from "lucide-react"
import { firebaseAuth } from "@/lib/firebase"
import { BrandMark } from "@/components/brand-logo"
import { Button } from "@/components/ui/button"
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
    <main className="relative min-h-[100dvh] flex items-center justify-center overflow-hidden bg-[radial-gradient(ellipse_at_top_right,_hsl(160_30%_97%)_0%,_hsl(0_0%_99%)_50%)]">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0)_0%,_rgba(255,255,255,0.8)_100%)]" />
      <div className="absolute inset-0 opacity-[0.03] [background-image:radial-gradient(hsl(var(--foreground))_1px,_transparent_1px)] [background-size:20px_20px]" />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 w-full max-w-md px-4"
      >
        <div className="rounded-[2rem] border border-border/60 bg-white/80 backdrop-blur-sm p-8 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.08)]">
          <div className="mb-8 flex flex-col items-center text-center">
            <div className="mb-5 inline-flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-emerald-600 to-teal-500 shadow-lg shadow-emerald-500/20">
              <BrandMark className="h-9 w-9 text-white" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              StokManager
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {resetMode ? "Kirim tautan reset kata sandi" : "Sistem manajemen inventory real-time"}
            </p>
          </div>

          <form onSubmit={submit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium">Email</Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  placeholder="admin@stokmanager.app"
                  className="h-12 rounded-xl pl-11"
                />
              </div>
            </div>

            {!resetMode && (
              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium">Kata sandi</Label>
                <div className="relative">
                  <LockKeyhole className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    placeholder="••••••••"
                    className="h-12 rounded-xl pl-11"
                  />
                </div>
              </div>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="h-12 w-full rounded-xl bg-emerald-600 font-semibold text-white shadow-lg shadow-emerald-500/20 transition-all hover:bg-emerald-700 hover:shadow-emerald-500/30 active:scale-[0.98] disabled:opacity-60"
            >
              {loading ? (
                "Memproses..."
              ) : (
                <>
                  {resetMode ? "Kirim Reset" : "Masuk"}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>

            <button
              type="button"
              onClick={() => setResetMode((value) => !value)}
              disabled={loading}
              className="block w-full text-center text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
            >
              {resetMode ? "Kembali ke login" : "Lupa kata sandi?"}
            </button>
          </form>

          <div className="mt-8 border-t border-border/60 pt-5 text-center">
            <p className="text-xs text-muted-foreground">
              Pendaftaran publik dinonaktifkan. Hubungi administrator untuk akun baru.
            </p>
          </div>
        </div>
      </motion.div>
    </main>
  )
}
