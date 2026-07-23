"use client"

import { useState, useEffect, useMemo } from "react"
import Link from "next/link"
import { useRouter, usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { BarChart3, Receipt, Menu, X, TrendingUp, LogOut, ShieldCheck } from "lucide-react"
import { Button } from "@heroui/react"
import { NotificationBell } from "@/components/notification-bell"
import { useAuth } from "@/components/auth-provider"
import { BrandMark } from "@/components/brand-logo"

const baseNavigation = [
	{ name: "Dashboard", href: "/", icon: BarChart3, key: "1" },
	{ name: "Riwayat", href: "/riwayat", icon: Receipt, key: "2" },
	{ name: "Prediksi", href: "/prediksi", icon: TrendingUp, key: "3" },
]

function isNavActive(pathname: string, href: string) {
	if (href === "/") return pathname === "/"
	return pathname === href || pathname.startsWith(`${href}/`)
}

export default function Navigation() {
	const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
	const pathname = usePathname()
	const router = useRouter()
	const { profile, role, signOut } = useAuth()
	const navigation = useMemo(
		() =>
			role === "admin"
				? [...baseNavigation, { name: "Pengguna", href: "/admin/users", icon: ShieldCheck, key: "4" }]
				: baseNavigation,
		[role],
	)

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
		<nav className="sticky top-0 z-50 border-b border-border/60 bg-background/90 shadow-sm backdrop-blur-xl">
			<div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
				<div className="flex h-14 items-center justify-between gap-3">
					{/* Brand */}
					<Link href="/" className="group flex shrink-0 items-center gap-2">
						<BrandMark className="h-8 w-8 shadow-sm ring-1 ring-accent/20 transition-transform duration-200 group-hover:-translate-y-0.5" />
						<span className="text-base font-extrabold tracking-normal text-foreground">
							StokManager
						</span>
					</Link>

					{/* Desktop tabs */}
					<div
						className="hidden items-center gap-0.5 rounded-full border border-border/70 bg-surface p-1 shadow-sm md:flex"
						role="navigation"
						aria-label="Menu utama"
					>
						{navigation.map((item) => {
							const Icon = item.icon
							const active = isNavActive(pathname, item.href)
							return (
								<Link
									key={item.name}
									href={item.href}
									title={`${item.name} (${item.key})`}
									aria-current={active ? "page" : undefined}
									className={cn(
										"inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-sm font-medium tracking-normal transition-colors duration-150",
										active
											? "bg-accent text-accent-foreground shadow-sm"
											: "text-muted hover:bg-default hover:text-foreground",
									)}
								>
									<Icon className="h-4 w-4 shrink-0 opacity-90" strokeWidth={2.25} aria-hidden />
									<span className="leading-none">{item.name}</span>
								</Link>
							)
						})}
					</div>

					{/* Right actions */}
					<div className="flex shrink-0 items-center gap-1">
						<div className="mr-1 hidden min-w-0 text-right lg:block">
							<div className="truncate text-xs font-medium leading-tight text-foreground">
								{profile?.displayName || profile?.email}
							</div>
							<div className="text-[10px] font-semibold uppercase tracking-wide text-accent">
								{role}
							</div>
						</div>
						<NotificationBell />
						<Button
							variant="ghost"
							size="sm"
							isIconOnly
							onPress={() => void signOut()}
							aria-label="Keluar"
							className="hover:bg-danger/10 hover:text-danger"
						>
							<LogOut className="h-4 w-4" />
						</Button>
						<div className="md:hidden">
							<Button
								variant="ghost"
								size="sm"
								isIconOnly
								onPress={() => setMobileMenuOpen(!mobileMenuOpen)}
								aria-label={mobileMenuOpen ? "Tutup menu" : "Buka menu"}
							>
								{mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
							</Button>
						</div>
					</div>
				</div>
			</div>

			{/* Mobile menu */}
			{mobileMenuOpen && (
				<div className="animate-slide-up border-t border-border/70 bg-background/95 md:hidden">
					<div className="space-y-1 px-4 py-3">
						<div className="mb-2 border-b border-border px-3 pb-3">
							<div className="truncate text-sm font-medium text-foreground">
								{profile?.displayName || profile?.email}
							</div>
							<div className="text-xs font-semibold uppercase tracking-wide text-accent">{role}</div>
						</div>
						{navigation.map((item) => {
							const Icon = item.icon
							const active = isNavActive(pathname, item.href)
							return (
								<Link
									key={item.name}
									href={item.href}
									onClick={() => setMobileMenuOpen(false)}
									aria-current={active ? "page" : undefined}
									className={cn(
										"flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium tracking-normal transition-colors",
										active
											? "bg-accent text-accent-foreground shadow-sm"
											: "text-muted hover:bg-default hover:text-foreground",
									)}
								>
									<Icon className="h-4 w-4 shrink-0" strokeWidth={2.25} aria-hidden />
									<span>{item.name}</span>
								</Link>
							)
						})}
					</div>
				</div>
			)}
		</nav>
	)
}
