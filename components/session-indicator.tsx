"use client"

import { useSession } from "@/hooks/use-session"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Clock, LogOut } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export function SessionIndicator() {
  const { sessionTimeLeft, formatTimeLeft, logout, isAuthenticated } = useSession()

  const minutes = Math.floor(sessionTimeLeft / (1000 * 60))
  const isWarning = minutes <= 5 // Show warning when less than 5 minutes left
  const isCritical = minutes <= 2 // Show critical when less than 2 minutes left

  const getVariant = () => {
    if (isCritical) return "destructive"
    if (isWarning) return "secondary"
    return "outline"
  }

  const getStatusText = () => {
    if (isCritical) return "Sesi akan berakhir!"
    if (isWarning) return "Sesi hampir berakhir"
    return "Sesi aktif"
  }

  // Don't render if no active session or not authenticated
  if (!isAuthenticated || sessionTimeLeft <= 0) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2">
          <Clock className={`h-4 w-4 ${isCritical ? 'text-red-500' : isWarning ? 'text-orange-500' : 'text-green-500'}`} />
          <Badge variant={getVariant()} className="text-xs">
            {formatTimeLeft()}
          </Badge>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex items-center gap-2">
          <Clock className="h-4 w-4" />
          Status Sesi
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="px-2 py-2 text-sm">
          <p className="font-medium">{getStatusText()}</p>
          <p className="text-xs text-gray-500 mt-1">
            Waktu tersisa: {formatTimeLeft()}
          </p>
          {isWarning && (
            <p className="text-xs text-orange-600 mt-1">
              Lakukan aktivitas untuk memperpanjang sesi
            </p>
          )}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem 
          onClick={() => logout()}
          className="text-red-600 focus:text-red-600 focus:bg-red-50"
        >
          <LogOut className="h-4 w-4 mr-2" />
          Logout Sekarang
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
