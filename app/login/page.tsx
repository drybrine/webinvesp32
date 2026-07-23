"use client"

import { FormEvent, useState } from "react"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { ArrowRight, LockKeyhole, Mail } from "lucide-react"
import { Button, Card, Input, Label, Surface } from "@heroui/react"
import { firebaseAuth } from "@/lib/firebase"
import { BrandMark } from "@/components/brand-logo"
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
    <main className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,oklch(0.92_0.05_165)_0%,transparent_55%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.035] [background-image:radial-gradient(currentColor_1px,transparent_1px)] [background-size:20px_20px]" />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 w-full max-w-md px-4"
      >
        <Card className="w-full p-2 shadow-lg">
          <Card.Header className="items-center text-center gap-3 pt-6">
            <div className="inline-flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-emerald-600 to-teal-500 shadow-lg shadow-emerald-500/20">
              <BrandMark className="h-9 w-9 text-white" />
            </div>
            <Card.Title className="text-2xl">StokManager</Card.Title>
            <Card.Description>
              {resetMode ? "Kirim tautan reset kata sandi" : "Sistem manajemen inventory real-time"}
            </Card.Description>
          </Card.Header>

          <Card.Content className="px-6 pb-2">
            <Surface variant="default" className="rounded-2xl p-4">
              <form onSubmit={submit} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="email">Email</Label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted" />
                    <Input
                      id="email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      required
                      placeholder="admin@stokmanager.app"
                      className="pl-11"
                      fullWidth
                      variant="secondary"
                    />
                  </div>
                </div>

                {!resetMode && (
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="password">Kata sandi</Label>
                    <div className="relative">
                      <LockKeyhole className="pointer-events-none absolute left-3.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted" />
                      <Input
                        id="password"
                        type="password"
                        autoComplete="current-password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        required
                        placeholder="••••••••"
                        className="pl-11"
                        fullWidth
                        variant="secondary"
                      />
                    </div>
                  </div>
                )}

                <Button type="submit" isPending={loading} fullWidth className="mt-1">
                  {({ isPending }) => (
                    <>
                      {isPending ? "Memproses..." : resetMode ? "Kirim Reset" : "Masuk"}
                      {!isPending && <ArrowRight className="h-4 w-4" />}
                    </>
                  )}
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  isDisabled={loading}
                  onPress={() => setResetMode((value) => !value)}
                  fullWidth
                >
                  {resetMode ? "Kembali ke login" : "Lupa kata sandi?"}
                </Button>
              </form>
            </Surface>
          </Card.Content>

          <Card.Footer className="justify-center border-t border-border/60 pt-4 pb-6">
            <p className="text-center text-xs text-muted">
              Pendaftaran publik dinonaktifkan. Hubungi administrator untuk akun baru.
            </p>
          </Card.Footer>
        </Card>
      </motion.div>
    </main>
  )
}
