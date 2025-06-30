"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { BarChart3, Receipt, Settings, Menu, X, UserCheck, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SessionIndicator } from "@/components/session-indicator"

const navigation = [
	{ name: "Dashboard", href: "/", icon: BarChart3, color: "from-blue-500 to-purple-500" },
	{ name: "Transaksi", href: "/transaksi", icon: Receipt, color: "from-emerald-500 to-teal-500" },
	{ name: "Absensi", href: "/absensi", icon: UserCheck, color: "from-orange-500 to-red-500" },
	{ name: "Pengaturan", href: "/pengaturan", icon: Settings, color: "from-purple-500 to-pink-500" },
]

export default function Navigation() {
	const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
	const pathname = usePathname()

	// Don't show navigation on login page
	if (pathname === "/login") {
		return null
	}

	return (
		<nav className="glass-morphism border-b border-white/20 sticky top-0 z-50 shadow-large backdrop-blur-2xl">
			<div className="max-w-7xl mx-auto mobile-padding">
				<div className="flex justify-between h-14 sm:h-16 lg:h-18">
					<div className="flex">
						{/* Enhanced Logo with mobile-first design */}
						<div className="flex-shrink-0 flex items-center">
							<div className="flex items-center space-x-2 sm:space-x-3 group">
								<div className="relative">
									<div className="w-8 h-8 sm:w-10 sm:h-10 lg:w-12 lg:h-12 gradient-primary rounded-xl sm:rounded-2xl flex items-center justify-center shadow-colored interactive-scale group-hover:shadow-extra-large transition-all duration-300">
										<Sparkles className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 text-white animate-pulse" />
									</div>
									<div className="absolute -top-0.5 -right-0.5 sm:-top-1 sm:-right-1 w-3 h-3 sm:w-4 sm:h-4 bg-gradient-to-r from-yellow-400 to-orange-500 rounded-full animate-bounce-gentle"></div>
								</div>
								<div className="hidden xs:block">
									<div className="space-y-0.5 sm:space-y-1">
										<span className="text-xl sm:text-2xl lg:text-3xl font-bold gradient-text tracking-tight">
											StokManager
										</span>
										<div className="text-xs text-muted-foreground font-semibold tracking-wide uppercase opacity-75">
											Smart Inventory System
										</div>
									</div>
								</div>
								<span className="text-xl sm:text-2xl font-bold gradient-text xs:hidden tracking-tight">
									SM
								</span>
							</div>
						</div>

						{/* Enhanced Desktop Navigation */}
						<div className="hidden md:ml-6 lg:ml-10 md:flex md:space-x-2 lg:space-x-4">
							{navigation.map((item) => {
								const Icon = item.icon
								const isActive = pathname === item.href
								return (
									<Link
										key={item.name}
										href={item.href}
										className={cn(
											"relative inline-flex items-center px-3 lg:px-6 py-2 lg:py-3 text-sm font-semibold rounded-xl lg:rounded-2xl transition-all duration-300 overflow-hidden group btn-modern min-h-[44px]",
											isActive
												? `bg-gradient-to-r ${item.color} text-white shadow-colored transform scale-105`
												: "text-foreground/80 hover:text-foreground hover:bg-accent/50 hover:shadow-medium hover:scale-102",
										)}
									>
										{isActive && (
											<>
												<div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent opacity-50 animate-pulse rounded-xl lg:rounded-2xl"></div>
												<div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-scan-line rounded-xl lg:rounded-2xl"></div>
											</>
										)}
										<Icon className={cn(
											"w-4 h-4 lg:w-5 lg:h-5 mr-2 lg:mr-3 relative z-10 transition-transform duration-300",
											isActive ? "animate-bounce-gentle" : "group-hover:scale-110"
										)} />
										<span className="hidden lg:block relative z-10 font-medium">{item.name}</span>
										<span className="lg:hidden relative z-10 font-medium text-xs">{item.name}</span>
										{isActive && (
											<div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-1.5 h-1.5 lg:w-2 lg:h-2 bg-white rounded-full shadow-medium animate-pulse"></div>
										)}
									</Link>
								)
							})}
						</div>
					</div>

					{/* Session Indicator & Mobile menu button */}
					<div className="flex items-center gap-2">
						{/* Session Indicator - hidden on mobile, shown on desktop */}
						<div className="hidden sm:block">
							<SessionIndicator />
						</div>

						{/* Enhanced Mobile menu button */}
						<div className="md:hidden flex items-center">
							<Button
								variant="ghost"
								size="sm"
								onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
								className="relative p-2 sm:p-3 rounded-xl hover:bg-accent/50 hover:shadow-medium interactive-scale transition-all duration-300 min-h-[44px] min-w-[44px]"
							>
								<div className="relative w-5 h-5 sm:w-6 sm:h-6">
									{mobileMenuOpen ? (
										<X className="w-5 h-5 sm:w-6 sm:h-6 text-foreground transition-transform duration-300 rotate-180" />
									) : (
										<Menu className="w-5 h-5 sm:w-6 sm:h-6 text-foreground transition-transform duration-300" />
									)}
								</div>
							</Button>
						</div>
					</div>
				</div>
			</div>

			{/* Enhanced Mobile Navigation Menu */}
			{mobileMenuOpen && (
				<div className="md:hidden">
					<div className="glass-morphism border-t border-white/10 mobile-scroll">
						<div className="mobile-padding py-3 space-y-2">
							{/* Session Indicator for Mobile */}
							<div className="pb-2 border-b border-white/10">
								<SessionIndicator />
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
											"flex items-center px-4 py-3 text-base font-semibold rounded-xl transition-all duration-300 group mobile-full interactive-scale min-h-[52px]",
											isActive
												? `bg-gradient-to-r ${item.color} text-white shadow-colored`
												: "text-foreground/80 hover:text-foreground hover:bg-accent/50 hover:shadow-medium",
										)}
									>
										<Icon className={cn(
											"w-5 h-5 mr-3 transition-transform duration-300",
											isActive ? "text-white animate-bounce-gentle" : "group-hover:scale-110"
										)} />
										<span className={cn(
											"font-medium",
											isActive ? "text-white" : ""
										)}>{item.name}</span>
										{isActive && (
											<div className="ml-auto w-2 h-2 bg-white rounded-full animate-pulse"></div>
										)}
									</Link>
								)
							})}
						</div>
					</div>
				</div>
			)}
		</nav>
	)
}
