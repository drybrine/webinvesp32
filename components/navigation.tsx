"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { BarChart3, Receipt, Menu, X, Package, TrendingUp } from "lucide-react"
import { Button } from "@/components/ui/button"

const navigation = [
	{ name: "Dashboard", href: "/", icon: BarChart3 },
	{ name: "Transaksi", href: "/transaksi", icon: Receipt },
	{ name: "Prediksi", href: "/prediksi", icon: TrendingUp },
]

export default function Navigation() {
	const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
	const pathname = usePathname()

	return (
		<nav className="sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border">
			<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
				<div className="flex justify-between h-16">
					{/* Logo */}
					<div className="flex items-center">
						<Link href="/" className="flex items-center gap-3 group">
							<div className="w-9 h-9 bg-primary rounded-lg flex items-center justify-center shadow-sm group-hover:shadow-md transition-shadow">
								<Package className="w-5 h-5 text-primary-foreground" />
							</div>
							<div className="hidden sm:block">
								<span className="text-xl font-bold text-foreground">
									StokManager
								</span>
								<div className="text-xs text-muted-foreground -mt-0.5">
									Smart Inventory
								</div>
							</div>
							<span className="text-xl font-bold text-foreground sm:hidden">
								SM
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
									className={cn(
										"inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
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

					{/* Mobile menu button */}
					<div className="flex items-center md:hidden">
						<Button
							variant="ghost"
							size="sm"
							onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
							className="p-2 rounded-lg hover:bg-accent"
							aria-label={mobileMenuOpen ? "Tutup menu" : "Buka menu"}
						>
							{mobileMenuOpen ? (
								<X className="w-5 h-5" />
							) : (
								<Menu className="w-5 h-5" />
							)}
						</Button>
					</div>
				</div>
			</div>

			{/* Mobile Navigation Menu */}
			{mobileMenuOpen && (
				<div className="md:hidden border-t border-border bg-background">
					<div className="px-4 py-3 space-y-1">
						{navigation.map((item) => {
							const Icon = item.icon
							const isActive = pathname === item.href
							return (
								<Link
									key={item.name}
									href={item.href}
									onClick={() => setMobileMenuOpen(false)}
									className={cn(
										"flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors",
										isActive
											? "bg-primary text-primary-foreground"
											: "text-muted-foreground hover:text-foreground hover:bg-accent"
									)}
								>
									<Icon className="w-5 h-5" />
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