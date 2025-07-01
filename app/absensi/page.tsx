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
  FileText,
  Smartphone
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { useFirebaseAttendance, useFirebaseDevices } from "@/hooks/use-firebase"
import { FirebasePermissionError } from "@/components/firebase-permission-error"
import { useRealtimeAttendance } from "@/hooks/use-realtime-attendance"

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
  const { devices, loading: devicesLoading, error: devicesError } = useFirebaseDevices()
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

  // Unified device status check
  const hasOnlineDevices = useMemo(() => {
    return devices.some(device => {
      if (device.status === "online") {
        return true
      }
      
      const lastSeen = device.lastSeen
      let lastSeenMs = 0
      if (typeof lastSeen === "string") {
        const parsedNumber = parseInt(lastSeen, 10)
        lastSeenMs = !isNaN(parsedNumber) ? (parsedNumber > 1000000000000 ? parsedNumber : parsedNumber * 1000) : new Date(lastSeen).getTime()
      } else if (typeof lastSeen === "number") {
        lastSeenMs = lastSeen > 1000000000000 ? lastSeen : lastSeen * 1000
      }
      const timeDiff = Date.now() - lastSeenMs
      return lastSeenMs > 0 && timeDiff < 15000 // 15 seconds threshold
    })
  }, [devices])

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
      if (processingNims.has(manualNim)) {
        toast({
          title: "⚠️ Sedang Diproses",
          description: `NIM ${manualNim} sedang diproses, harap tunggu`,
          variant: "destructive"
        })
        return
      }
      
      setProcessingNims(prev => new Set(prev.add(manualNim)))
      
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
      console.error("Error adding attendance:", error)
      toast({
        title: "Error",
        description: "Gagal menambah kehadiran",
        variant: "destructive"
      })
    } finally {
      setTimeout(() => {
        setProcessingNims(prev => {
          const newSet = new Set(prev)
          newSet.delete(manualNim)
          return newSet
        })
      }, DEBOUNCE_DELAY)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen gradient-surface p-4 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Memuat data kehadiran...</p>
        </div>
      </div>
    )
  }

  if (error) {
    if (typeof error === 'string' && error.includes('permission_denied')) {
      return <FirebasePermissionError error={error} onRetry={() => window.location.reload()} />
    }
    
    return (
      <div className="min-h-screen gradient-surface p-4 flex items-center justify-center">
        <div className="text-center text-destructive">
          <p>Gagal memuat data: {error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen gradient-surface mobile-container-full">
      <div className="mobile-space-y">
        {/* Enhanced Header - More responsive */}
        <div className="mobile-margin text-center md:text-left animate-fade-in-up">
          <div className="flex items-center justify-center md:justify-start mobile-gap">
            <div className="relative">
              <div className="absolute -inset-1 gradient-accent rounded-full blur opacity-30 animate-pulse"></div>
              <div className="relative w-10 h-10 sm:w-12 sm:h-12 md:w-16 md:h-16 gradient-accent rounded-full flex items-center justify-center shadow-colored">
                <UserCheck className="w-4 h-4 sm:w-6 sm:h-6 md:w-8 md:h-8 text-white animate-float" />
              </div>
            </div>
            <div className="ml-3 sm:ml-4">
              <h1 className="mobile-title-lg md:text-5xl lg:text-6xl gradient-text tracking-tight">
                Sistem Absensi
              </h1>
              <p className="mobile-text lg:text-lg text-muted-foreground font-medium mt-1 sm:mt-2">
                Kelola kehadiran dengan teknologi barcode scanner
              </p>
            </div>
          </div>
          <div className="flex items-center justify-center md:justify-start mobile-space-x mt-4 sm:mt-6">
            <div className="h-1 w-12 sm:w-16 gradient-accent rounded-full animate-pulse"></div>
            <div className="h-1 w-6 sm:w-8 gradient-primary rounded-full animate-pulse animation-delay-200"></div>
            <div className="h-1 w-3 sm:w-4 gradient-secondary rounded-full animate-pulse animation-delay-400"></div>
          </div>
        </div>

        {/* Enhanced Stats Cards - Better mobile grid */}
        <div className="mobile-grid-stats mobile-gap mobile-margin animate-fade-in-up animation-delay-400">
          <Card className="glass-card card-hover shadow-medium hover:shadow-colored transition-all duration-500 group">
            <div className="absolute inset-0 gradient-accent opacity-5 rounded-xl"></div>
            <CardHeader className="relative z-10 pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-muted-foreground">Total Kehadiran</CardTitle>
                <div className="p-2 gradient-accent rounded-lg shadow-sm">
                  <UserCheck className="h-4 w-4 text-white" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="relative z-10 pt-0">
              <div className="space-y-2">
                <div className="text-2xl sm:text-3xl font-bold gradient-text">{stats.unique}</div>
                <p className="text-xs text-muted-foreground font-medium">Peserta unik hadir</p>
                <div className="w-full bg-muted/50 rounded-full h-1">
                  <div className="gradient-accent h-1 rounded-full w-4/5 animate-pulse"></div>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="glass-card card-hover shadow-medium hover:shadow-colored transition-all duration-500 group">
            <div className="absolute inset-0 gradient-primary opacity-5 rounded-xl"></div>
            <CardHeader className="relative z-10 pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-muted-foreground">Total Scan</CardTitle>
                <div className="p-2 gradient-primary rounded-lg shadow-sm">
                  <History className="h-4 w-4 text-white" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="relative z-10 pt-0">
              <div className="space-y-2">
                <div className="text-2xl sm:text-3xl font-bold gradient-text">{stats.total}</div>
                <p className="text-xs text-muted-foreground font-medium">Total scan hari ini</p>
                <div className="w-full bg-muted/50 rounded-full h-1">
                  <div className="gradient-primary h-1 rounded-full w-full animate-pulse"></div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card card-hover shadow-medium hover:shadow-colored transition-all duration-500 group">
            <div className="absolute inset-0 gradient-secondary opacity-5 rounded-xl"></div>
            <CardHeader className="relative z-10 pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-muted-foreground">ESP32 Scan</CardTitle>
                <div className="p-2 gradient-secondary rounded-lg shadow-sm">
                  <Smartphone className="h-4 w-4 text-white" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="relative z-10 pt-0">
              <div className="space-y-2">
                <div className="text-2xl sm:text-3xl font-bold gradient-text">{processCount}</div>
                <p className="text-xs text-muted-foreground font-medium">Via ESP32 scanner</p>
                <div className="w-full bg-muted/50 rounded-full h-1">
                  <div className="gradient-secondary h-1 rounded-full w-3/4 animate-pulse"></div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card card-hover shadow-medium hover:shadow-colored transition-all duration-500 group">
            <div className="absolute inset-0 bg-orange-500 opacity-5 rounded-xl"></div>
            <CardHeader className="relative z-10 pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-muted-foreground">Status Device</CardTitle>
                <div className="p-2 bg-orange-500 rounded-lg shadow-sm">
                  <Users className="h-4 w-4 text-white" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="relative z-10 pt-0">
              <div className="space-y-2">
                <div className={`text-lg sm:text-xl font-bold ${hasOnlineDevices ? 'text-emerald-600' : 'text-red-600'}`}>
                  {hasOnlineDevices ? 'Online' : 'Offline'}
                </div>
                <p className="text-xs text-muted-foreground font-medium">
                  {hasOnlineDevices ? 'Scanner tersedia' : 'Tidak tersedia'}
                </p>
                <div className="w-full bg-muted/50 rounded-full h-1">
                  <div className={`h-1 rounded-full ${hasOnlineDevices ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'} transition-all duration-300`} 
                       style={{ width: hasOnlineDevices ? '100%' : '30%' }}></div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Manual Entry Card */}
        <Card className="glass-card shadow-large hover:shadow-extra-large transition-all duration-500 mb-8 animate-fade-in-up animation-delay-600">
          <CardHeader>
            <CardTitle className="text-xl font-bold gradient-text">Input Manual Kehadiran</CardTitle>
            <CardDescription className="text-muted-foreground font-medium">
              Tambahkan kehadiran secara manual jika ESP32 scanner tidak tersedia
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground">NIM</label>
                <Input
                  value={manualNim}
                  onChange={(e) => setManualNim(e.target.value)}
                  placeholder="Masukkan NIM"
                  className="glass-card border-0 focus:shadow-medium transition-all"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground">Nama (Opsional)</label>
                <Input
                  value={manualNama}
                  onChange={(e) => setManualNama(e.target.value)}
                  placeholder="Masukkan nama"
                  className="glass-card border-0 focus:shadow-medium transition-all"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground">Aksi</label>
                <Button 
                  onClick={handleManualEntry}
                  className="w-full btn-modern gradient-accent text-white shadow-colored hover:shadow-extra-large font-semibold"
                  disabled={!manualNim || processingNims.has(manualNim)}
                >
                  {processingNims.has(manualNim) ? '⏳ Memproses...' : '✅ Tambah Kehadiran'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Attendance List */}
        <Card className="glass-card shadow-large hover:shadow-extra-large transition-all duration-500 animate-fade-in-up animation-delay-800">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <CardTitle className="text-2xl font-bold gradient-text">Daftar Kehadiran Hari Ini</CardTitle>
                <CardDescription className="text-muted-foreground font-medium mt-2">
                  {currentDate} - Total: {stats.unique} peserta unik dari {stats.total} scan
                </CardDescription>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" className="glass-card hover:shadow-medium btn-modern font-semibold">
                  <Download className="mr-2 h-4 w-4" />
                  Export
                </Button>
              </div>
            </div>
            
            <div className="mt-6 relative">
              <Search className="absolute left-4 top-4 h-5 w-5 text-muted-foreground" />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Cari berdasarkan NIM atau nama..."
                className="pl-12 h-12 glass-card border-0 shadow-medium focus:shadow-large transition-all duration-300 font-medium"
              />
            </div>
          </CardHeader>
          
          <CardContent>
            {filteredAttendance.length === 0 ? (
              <div className="text-center py-16 sm:py-20">
                <div className="relative mx-auto mb-6">
                  <div className="absolute -inset-1 gradient-accent rounded-full blur opacity-20"></div>
                  <div className="relative w-20 h-20 mx-auto glass-card rounded-full flex items-center justify-center shadow-large">
                    <UserCheck className="h-10 w-10 text-muted-foreground" />
                  </div>
                </div>
                <h3 className="text-xl font-bold text-foreground mb-3">
                  {searchTerm ? 'Tidak ada hasil pencarian' : 'Belum ada kehadiran hari ini'}
                </h3>
                <p className="text-muted-foreground mb-2 font-medium">
                  {searchTerm 
                    ? `Tidak ditemukan kehadiran dengan kata kunci "${searchTerm}"`
                    : 'Kehadiran peserta akan muncul di sini setelah scan QR code atau input manual'
                  }
                </p>
                {!searchTerm && (
                  <p className="text-sm text-muted-foreground/70">
                    Gunakan ESP32 scanner atau form input manual di atas
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {filteredAttendance.map((record) => (
                  <Card key={record.id} className="glass-card hover:shadow-medium transition-all duration-300">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4">
                          <div className="w-12 h-12 gradient-accent rounded-full flex items-center justify-center">
                            <UserCheck className="w-6 h-6 text-white" />
                          </div>
                          <div>
                            <h4 className="font-bold text-foreground">{record.nama || record.nim}</h4>
                            <p className="text-sm text-muted-foreground font-medium">
                              NIM: {record.nim}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-foreground">
                            {new Date(record.timestamp).toLocaleTimeString('id-ID')}
                          </p>
                          <Badge className={`mt-1 ${record.deviceId?.includes('ESP32') ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                            {record.deviceId?.includes('ESP32') ? '📱 ESP32' : '✋ Manual'}
                          </Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
