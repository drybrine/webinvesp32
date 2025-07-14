"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Settings, Wifi, Database, Shield, Download, RefreshCw } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { useFirebaseDevices } from "@/hooks/use-firebase" 
import { ref, get, set } from "firebase/database"
import { database } from "@/lib/firebase"

export default function PengaturanPage() {
  const [settings, setSettings] = useState({
    // General Settings
    companyName: "StokManager",
    companyAddress: "Jl. Contoh No. 123, Jakarta",
    companyPhone: "+62 21 1234567",
    companyEmail: "info@stokmanager.com",

    // System Settings
    lowStockThreshold: "5",
    autoBackup: true,
    notifications: true,
    emailNotifications: true,

    // Scanner Settings
    scannerTimeout: "30",
    autoScanMode: true,
    scannerSound: true,

    // Security Settings
    sessionTimeout: "60",
    requirePasswordChange: false,
    twoFactorAuth: false,
  })
  
  const [loading, setLoading] = useState(true)
  const [saveLoading, setSaveLoading] = useState(false)

  // Real device data from Firebase
  const { devices, loading: devicesLoading, error: devicesError } = useFirebaseDevices()

  const { toast } = useToast()
  
  // Load settings from Firebase on component mount
  useEffect(() => {
    const loadSettings = async () => {
      if (!database) {
        toast({
          title: "Error",
          description: "Koneksi Firebase tidak tersedia",
          variant: "destructive",
        })
        setLoading(false)
        return
      }
      
      try {
        const settingsRef = ref(database, "settings/system")
        const snapshot = await get(settingsRef)
        const settingsData = snapshot.val()
        
        if (settingsData) {
          // Merge with default settings to ensure all fields exist
          setSettings(prev => ({
            ...prev,
            ...settingsData
          }))
          
          toast({
            title: "Pengaturan Dimuat",
            description: "Pengaturan berhasil dimuat dari database"
          })
        }
      } catch (error) {
        console.error("Error loading settings:", error)
        toast({
          title: "Error",
          description: "Gagal memuat pengaturan dari Firebase",
          variant: "destructive",
        })
      } finally {
        setLoading(false)
      }
    }
    
    loadSettings()
  }, [toast])

  const handleSaveSettings = async () => {
    if (!database) {
      toast({
        title: "Error",
        description: "Koneksi Firebase tidak tersedia",
        variant: "destructive",
      })
      return
    }
    
    setSaveLoading(true)
    try {
      const settingsRef = ref(database, "settings/system")
      await set(settingsRef, {
        ...settings,
        lastUpdated: Date.now(),
      })
      
      toast({
        title: "Berhasil",
        description: "Pengaturan berhasil disimpan ke Firebase",
      })
    } catch (error) {
      console.error("Error saving settings:", error)
      toast({
        title: "Error",
        description: "Gagal menyimpan pengaturan ke Firebase",
        variant: "destructive",
      })
    } finally {
      setSaveLoading(false)
    }
  }

  const handleTestConnection = async () => {
    toast({
      title: "Menguji Koneksi",
      description: "Sedang menguji koneksi database...",
    })

    try {
      if (!database) {
        throw new Error("Firebase not initialized")
      }
      
      const testRef = ref(database, ".info/connected")
      const snapshot = await get(testRef)
      
      if (snapshot.val() === true) {
        toast({
          title: "Koneksi Berhasil",
          description: "Koneksi database berhasil diverifikasi",
        })
      } else {
        toast({
          title: "Koneksi Terputus",
          description: "Database tidak terhubung",
          variant: "destructive",
        })
      }
    } catch (error) {
      toast({
        title: "Error Koneksi",
        description: "Gagal menguji koneksi database",
        variant: "destructive",
      })
    }
  }

  const handleBackupNow = async () => {
    if (!database) {
      toast({
        title: "Error",
        description: "Koneksi Firebase tidak tersedia",
        variant: "destructive",
      })
      return
    }
    
    toast({
      title: "Backup Dimulai",
      description: "Proses backup sedang berjalan...",
    })

    try {
      // Create backup entry in Firebase
      const backupRef = ref(database, `backups/${Date.now()}`)
      
      // Get data from multiple locations
      const inventoryRef = ref(database, "inventory")
      const inventorySnapshot = await get(inventoryRef)
      
      const scansRef = ref(database, "scans")
      const scansSnapshot = await get(scansRef)
      
      // Create backup object
      const backupData = {
        timestamp: Date.now(),
        inventory: inventorySnapshot.val() || {},
        scans: scansSnapshot.val() || {},
        settings: settings,
      }
      
      // Save backup
      await set(backupRef, backupData)
      
      toast({
        title: "Backup Selesai",
        description: "Data berhasil di-backup ke Firebase",
      })
    } catch (error) {
      console.error("Backup error:", error)
      toast({
        title: "Backup Gagal",
        description: "Terjadi kesalahan saat backup data",
        variant: "destructive",
      })
    }
  }

  const handleRestartDevice = async (deviceId: string) => {
    if (!database) {
      toast({
        title: "Error",
        description: "Koneksi Firebase tidak tersedia",
        variant: "destructive",
      })
      return
    }
    
    toast({
      title: "Restart Device",
      description: `Mengirim perintah restart ke ${deviceId}...`,
    })
    
    try {
      // Send restart command to device via Firebase
      const commandRef = ref(database, `devices/${deviceId}/commands`)
      await set(commandRef, {
        action: "restart",
        timestamp: Date.now()
      })
      
      toast({
        title: "Perintah Terkirim",
        description: `Perintah restart berhasil dikirim ke ${deviceId}`,
      })
    } catch (error) {
      toast({
        title: "Error",
        description: "Gagal mengirim perintah restart",
        variant: "destructive",
      })
    }
  }

  const formatDateTime = (timestamp: string | number) => {
    if (!timestamp) return "Tidak tersedia"
    const date = typeof timestamp === 'number' ? new Date(timestamp) : new Date(timestamp)
    return date.toLocaleString("id-ID")
  }

  const getStatusBadge = (device: any) => {
    const isOnline = device.lastSeen && Date.now() - new Date(device.lastSeen).getTime() < 60 * 1000
    
    if (isOnline || device.status === "online") {
      return (
        <Badge variant="default" className="bg-green-500">
          Online
        </Badge>
      )
    } else {
      return <Badge variant="secondary">Offline</Badge>
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="mt-4 text-gray-600">Memuat pengaturan...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50/30 mobile-container">
      <div className="max-w-7xl mx-auto mobile-safe-area py-4 sm:py-8">
        {/* Modern Header - Mobile responsive */}
        <div className="mb-4 sm:mb-6 lg:mb-8">
          <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
            <div className="p-2 sm:p-3 rounded-xl bg-gradient-to-r from-purple-500 to-blue-600 text-white shadow-lg flex-shrink-0">
              <Settings className="h-5 w-5 sm:h-6 sm:w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-lg sm:text-2xl lg:text-3xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-transparent mobile-text">
                Pengaturan Sistem
              </h1>
              <p className="text-xs sm:text-sm lg:text-base text-gray-600 mt-1 mobile-text">Konfigurasi aplikasi dan perangkat</p>
            </div>
          </div>
        </div>

        <Tabs defaultValue="general" className="space-y-3 sm:space-y-4 lg:space-y-6">
          {/* Tab Navigation - 3 tabs */}
          <div className="w-full">
            <TabsList className="grid w-full grid-cols-3 bg-white/80 backdrop-blur-sm border border-gray-200/50 shadow-lg rounded-xl p-1 gap-1 h-auto">
              <TabsTrigger value="general" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-500 data-[state=active]:to-blue-600 data-[state=active]:text-white rounded-lg transition-all duration-200 text-xs sm:text-sm px-1 sm:px-2 py-2 min-h-[40px] flex items-center justify-center">
                <span className="truncate">Umum</span>
              </TabsTrigger>
              <TabsTrigger value="devices" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-500 data-[state=active]:to-blue-600 data-[state=active]:text-white rounded-lg transition-all duration-200 text-xs sm:text-sm px-1 sm:px-2 py-2 min-h-[40px] flex items-center justify-center">
                <span className="truncate">Perangkat</span>
              </TabsTrigger>
              <TabsTrigger value="security" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-500 data-[state=active]:to-blue-600 data-[state=active]:text-white rounded-lg transition-all duration-200 text-xs sm:text-sm px-1 sm:px-2 py-2 min-h-[40px] flex items-center justify-center">
                <span className="truncate">Keamanan</span>
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="general">
            <Card className="glass-card border-gray-200/50">
              <CardHeader className="border-b border-gray-100 p-4 sm:p-6">
                <CardTitle className="flex items-center gap-2 sm:gap-3 text-base sm:text-lg font-semibold text-gray-900">
                  <div className="p-1.5 sm:p-2 rounded-lg bg-gradient-to-r from-blue-500 to-indigo-600 flex-shrink-0">
                    <Settings className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                  </div>
                  <span className="truncate">Pengaturan Umum</span>
                </CardTitle>
                <CardDescription className="text-gray-600 text-sm">
                  Konfigurasi informasi perusahaan dan pengaturan dasar
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 sm:space-y-6 p-3 sm:p-4 lg:p-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 lg:gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="companyName" className="text-sm font-medium">Nama Perusahaan</Label>
                    <Input
                      id="companyName"
                      value={settings.companyName}
                      onChange={(e) => setSettings({ ...settings, companyName: e.target.value })}
                      placeholder="Masukkan nama perusahaan"
                      className="text-sm mobile-input"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="companyPhone" className="text-sm font-medium">Nomor Telepon</Label>
                    <Input
                      id="companyPhone"
                      value={settings.companyPhone}
                      onChange={(e) => setSettings({ ...settings, companyPhone: e.target.value })}
                      placeholder="Masukkan nomor telepon"
                      className="text-sm mobile-input"
                      type="tel"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="companyEmail" className="text-sm font-medium">Email</Label>
                    <Input
                      id="companyEmail"
                      type="email"
                      value={settings.companyEmail}
                      onChange={(e) => setSettings({ ...settings, companyEmail: e.target.value })}
                      placeholder="Masukkan email perusahaan"
                      className="text-sm mobile-input"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lowStockThreshold" className="text-sm font-medium">Batas Stok Rendah</Label>
                    <Input
                      id="lowStockThreshold"
                      type="number"
                      value={settings.lowStockThreshold}
                      onChange={(e) => setSettings({ ...settings, lowStockThreshold: e.target.value })}
                      placeholder="5"
                      className="text-sm mobile-input"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="companyAddress" className="text-sm font-medium">Alamat Perusahaan</Label>
                  <Textarea
                    id="companyAddress"
                    value={settings.companyAddress}
                    onChange={(e) => setSettings({ ...settings, companyAddress: e.target.value })}
                    placeholder="Masukkan alamat lengkap perusahaan"
                    rows={3}
                    className="text-sm mobile-input resize-none"
                  />
                </div>
                <div className="pt-2">
                  <Button onClick={handleSaveSettings} disabled={saveLoading} className="w-full sm:w-auto btn-mobile">
                    {saveLoading ? "Menyimpan..." : "Simpan Pengaturan"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="devices">
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Wifi className="w-5 h-5" />
                    Manajemen Perangkat
                  </CardTitle>
                  <CardDescription>Kelola perangkat ESP32 scanner yang terhubung</CardDescription>
                </CardHeader>
                <CardContent>
                  {devicesLoading ? (
                    <div className="text-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                      <p className="text-gray-500 mt-4">Memuat data perangkat...</p>
                    </div>
                  ) : devicesError ? (
                    <div className="text-center py-8">
                      <Wifi className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                      <p className="text-red-500">Error memuat data perangkat</p>
                      <p className="text-sm text-gray-500 mt-2">{devicesError}</p>
                    </div>
                  ) : !devices || devices.length === 0 ? (
                    <div className="text-center py-8">
                      <Wifi className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                      <p className="text-gray-500">Tidak ada perangkat ESP32 yang terdaftar</p>
                      <p className="text-sm text-gray-400 mt-2">
                        Perangkat akan muncul secara otomatis saat mengirim heartbeat pertama
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {devices.map((device, index) => (
                        <div key={device.deviceId || index} className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 border rounded-lg space-y-3 sm:space-y-0 sm:space-x-4">
                          <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                              <Wifi className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <h3 className="font-medium text-sm sm:text-base truncate">{device.deviceId || `ESP32-${index + 1}`}</h3>
                              <p className="text-xs sm:text-sm text-gray-500 truncate">IP: {device.ipAddress || "Tidak tersedia"}</p>
                              <p className="text-xs sm:text-sm text-gray-500 truncate">
                                Terakhir aktif: {formatDateTime(device.lastSeen)}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-4">
                            <div className="text-left sm:text-right flex-1 sm:flex-none">
                              {getStatusBadge(device)}
                              <div className="grid grid-cols-2 sm:block gap-1 sm:gap-0 mt-1">
                                <p className="text-xs text-gray-500">
                                  Uptime: {(device as any).uptime ? `${Math.floor((device as any).uptime / 3600)}h` : "N/A"}
                                </p>
                                <p className="text-xs text-gray-500">
                                  Ver: {(device as any).version || "Unknown"}
                                </p>
                                <p className="text-xs text-gray-500 col-span-2 sm:col-span-1">
                                  Heap: {device.freeHeap ? `${Math.floor(device.freeHeap / 1024)}KB` : "N/A"}
                                </p>
                              </div>
                            </div>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              onClick={() => handleRestartDevice(device.deviceId || `Device-${index + 1}`)}
                              disabled={!(device.status === "online" || (device.lastSeen && Date.now() - new Date(device.lastSeen).getTime() < 60 * 1000))}
                              className="flex-shrink-0"
                            >
                              <RefreshCw className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Pengaturan Scanner</CardTitle>
                  <CardDescription>Konfigurasi perilaku scanner ESP32</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="scannerTimeout">Timeout Scanner (detik)</Label>
                      <Input
                        id="scannerTimeout"
                        type="number"
                        value={settings.scannerTimeout}
                        onChange={(e) => setSettings({ ...settings, scannerTimeout: e.target.value })}
                        placeholder="30"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Mode Auto Scan</Label>
                        <p className="text-sm text-gray-500">Scan otomatis saat barcode terdeteksi</p>
                      </div>
                      <Switch
                        checked={settings.autoScanMode}
                        onCheckedChange={(checked) => setSettings({ ...settings, autoScanMode: checked })}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Suara Scanner</Label>
                        <p className="text-sm text-gray-500">Bunyi beep saat scan berhasil</p>
                      </div>
                      <Switch
                        checked={settings.scannerSound}
                        onCheckedChange={(checked) => setSettings({ ...settings, scannerSound: checked })}
                      />
                    </div>
                  </div>
                  <Button onClick={handleSaveSettings} disabled={saveLoading}>
                    {saveLoading ? "Menyimpan..." : "Simpan Pengaturan Scanner"}
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="security">
            <div className="space-y-6">
              <Card className="glass-card border-gray-200/50">
                <CardHeader className="border-b border-gray-100 p-4 sm:p-6">
                  <CardTitle className="flex items-center gap-2 sm:gap-3 text-base sm:text-lg font-semibold text-gray-900">
                    <div className="p-1.5 sm:p-2 rounded-lg bg-gradient-to-r from-red-500 to-pink-600 flex-shrink-0">
                      <Shield className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                    </div>
                    <span className="truncate">Pengaturan Keamanan</span>
                  </CardTitle>
                  <CardDescription className="text-gray-600 text-sm">
                    Konfigurasi keamanan sistem dan kontrol akses
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 sm:space-y-6 p-4 sm:p-6">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="sessionTimeout" className="text-sm font-medium">Session Timeout (menit)</Label>
                      <Input
                        id="sessionTimeout"
                        type="number"
                        value={settings.sessionTimeout}
                        onChange={(e) => setSettings({ ...settings, sessionTimeout: e.target.value })}
                        placeholder="60"
                        className="text-sm mobile-input"
                      />
                    </div>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label className="text-sm font-medium">Wajib Ganti Password</Label>
                          <p className="text-xs sm:text-sm text-gray-500">Paksa user ganti password berkala</p>
                        </div>
                        <Switch
                          checked={settings.requirePasswordChange}
                          onCheckedChange={(checked) => setSettings({ ...settings, requirePasswordChange: checked })}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label className="text-sm font-medium">Two-Factor Authentication</Label>
                          <p className="text-xs sm:text-sm text-gray-500">Aktifkan 2FA untuk keamanan extra</p>
                        </div>
                        <Switch
                          checked={settings.twoFactorAuth}
                          onCheckedChange={(checked) => setSettings({ ...settings, twoFactorAuth: checked })}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label className="text-sm font-medium">Notifikasi Keamanan</Label>
                          <p className="text-xs sm:text-sm text-gray-500">Alert untuk aktivitas mencurigakan</p>
                        </div>
                        <Switch
                          checked={settings.notifications}
                          onCheckedChange={(checked) => setSettings({ ...settings, notifications: checked })}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label className="text-sm font-medium">Auto Backup Keamanan</Label>
                          <p className="text-xs sm:text-sm text-gray-500">Backup otomatis data keamanan</p>
                        </div>
                        <Switch
                          checked={settings.autoBackup}
                          onCheckedChange={(checked) => setSettings({ ...settings, autoBackup: checked })}
                        />
                      </div>
                    </div>
                  </div>
                  
                  {/* Security Actions */}
                  <div className="border-t pt-4 sm:pt-6">
                    <h4 className="text-sm font-medium mb-3 text-gray-900">Tindakan Keamanan</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      <Button 
                        variant="outline" 
                        className="flex items-center gap-2 btn-mobile justify-start"
                        onClick={() => {
                          toast({
                            title: "Mengecek Keamanan",
                            description: "Memulai audit keamanan sistem...",
                          })
                        }}
                      >
                        <Shield className="w-4 h-4" />
                        Audit Keamanan
                      </Button>
                      <Button 
                        variant="outline" 
                        className="flex items-center gap-2 btn-mobile justify-start"
                        onClick={() => {
                          toast({
                            title: "Log Keamanan",
                            description: "Membuka log aktivitas keamanan...",
                          })
                        }}
                      >
                        <Database className="w-4 h-4" />
                        Log Aktivitas
                      </Button>
                      <Button 
                        variant="outline" 
                        className="flex items-center gap-2 btn-mobile justify-start"
                        onClick={handleBackupNow}
                      >
                        <Download className="w-4 h-4" />
                        Backup Data
                      </Button>
                    </div>
                  </div>
                  
                  <div className="pt-2">
                    <Button onClick={handleSaveSettings} disabled={saveLoading} className="w-full sm:w-auto btn-mobile">
                      {saveLoading ? "Menyimpan..." : "Simpan Pengaturan Keamanan"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
