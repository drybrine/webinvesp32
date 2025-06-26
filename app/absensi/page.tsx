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
    // Create CSV content since we don't have xlsx library
    const csvContent = [
      ['No', 'NIM', 'Nama', 'Waktu Absen', 'Device ID', 'Acara', 'Lokasi'],
      ...filteredAttendance.map((record, index) => [
        index + 1,
        record.nim,
        record.nama || '-',
        new Date(record.timestamp).toLocaleString('id-ID'),
        record.deviceId || '-',
        record.eventName || 'Seminar Teknologi 2025',
        record.location || 'Auditorium Utama'
      ])
    ].map(row => row.join(',')).join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `Absensi_Seminar_${currentDate}.csv`
    link.click()
    
    toast({
      title: "Export Berhasil",
      description: `Data absensi telah diexport ke CSV`,
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
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-100 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8 text-center md:text-left">
          <h1 className="text-4xl font-bold text-gray-900">🎟️ Absensi Peserta Seminar</h1>
          <p className="text-gray-600">Gunakan ESP32 Scanner atau input manual untuk mencatat kehadiran</p>
          
          {/* ESP32 Status Indicator */}
          <div className="mt-4 flex items-center gap-2 text-sm">
            <div className={`w-2 h-2 rounded-full ${isProcessing ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`}></div>
            <span className={isProcessing ? 'text-green-600 font-medium' : 'text-gray-500'}>
              {isProcessing ? '🔄 ESP32 sedang memproses scan...' : '📡 ESP32 Scanner siap'}
            </span>
            {processCount > 0 && (
              <Badge variant="outline" className="ml-2">
                {processCount} scan ESP32 hari ini
              </Badge>
            )}
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Kehadiran Hari Ini</CardTitle>
              <UserCheck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.unique}</div>
              <p className="text-xs text-muted-foreground">Peserta unik yang hadir</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Scan</CardTitle>
              <History className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
              <p className="text-xs text-muted-foreground">Total semua scan hari ini</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">ESP32 Scanner</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{processCount}</div>
              <p className="text-xs text-muted-foreground">Scan ESP32 hari ini</p>
              {isProcessing && (
                <div className="flex items-center gap-1 mt-1">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  <span className="text-xs text-green-600">Processing...</span>
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Waktu Terakhir</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
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
