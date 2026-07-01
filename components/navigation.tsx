"use client"

import { useState, useEffect, useMemo } from "react"
import Link from "next/link"
import { useRouter, usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { BarChart3, Receipt, Menu, X, Package, TrendingUp, LogOut, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { NotificationBell } from "@/components/notification-bell"
import { useAuth } from "@/components/auth-provider"

const baseNavigation = [
	{ name: "Dashboard", href: "/", icon: BarChart3, key: "1" },
	{ name: "Transaksi", href: "/transaksi", icon: Receipt, key: "2" },
	{ name: "Prediksi", href: "/prediksi", icon: TrendingUp, key: "3" },
]

export default function Navigation() {
	const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
	const pathname = usePathname()
	const router = useRouter()
	const { profile, role, signOut } = useAuth()
	const navigation = useMemo(() => role === "admin"
		? [
			...baseNavigation,
			{ name: "Pengguna", href: "/admin/users", icon: ShieldCheck, key: "4" },
		]
		: baseNavigation, [role])

	// Page navigation shortcuts
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			const target = e.target as HTMLElement
			const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable
			if (isInput) return

			const item = navigation.find((n) => n.key === e.key)
			if (item) {
				e.preventDefault()
				router.push(item.href)
			}
		}
		document.addEventListener("keydown", handleKeyDown)
		return () => document.removeEventListener("keydown", handleKeyDown)
	}, [navigation, router])

	return (
		<nav className="sticky top-0 z-50 border-b border-border/70 bg-background/90 shadow-[0_1px_0_hsl(var(--foreground)/0.04)] backdrop-blur-xl">
			<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
				<div className="flex justify-between h-14">
					{/* Logo */}
					<div className="flex items-center">
						<Link href="/" className="flex items-center gap-2 group">
							<div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center shadow-sm ring-1 ring-primary/20 transition-transform duration-200 group-hover:-translate-y-0.5 group-active:translate-y-0">
								<Package className="w-4 h-4 text-primary-foreground" />
							</div>
							<span className="text-base font-extrabold text-foreground">
								StokManager
							</span>
						</Link>
					</div>

					{/* Desktop Navigation */}
					<div className="hidden md:flex md:items-center md:gap-1.5 rounded-lg border border-border/70 bg-card/70 p-1 shadow-sm">
						{navigation.map((item) => {
							const Icon = item.icon
							const isActive = pathname === item.href
							return (
								<Link
									key={item.name}
									href={item.href}
									title={`${item.name} (${item.key})`}
									aria-current={isActive ? "page" : undefined}
									className={cn(
										"relative inline-flex min-h-8 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold transition-[background-color,color,box-shadow,transform] duration-200 hover:-translate-y-0.5 active:translate-y-0",
										isActive
											? "bg-primary text-primary-foreground shadow-sm"
											: "text-muted-foreground hover:bg-accent hover:text-foreground"
									)}
								>
									<Icon className="w-3.5 h-3.5" strokeWidth={2.2} />
									{item.name}
								</Link>
							)
						})}
					</div>

					{/* Notification bell + Mobile menu button */}
					<div className="flex items-center gap-1">
						<div className="hidden lg:block text-right mr-2">
							<div className="text-xs font-medium leading-tight">{profile?.displayName || profile?.email}</div>
							<div className="text-[10px] font-semibold uppercase text-primary/70">{role}</div>
						</div>
						<NotificationBell />
						<Button variant="ghost" size="sm" onClick={() => void signOut()} aria-label="Keluar" className="hover:bg-destructive/10 hover:text-destructive">
							<LogOut className="w-4 h-4" />
						</Button>
						<div className="md:hidden">
							<Button
								variant="ghost"
								size="sm"
								onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
								className="p-2 rounded-md hover:bg-accent"
								aria-label={mobileMenuOpen ? "Tutup menu" : "Buka menu"}
							>
								{mobileMenuOpen ? (
									<X className="w-4 h-4" />
								) : (
									<Menu className="w-4 h-4" />
								)}
							</Button>
						</div>
					</div>
				</div>
			</div>

			{/* Mobile Navigation Menu */}
			{mobileMenuOpen && (
				<div className="md:hidden border-t border-border/70 bg-background/95 animate-slide-up">
					<div className="px-4 py-3 space-y-1">
						<div className="px-3 pb-3 border-b mb-2">
							<div className="text-sm font-medium truncate">{profile?.displayName || profile?.email}</div>
							<div className="text-xs font-semibold text-primary/70 uppercase">{role}</div>
						</div>
						{navigation.map((item) => {
							const Icon = item.icon
							const isActive = pathname === item.href
							return (
								<Link
									key={item.name}
									href={item.href}
									onClick={() => setMobileMenuOpen(false)}
									aria-current={isActive ? "page" : undefined}
									className={cn(
										"flex min-h-11 items-center gap-3 rounded-md px-3 py-2.5 text-sm font-semibold transition-colors",
										isActive
											? "bg-primary text-primary-foreground shadow-sm"
											: "text-muted-foreground hover:text-foreground hover:bg-accent"
									)}
								>
									<Icon className="w-4 h-4" strokeWidth={2.2} />
									{item.name}
								</Link>
							)
						})}
					</div>
				</div>
			)}
		</nav>
	)
}
