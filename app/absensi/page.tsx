"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  History,
  Search,
  Filter,
  Download,
  Calendar,
  Users,
  Clock,
  UserCheck,
  FileText
} from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { useFirebaseAttendance } from "@/hooks/use-firebase"
import { FirebasePermissionError } from "@/components/firebase-permission-error"
import { useRealtimeAttendance } from "@/components/realtime-attendance-provider"

interface AttendanceRecord {
  id: string
  nim: string
  nama?: string
  timestamp: number
  deviceId?: string
  sessionId?: string
  eventName?: string
  location?: string
  scanned: boolean
}

export default function AbsensiPage() {
  const router = useRouter()
  const { attendance, addAttendance, loading, error } = useFirebaseAttendance()
  const { isProcessing, lastProcessedNim, processCount } = useRealtimeAttendance()
  const { toast } = useToast()
  
  const [searchTerm, setSearchTerm] = useState("")
  const [manualNim, setManualNim] = useState("")
  const [manualNama, setManualNama] = useState("")
  const [currentDate] = useState(new Date().toISOString().split('T')[0])
  
  // Duplicate prevention for manual scanning
  const [lastManualNim, setLastManualNim] = useState<string>("")
  const [lastManualTime, setLastManualTime] = useState<number>(0)
  const [processingNims, setProcessingNims] = useState<Set<string>>(new Set())
  const DEBOUNCE_DELAY = 3000 // 3 seconds

  // Filter attendance records for today
  const todayAttendance = useMemo(() => {
    const today = new Date().toDateString()
    return attendance.filter(record => 
      new Date(record.timestamp).toDateString() === today
    )
  }, [attendance])

  // Filter attendance based on search
  const filteredAttendance = useMemo(() => {
    if (!searchTerm) return todayAttendance
    return todayAttendance.filter(record =>
      record.nim.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (record.nama && record.nama.toLowerCase().includes(searchTerm.toLowerCase()))
    )
  }, [todayAttendance, searchTerm])

  // Statistics
  const stats = useMemo(() => {
    const total = todayAttendance.length
    const unique = new Set(todayAttendance.map(r => r.nim)).size
    return { total, unique }
  }, [todayAttendance])

  const handleManualEntry = async () => {
    if (!manualNim) {
      toast({
        title: "Error",
        description: "NIM harus diisi",
        variant: "destructive"
      })
      return
    }

    try {
      // Check if already processing this NIM
      if (processingNims.has(manualNim)) {
        toast({
          title: "⚠️ Sedang Diproses",
          description: `NIM ${manualNim} sedang diproses, harap tunggu`,
          variant: "destructive"
        })
        return
      }
      
      // Mark as processing
      setProcessingNims(prev => new Set(prev.add(manualNim)))
      
      // Check if already scanned today
      const alreadyScanned = todayAttendance.find(record => record.nim === manualNim)
      if (alreadyScanned) {
        toast({
          title: "⚠️ Sudah Absen",
          description: `NIM ${manualNim} sudah melakukan absensi hari ini pada ${new Date(alreadyScanned.timestamp).toLocaleTimeString('id-ID')}`,
          variant: "destructive"
        })
        return
      }

      await addAttendance(manualNim, manualNama, 'manual')
      toast({
        title: "✅ Absensi Berhasil",
        description: `${manualNama ? manualNama : manualNim} berhasil dicatat`,
      })
      setManualNim("")
      setManualNama("")
    } catch (error) {
      console.error("Error adding manual attendance:", error)
      toast({
        title: "❌ Error",
        description: "Gagal menambah absensi",
        variant: "destructive"
      })
    } finally {
      // Remove from processing
      setTimeout(() => {
        setProcessingNims(prev => {
          const newSet = new Set(prev)
          newSet.delete(manualNim)
          return newSet
        })
      }, 1000)
    }
  }

  const exportToExcel = () => {
    // Format date consistently for Indonesian locale
    const formatDateTime = (timestamp: number) => {
      const date = new Date(timestamp)
      const day = date.getDate().toString().padStart(2, '0')
      const month = (date.getMonth() + 1).toString().padStart(2, '0')
      const year = date.getFullYear()
      const hours = date.getHours().toString().padStart(2, '0')
      const minutes = date.getMinutes().toString().padStart(2, '0')
      const seconds = date.getSeconds().toString().padStart(2, '0')
      return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`
    }

    // Helper function to escape CSV fields that contain commas or quotes
    const escapeCSVField = (field: string | number) => {
      const str = String(field)
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`
      }
      return str
    }

    // Create CSV header
    const header = 'No,NIM,Nama,Waktu Absen,Device ID,Acara,Lokasi'
    
    // Create CSV rows with proper formatting
    const rows = filteredAttendance.map((record, index) => {
      const fields = [
        index + 1,
        escapeCSVField(record.nim || '-'),
        escapeCSVField(record.nama || 'Tidak Diketahui'),
        escapeCSVField(formatDateTime(record.timestamp)),
        escapeCSVField(record.deviceId || '-'),
        escapeCSVField(record.eventName || 'Seminar Teknologi 2025'),
        escapeCSVField(record.location || 'Auditorium Utama')
      ]
      return fields.join(',')
    })

    // Combine header and rows
    const csvContent = [header, ...rows].join('\n')

    // Add BOM for proper Excel UTF-8 encoding
    const BOM = '\uFEFF'
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    
    // Format filename with proper date
    const now = new Date()
    const dateStr = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`
    link.download = `Absensi_Seminar_${dateStr}.csv`
    link.click()
    
    toast({
      title: "Export Berhasil",
      description: `Data absensi berhasil diexport ke CSV (${filteredAttendance.length} record)`,
    })
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-4 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Memuat data kehadiran...</p>
        </div>
      </div>
    )
  }

  if (error) {
    // Check if it's a permission error
    if (typeof error === 'string' && error.includes('permission_denied')) {
      return <FirebasePermissionError error={error} onRetry={() => window.location.reload()} />
    }
    
    return (
      <div className="min-h-screen bg-gray-50 p-4 flex items-center justify-center">
        <div className="text-center text-red-600">
          <p>Gagal memuat data: {error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-purple-50 to-blue-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Enhanced Header */}
        <div className="mb-8 text-center md:text-left">
          <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-purple-600 via-blue-600 to-indigo-600 bg-clip-text text-transparent mb-3">
            🎟️ Absensi Peserta Seminar
          </h1>
          <p className="text-lg text-gray-600 font-medium mb-4">Gunakan ESP32 Scanner atau input manual untuk mencatat kehadiran</p>
          <div className="w-32 h-1 bg-gradient-to-r from-purple-500 to-blue-500 mx-auto md:mx-0 rounded-full"></div>
          
          {/* Enhanced ESP32 Status Indicator */}
          <div className="mt-6 flex flex-col sm:flex-row items-center gap-4 bg-white/60 backdrop-blur-sm p-4 rounded-xl border border-white/40 shadow-lg">
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${isProcessing ? 'bg-green-500 animate-pulse shadow-green-300 shadow-lg' : 'bg-gray-400'}`}></div>
              <span className={`text-sm font-semibold ${isProcessing ? 'text-green-700' : 'text-gray-600'}`}>
                {isProcessing ? '🔄 ESP32 sedang memproses scan...' : '📡 ESP32 Scanner siap'}
              </span>
            </div>
            {processCount > 0 && (
              <Badge variant="outline" className="bg-blue-50 border-blue-200 text-blue-700 font-medium">
                📊 {processCount} scan ESP32 hari ini
              </Badge>
            )}
            {lastProcessedNim && (
              <Badge variant="outline" className="bg-green-50 border-green-200 text-green-700 font-medium">
                ✅ Terakhir: {lastProcessedNim}
              </Badge>
            )}
          </div>
        </div>

        {/* Enhanced Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 mb-8">
          <Card className="relative overflow-hidden bg-gradient-to-br from-green-50 to-emerald-100 border-0 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105">
            <div className="absolute top-0 right-0 w-20 h-20 bg-green-200 rounded-full -mr-10 -mt-10 opacity-20"></div>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
              <CardTitle className="text-xs sm:text-sm font-semibold text-green-800">Total Kehadiran</CardTitle>
              <UserCheck className="h-4 w-4 sm:h-5 sm:w-5 text-green-600" />
            </CardHeader>
            <CardContent className="relative z-10">
              <div className="text-xl sm:text-3xl font-bold text-green-900">{stats.unique}</div>
              <p className="text-xs text-green-600 font-medium">Peserta unik hadir</p>
            </CardContent>
          </Card>
          
          <Card className="relative overflow-hidden bg-gradient-to-br from-blue-50 to-blue-100 border-0 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105">
            <div className="absolute top-0 right-0 w-20 h-20 bg-blue-200 rounded-full -mr-10 -mt-10 opacity-20"></div>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
              <CardTitle className="text-xs sm:text-sm font-semibold text-blue-800">Total Scan</CardTitle>
              <History className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600" />
            </CardHeader>
            <CardContent className="relative z-10">
              <div className="text-xl sm:text-3xl font-bold text-blue-900">{stats.total}</div>
              <p className="text-xs text-blue-600 font-medium">Semua scan hari ini</p>
            </CardContent>
          </Card>
          
          <Card className="relative overflow-hidden bg-gradient-to-br from-purple-50 to-purple-100 border-0 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105">
            <div className="absolute top-0 right-0 w-20 h-20 bg-purple-200 rounded-full -mr-10 -mt-10 opacity-20"></div>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
              <CardTitle className="text-xs sm:text-sm font-semibold text-purple-800">ESP32 Scanner</CardTitle>
              <Users className="h-4 w-4 sm:h-5 sm:w-5 text-purple-600" />
            </CardHeader>
            <CardContent className="relative z-10">
              <div className="text-xl sm:text-3xl font-bold text-purple-900">{processCount}</div>
              <p className="text-xs text-purple-600 font-medium">Scan ESP32</p>
              {isProcessing && (
                <div className="flex items-center gap-2 mt-2 bg-white/50 rounded-full px-2 py-1">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  <span className="text-xs text-green-700 font-medium">Processing...</span>
                </div>
              )}
            </CardContent>
          </Card>
          
          <Card className="relative overflow-hidden bg-gradient-to-br from-amber-50 to-amber-100 border-0 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105">
            <div className="absolute top-0 right-0 w-20 h-20 bg-amber-200 rounded-full -mr-10 -mt-10 opacity-20"></div>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
              <CardTitle className="text-xs sm:text-sm font-semibold text-amber-800">Waktu Terakhir</CardTitle>
              <Clock className="h-4 w-4 sm:h-5 sm:w-5 text-amber-600" />
            </CardHeader>
            <CardContent className="relative z-10">
              <div className="text-lg sm:text-2xl font-bold text-amber-900">
                {todayAttendance.length > 0 
                  ? new Date(todayAttendance[0].timestamp).toLocaleTimeString('id-ID', { 
                      hour: '2-digit', 
                      minute: '2-digit' 
                    })
                  : '--:--'
                }
              </div>
              <p className="text-xs text-muted-foreground">Scan terakhir</p>
              {lastProcessedNim && (
                <p className="text-xs text-blue-600 mt-1">ESP32: {lastProcessedNim}</p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-1 gap-6 mb-6">
          {/* Manual Entry */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserCheck className="h-5 w-5" />
                Input Manual
              </CardTitle>
              <CardDescription>Input absensi secara manual jika diperlukan</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium">NIM *</label>
                <Input
                  placeholder="Masukkan NIM"
                  value={manualNim}
                  onChange={(e) => setManualNim(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Nama (Opsional)</label>
                <Input
                  placeholder="Masukkan nama"
                  value={manualNama}
                  onChange={(e) => setManualNama(e.target.value)}
                />
              </div>
              <Button onClick={handleManualEntry} className="w-full">
                Tambah Absensi
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Attendance List */}
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <CardTitle>Daftar Kehadiran</CardTitle>
                <CardDescription>
                  Daftar peserta yang telah melakukan absensi hari ini
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button onClick={exportToExcel} variant="outline" size="sm">
                  <FileText className="h-4 w-4 mr-2" />
                  Export CSV
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Cari berdasarkan NIM atau nama..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="max-w-sm"
                />
              </div>
              
              <div className="rounded-md border">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b bg-gray-50/50">
                        <th className="h-12 px-4 text-left align-middle font-medium">No</th>
                        <th className="h-12 px-4 text-left align-middle font-medium">NIM</th>
                        <th className="h-12 px-4 text-left align-middle font-medium">Nama</th>
                        <th className="h-12 px-4 text-left align-middle font-medium">Waktu Absen</th>
                        <th className="h-12 px-4 text-left align-middle font-medium">Device</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAttendance.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="h-24 text-center text-muted-foreground">
                            Belum ada data kehadiran
                          </td>
                        </tr>
                      ) : (
                        filteredAttendance.map((record, index) => (
                          <tr key={record.id} className="border-b hover:bg-gray-50/50">
                            <td className="h-12 px-4 align-middle">{index + 1}</td>
                            <td className="h-12 px-4 align-middle font-medium">{record.nim}</td>
                            <td className="h-12 px-4 align-middle">{record.nama || '-'}</td>
                            <td className="h-12 px-4 align-middle">
                              {new Date(record.timestamp).toLocaleString('id-ID')}
                            </td>
                            <td className="h-12 px-4 align-middle">
                              <Badge variant="outline">
                                {record.deviceId === 'manual' ? 'Manual' : 
                                 record.deviceId === 'qr-scanner' ? 'QR Scanner' : 
                                 record.deviceId || 'Web'}
                              </Badge>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
