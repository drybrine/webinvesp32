"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { BarChart3, Receipt, Settings, Menu, X, UserCheck } from "lucide-react"
import { Button } from "@/components/ui/button"

const navigation = [
	{ name: "Dashboard", href: "/", icon: BarChart3 },
	{ name: "Transaksi", href: "/transaksi", icon: Receipt },
	{ name: "Absensi", href: "/absensi", icon: UserCheck },
	{ name: "Pengaturan", href: "/pengaturan", icon: Settings },
]

export default function Navigation() {
	const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
	const pathname = usePathname()

	return (
		<nav className="bg-white/95 backdrop-blur-md border-b border-gray-200/50 sticky top-0 z-50 shadow-sm">
			<div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
				<div className="flex justify-between h-14 sm:h-16">
					<div className="flex">
						{/* Enhanced Logo */}
						<div className="flex-shrink-0 flex items-center">
							<div className="flex items-center space-x-3">
								<div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-blue-600 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
									<BarChart3 className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
								</div>
								<div className="hidden xs:block">
									<span className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
										StokManager
									</span>
									<div className="text-xs text-gray-500 font-medium -mt-1">
										Smart Inventory System
									</div>
								</div>
								<span className="text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent xs:hidden">
									SM
								</span>
							</div>
						</div>

						{/* Enhanced Desktop Navigation */}
						<div className="hidden md:ml-8 md:flex md:space-x-2 lg:space-x-4">
							{navigation.map((item) => {
								const Icon = item.icon
								const isActive = pathname === item.href
								return (
									<Link
										key={item.name}
										href={item.href}
										className={cn(
											"inline-flex items-center px-3 lg:px-4 py-2 text-sm font-semibold rounded-xl transition-all duration-200 relative overflow-hidden",
											isActive
												? "bg-gradient-to-r from-blue-500 to-purple-500 text-white shadow-lg transform scale-105"
												: "text-gray-600 hover:text-gray-900 hover:bg-gradient-to-r hover:from-blue-50 hover:to-purple-50 hover:shadow-md",
										)}
									>
										{isActive && (
											<div className="absolute inset-0 bg-gradient-to-r from-blue-400 to-purple-400 opacity-20 animate-pulse rounded-xl"></div>
										)}
										<Icon className="w-4 h-4 mr-2 lg:mr-3 relative z-10" />
										<span className="hidden lg:block relative z-10">{item.name}</span>
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
							className="p-2 hover:bg-gradient-to-r hover:from-blue-50 hover:to-purple-50 rounded-xl transition-all duration-200"
						>
							{mobileMenuOpen ? (
								<X className="w-5 h-5 text-gray-600" />
							) : (
								<Menu className="w-5 h-5 text-gray-600" />
							)}
						</Button>
					</div>
				</div>
			</div>

			{/* Enhanced Mobile Navigation */}
			{mobileMenuOpen && (
				<div className="md:hidden border-t border-gray-200/50 bg-white/95 backdrop-blur-md">
					<div className="px-4 pt-4 pb-6 space-y-2">
						{navigation.map((item) => {
							const Icon = item.icon
							const isActive = pathname === item.href
							return (
								<Link
									key={item.name}
									href={item.href}
									className={cn(
										"flex items-center px-4 py-3 text-base font-semibold rounded-xl transition-all duration-200 relative overflow-hidden",
										isActive
											? "bg-gradient-to-r from-blue-500 to-purple-500 text-white shadow-lg"
											: "text-gray-700 hover:text-gray-900 hover:bg-gradient-to-r hover:from-blue-50 hover:to-purple-50 hover:shadow-md",
									)}
									onClick={() => setMobileMenuOpen(false)}
								>
									{isActive && (
										<div className="absolute inset-0 bg-gradient-to-r from-blue-400 to-purple-400 opacity-20 animate-pulse rounded-xl"></div>
									)}
									<Icon className="w-5 h-5 mr-3 relative z-10" />
									<span className="relative z-10">{item.name}</span>
									{isActive && (
										<div className="ml-auto w-2 h-2 bg-white rounded-full relative z-10"></div>
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
