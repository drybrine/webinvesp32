"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { BarChart3, Receipt, Settings, Menu, X, UserCheck, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"

const navigation = [
	{ name: "Dashboard", href: "/", icon: BarChart3, color: "from-blue-500 to-purple-500" },
	{ name: "Transaksi", href: "/transaksi", icon: Receipt, color: "from-emerald-500 to-teal-500" },
	{ name: "Absensi", href: "/absensi", icon: UserCheck, color: "from-orange-500 to-red-500" },
	{ name: "Pengaturan", href: "/pengaturan", icon: Settings, color: "from-purple-500 to-pink-500" },
]

export default function Navigation() {
	const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
	const pathname = usePathname()

	return (
		<nav className="glass-morphism border-b border-white/20 sticky top-0 z-50 shadow-large backdrop-blur-2xl">
			<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
				<div className="flex justify-between h-16 sm:h-18">
					<div className="flex">
						{/* Enhanced Logo with modern design */}
						<div className="flex-shrink-0 flex items-center">
							<div className="flex items-center space-x-3 group">
								<div className="relative">
									<div className="w-10 h-10 sm:w-12 sm:h-12 gradient-primary rounded-2xl flex items-center justify-center shadow-colored interactive-scale group-hover:shadow-extra-large transition-all duration-300">
										<Sparkles className="w-5 h-5 sm:w-6 sm:h-6 text-white animate-pulse" />
									</div>
									<div className="absolute -top-1 -right-1 w-4 h-4 bg-gradient-to-r from-yellow-400 to-orange-500 rounded-full animate-bounce-gentle"></div>
								</div>
								<div className="hidden xs:block">
									<div className="space-y-1">
										<span className="text-2xl sm:text-3xl font-bold gradient-text tracking-tight">
											StokManager
										</span>
										<div className="text-xs text-muted-foreground font-semibold tracking-wide uppercase opacity-75">
											Smart Inventory System
										</div>
									</div>
								</div>
								<span className="text-2xl font-bold gradient-text xs:hidden tracking-tight">
									SM
								</span>
							</div>
						</div>

						{/* Enhanced Desktop Navigation */}
						<div className="hidden md:ml-10 md:flex md:space-x-3 lg:space-x-4">
							{navigation.map((item) => {
								const Icon = item.icon
								const isActive = pathname === item.href
								return (
									<Link
										key={item.name}
										href={item.href}
										className={cn(
											"relative inline-flex items-center px-4 lg:px-6 py-3 text-sm font-semibold rounded-2xl transition-all duration-300 overflow-hidden group btn-modern",
											isActive
												? `bg-gradient-to-r ${item.color} text-white shadow-colored transform scale-105`
												: "text-foreground/80 hover:text-foreground hover:bg-accent/50 hover:shadow-medium hover:scale-102",
										)}
									>
										{isActive && (
											<>
												<div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent opacity-50 animate-pulse rounded-2xl"></div>
												<div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-scan-line rounded-2xl"></div>
											</>
										)}
										<Icon className={cn(
											"w-5 h-5 mr-3 relative z-10 transition-transform duration-300",
											isActive ? "animate-bounce-gentle" : "group-hover:scale-110"
										)} />
										<span className="hidden lg:block relative z-10 font-medium">{item.name}</span>
										{isActive && (
											<div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-2 h-2 bg-white rounded-full shadow-medium animate-pulse"></div>
										)}
									</Link>
								)
							})}
						</div>
					</div>

					{/* Enhanced Mobile menu button */}
					<div className="md:hidden flex items-center">
						<Button
							variant="ghost"
							size="sm"
							onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
							className="relative p-3 rounded-2xl hover:bg-accent/50 hover:shadow-medium interactive-scale transition-all duration-300"
						>
							<div className="relative w-6 h-6">
								{mobileMenuOpen ? (
									<X className="w-6 h-6 text-foreground transition-transform duration-300 rotate-180" />
								) : (
									<Menu className="w-6 h-6 text-foreground transition-transform duration-300" />
								)}
							</div>
						</Button>
					</div>
				</div>
			</div>

			{/* Enhanced Mobile Navigation */}
			{mobileMenuOpen && (
				<div className="md:hidden border-t border-white/10 glass-morphism animate-fade-in-down">
					<div className="px-4 pt-6 pb-8 space-y-3">
						{navigation.map((item) => {
							const Icon = item.icon
							const isActive = pathname === item.href
							return (
								<Link
									key={item.name}
									href={item.href}
									className={cn(
										"flex items-center px-6 py-4 text-base font-semibold rounded-2xl transition-all duration-300 relative overflow-hidden group card-hover",
										isActive
											? `bg-gradient-to-r ${item.color} text-white shadow-large`
											: "text-foreground/80 hover:text-foreground hover:bg-accent/30 hover:shadow-medium",
									)}
									onClick={() => setMobileMenuOpen(false)}
								>
									{isActive && (
										<div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent opacity-30 animate-pulse rounded-2xl"></div>
									)}
									<Icon className={cn(
										"w-6 h-6 mr-4 relative z-10 transition-transform duration-300",
										isActive ? "animate-bounce-gentle" : "group-hover:scale-110"
									)} />
									<span className="relative z-10 font-medium tracking-wide">{item.name}</span>
									{isActive && (
										<div className="ml-auto relative z-10">
											<div className="w-3 h-3 bg-white/80 rounded-full shadow-medium animate-pulse"></div>
										</div>
									)}
								</Link>
							)
						})}
					</div>
				</div>
			)}
		</nav>
	)
}
