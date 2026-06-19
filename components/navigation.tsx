"use client"

import { useState, useEffect, useMemo } from "react"
import Link from "next/link"
import { useRouter, usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { BarChart3, Receipt, Menu, X, Package, TrendingUp, LogOut, ShieldCheck, ScrollText, Radio } from "lucide-react"
import { Button } from "@/components/ui/button"
import { NotificationBell } from "@/components/notification-bell"
import { useAuth } from "@/components/auth-provider"

const baseNavigation = [
	{ name: "Dashboard", href: "/", icon: BarChart3, key: "1" },
	{ name: "Transaksi", href: "/transaksi", icon: Receipt, key: "2" },
	{ name: "Prediksi", href: "/prediksi", icon: TrendingUp, key: "3" },
	{ name: "Scan", href: "/scan", icon: Radio, key: "4" },
]

export default function Navigation() {
	const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
	const pathname = usePathname()
	const router = useRouter()
	const { profile, role, signOut } = useAuth()
	const navigation = useMemo(() => role === "admin"
		? [
			...baseNavigation,
			{ name: "Pengguna", href: "/admin/users", icon: ShieldCheck, key: "5" },
			{ name: "Audit", href: "/audit", icon: ScrollText, key: "6" },
		]
		: baseNavigation, [role])

	// Page navigation shortcuts: 1-3
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
		<nav className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
			<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
				<div className="flex justify-between h-14">
					{/* Logo */}
					<div className="flex items-center">
						<Link href="/" className="flex items-center gap-2 group">
							<div className="w-7 h-7 bg-primary rounded-md flex items-center justify-center transition-transform group-hover:scale-105">
								<Package className="w-4 h-4 text-primary-foreground" />
							</div>
							<span className="text-base font-extrabold text-foreground tracking-tight">
								StokManager
							</span>
						</Link>
					</div>

					{/* Desktop Navigation */}
					<div className="hidden md:flex md:items-center md:gap-1">
						{navigation.map((item) => {
							const Icon = item.icon
							const isActive = pathname === item.href
							return (
								<Link
									key={item.name}
									href={item.href}
									title={`${item.name} (${item.key})`}
									className={cn(
										"inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
										isActive
											? "bg-primary text-primary-foreground"
											: "text-muted-foreground hover:text-foreground hover:bg-accent"
									)}
								>
									<Icon className="w-3.5 h-3.5" />
									{item.name}
								</Link>
							)
						})}
					</div>

					{/* Notification bell + Mobile menu button */}
					<div className="flex items-center gap-1">
						<div className="hidden lg:block text-right mr-2">
							<div className="text-xs font-medium leading-tight">{profile?.displayName || profile?.email}</div>
							<div className="text-[10px] uppercase text-muted-foreground">{role}</div>
						</div>
						<NotificationBell />
						<Button variant="ghost" size="sm" onClick={() => void signOut()} aria-label="Keluar">
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
				<div className="md:hidden border-t border-border bg-background">
					<div className="px-4 py-2 space-y-1">
						<div className="px-3 py-2 border-b mb-2">
							<div className="text-sm font-medium truncate">{profile?.displayName || profile?.email}</div>
							<div className="text-xs text-muted-foreground uppercase">{role}</div>
						</div>
						{navigation.map((item) => {
							const Icon = item.icon
							const isActive = pathname === item.href
							return (
								<Link
									key={item.name}
									href={item.href}
									onClick={() => setMobileMenuOpen(false)}
									className={cn(
										"flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors",
										isActive
											? "bg-primary text-primary-foreground"
											: "text-muted-foreground hover:text-foreground hover:bg-accent"
									)}
								>
									<Icon className="w-4 h-4" />
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
