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
		<nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
			<div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
				<div className="flex justify-between h-14 sm:h-16">
					<div className="flex">
						{/* Logo - Responsive sizing */}
						<div className="flex-shrink-0 flex items-center">
							<div className="flex items-center space-x-2">
								<div className="w-6 h-6 sm:w-8 sm:h-8 bg-gray-900 rounded-lg flex items-center justify-center">
									<BarChart3 className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
								</div>
								<span className="text-lg sm:text-xl font-bold text-gray-900 hidden xs:block">
									StokManager
								</span>
								<span className="text-lg font-bold text-gray-900 xs:hidden">
									SM
								</span>
							</div>
						</div>

						{/* Desktop Navigation - Hidden on mobile */}
						<div className="hidden md:ml-8 md:flex md:space-x-4 lg:space-x-8">
							{navigation.map((item) => {
								const Icon = item.icon
								const isActive = pathname === item.href
								return (
									<Link
										key={item.name}
										href={item.href}
										className={cn(
											"inline-flex items-center px-2 lg:px-3 py-2 text-sm font-medium rounded-md transition-colors",
											isActive
												? "bg-gray-900 text-white"
												: "text-gray-700 hover:text-gray-900 hover:bg-gray-100",
										)}
									>
										<Icon className="w-4 h-4 mr-1 lg:mr-2" />
										<span className="hidden lg:block">{item.name}</span>
									</Link>
								)
							})}
						</div>
					</div>

					{/* Mobile menu button */}
					<div className="md:hidden flex items-center">
						<Button
							variant="ghost"
							size="sm"
							onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
							className="p-2"
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

			{/* Mobile Navigation - Improved */}
			{mobileMenuOpen && (
				<div className="md:hidden border-t border-gray-200">
					<div className="px-2 pt-2 pb-3 space-y-1 bg-white">
						{navigation.map((item) => {
							const Icon = item.icon
							const isActive = pathname === item.href
							return (
								<Link
									key={item.name}
									href={item.href}
									className={cn(
										"flex items-center px-3 py-3 text-base font-medium rounded-md transition-colors",
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
