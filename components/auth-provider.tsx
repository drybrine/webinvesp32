"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { onValue, ref } from "firebase/database"
import type { User } from "firebase/auth"
import { usePathname, useRouter } from "next/navigation"
import { database, firebaseAuth, getFirebaseAuth, waitForFirebaseReady } from "@/lib/firebase"
import type { UserProfile, UserRole } from "@/types/security"

interface AuthContextValue {
  user: User | null
  profile: UserProfile | null
  role: UserRole | null
  loading: boolean
  signOut: () => Promise<void>
  getIdToken: (forceRefresh?: boolean) => Promise<string>
}

const AuthContext = createContext<AuthContextValue | null>(null)

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-muted/30 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary border-t-transparent mx-auto mb-4" />
        <p className="text-muted-foreground">Memverifikasi sesi...</p>
      </div>
    </div>
  )
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [role, setRole] = useState<UserRole | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [profileReady, setProfileReady] = useState(false)

  const currentUserRef = useRef<User | null>(null)
  useEffect(() => {
    currentUserRef.current = user
  }, [user])

  useEffect(() => {
    let unsubscribeAuth: (() => void) | undefined
    let unsubscribeProfile: (() => void) | undefined
    let cancelled = false

    const start = async () => {
      try {
        for (const key of ["inventory_items", "scan_records", "device_status", "transaction_records"]) {
          localStorage.removeItem(key)
        }
        await waitForFirebaseReady(10000)
        if (cancelled) return

        const auth = await getFirebaseAuth()
        const { onIdTokenChanged } = await import("firebase/auth")

        unsubscribeAuth = onIdTokenChanged(auth, async (nextUser) => {
          try {
            const isSameUser =
              currentUserRef.current &&
              nextUser &&
              currentUserRef.current.uid === nextUser.uid

            unsubscribeProfile?.()
            unsubscribeProfile = undefined
            setUser(nextUser)

            if (!isSameUser) {
              setProfile(null)
              setRole(null)
              setProfileReady(false)
            }

            if (!nextUser) {
              setAuthReady(true)
              setProfileReady(true)
              return
            }

            const token = await nextUser.getIdTokenResult()
            const claimRole = token.claims.role
            const nextRole: UserRole | null =
              claimRole === "admin" || claimRole === "operator" || claimRole === "viewer"
                ? claimRole
                : null

            setRole(nextRole)
            setAuthReady(true)

            if (!database) {
              setUser(null)
              setProfileReady(true)
              void firebaseAuth.signOut()
              return
            }

            unsubscribeProfile = onValue(
              ref(database, `users/${nextUser.uid}`),
              (snapshot) => {
                const value = snapshot.val()
                if (
                  !value ||
                  value.disabled === true ||
                  token.claims.disabled === true ||
                  !nextRole ||
                  value.role !== nextRole
                ) {
                  setProfile(null)
                  setProfileReady(true)
                  void firebaseAuth.signOut()
                  return
                }

                setProfile({
                  ...value,
                  uid: nextUser.uid,
                  email: nextUser.email || value.email || "",
                  displayName: value.displayName || nextUser.displayName || nextUser.email || "",
                  role: nextRole,
                  disabled: false,
                })
                setProfileReady(true)
              },
              () => {
                setProfileReady(true)
                void firebaseAuth.signOut()
              },
            )
          } catch {
            setUser(null)
            setProfile(null)
            setRole(null)
            setAuthReady(true)
            setProfileReady(true)
            void firebaseAuth.signOut()
          }
        })
      } catch {
        if (cancelled) return
        setUser(null)
        setProfile(null)
        setRole(null)
        setAuthReady(true)
        setProfileReady(true)
      }
    }

    void start()
    return () => {
      cancelled = true
      unsubscribeAuth?.()
      unsubscribeProfile?.()
    }
  }, [])

  const signOut = useCallback(async () => {
    await firebaseAuth.signOut()
    router.replace("/login")
  }, [router])

  const getIdToken = useCallback(async (forceRefresh = false) => {
    const auth = await getFirebaseAuth()
    if (!auth.currentUser) throw new Error("Sesi telah berakhir")
    return auth.currentUser.getIdToken(forceRefresh)
  }, [])

  const loading = !authReady || !profileReady
  const isLoginPage = pathname === "/login"
  const isAdminRoute = pathname.startsWith("/admin")

  useEffect(() => {
    if (loading) return
    if (!user && !isLoginPage) router.replace("/login")
    if (user && profile && isLoginPage) router.replace("/")
    if (user && profile && isAdminRoute && role !== "admin") router.replace("/")
  }, [isAdminRoute, isLoginPage, loading, profile, role, router, user])

  const value = useMemo<AuthContextValue>(
    () => ({ user, profile, role, loading, signOut, getIdToken }),
    [getIdToken, loading, profile, role, signOut, user],
  )

  // Login page renders immediately — the form is self-contained and calls
  // signIn() directly. Don't block it behind the auth-state resolution.
  if (isLoginPage) return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  if (loading) return <LoadingScreen />
  if (!user || !profile) return <LoadingScreen />
  if (isAdminRoute && role !== "admin") return <LoadingScreen />

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error("useAuth harus digunakan di dalam AuthProvider")
  return value
}
