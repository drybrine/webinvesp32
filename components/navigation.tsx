"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { BarChart3, Receipt, Settings, Menu, X } from "lucide-react" // Remove History import
import { Button } from "@/components/ui/button"

const navigation = [
	{ name: "Dashboard", href: "/", icon: BarChart3 },
	// Removed Riwayat navigation item
	{ name: "Transaksi", href: "/transaksi", icon: Receipt },
	{ name: "Pengaturan", href: "/pengaturan", icon: Settings },
]

export default function Navigation() {
	const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
	const pathname = usePathname()

	return (
		<nav className="bg-white border-b border-gray-200">
			<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
				<div className="flex justify-between h-16">
					<div className="flex">
						{/* Logo */}
						<div className="flex-shrink-0 flex items-center">
							<div className="flex items-center space-x-2">
								<div className="w-8 h-8 bg-gray-900 rounded-lg flex items-center justify-center">
									<BarChart3 className="w-5 h-5 text-white" />
								</div>
								<span className="text-xl font-bold text-gray-900">
									StokManager
								</span>
							</div>
						</div>

						{/* Desktop Navigation */}
						<div className="hidden sm:ml-8 sm:flex sm:space-x-8">
							{navigation.map((item) => {
								const Icon = item.icon
								const isActive = pathname === item.href
								return (
									<Link
										key={item.name}
										href={item.href}
										className={cn(
											"inline-flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors",
											isActive
												? "bg-gray-900 text-white"
												: "text-gray-700 hover:text-gray-900 hover:bg-gray-100",
										)}
									>
										<Icon className="w-4 h-4 mr-2" />
										{item.name}
									</Link>
								)
							})}
						</div>
					</div>

					{/* Mobile menu button */}
					<div className="sm:hidden flex items-center">
						<Button
							variant="ghost"
							size="sm"
							onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
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

			{/* Mobile Navigation */}
			{mobileMenuOpen && (
				<div className="sm:hidden">
					<div className="pt-2 pb-3 space-y-1 bg-white border-t border-gray-200">
						{navigation.map((item) => {
							const Icon = item.icon
							const isActive = pathname === item.href
							return (
								<Link
									key={item.name}
									href={item.href}
									className={cn(
										"flex items-center px-4 py-2 text-base font-medium transition-colors",
										isActive
											? "bg-gray-900 text-white"
											: "text-gray-700 hover:text-gray-900 hover:bg-gray-100",
									)}
									onClick={() => setMobileMenuOpen(false)}
								>
									<Icon className="w-5 h-5 mr-3" />
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
