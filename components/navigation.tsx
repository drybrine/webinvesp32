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
		<nav className="sticky top-0 z-50 bg-background border-b border-border">
			<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
				<div className="flex justify-between h-14">
					{/* Logo */}
					<div className="flex items-center">
						<Link href="/" className="flex items-center gap-2.5 group">
							<div className="w-7 h-7 bg-foreground rounded-md flex items-center justify-center">
								<Package className="w-4 h-4 text-background" />
							</div>
							<span className="text-base font-bold text-foreground tracking-tight">
								StokManager
							</span>
						</Link>
					</div>

					{/* Desktop Navigation */}
					<div className="hidden md:flex md:items-center md:gap-0.5">
						{navigation.map((item) => {
							const Icon = item.icon
							const isActive = pathname === item.href
							return (
								<Link
									key={item.name}
									href={item.href}
									className={cn(
										"inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
										isActive
											? "bg-foreground text-background"
											: "text-muted-foreground hover:text-foreground hover:bg-accent"
									)}
								>
									<Icon className="w-3.5 h-3.5" />
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

			{/* Mobile Navigation Menu */}
			{mobileMenuOpen && (
				<div className="md:hidden border-t border-border bg-background">
					<div className="px-4 py-2 space-y-0.5">
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
											? "bg-foreground text-background"
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