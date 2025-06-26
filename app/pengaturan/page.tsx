"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Settings, Wifi, Database, Shield, Download, Upload, Trash2, RefreshCw, WifiOff } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { useFirebaseDevices } from "@/hooks/use-firebase" 
import { ref, get, set } from "firebase/database"
import { database } from "@/lib/firebase"
import { AttendanceQRGenerator } from "@/components/attendance-qr-generator"
import { FirebaseRulesSetup } from "@/components/firebase-rules-setup"

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
    backupFrequency: "daily",
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
          description: "Database terhubung dengan baik",
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
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Pengaturan Sistem</h1>
          <p className="text-gray-600 mt-2">Konfigurasi aplikasi dan perangkat</p>
        </div>

        <Tabs defaultValue="general" className="space-y-6">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="general">Umum</TabsTrigger>
            <TabsTrigger value="system">Sistem</TabsTrigger>
            <TabsTrigger value="devices">Perangkat</TabsTrigger>
            <TabsTrigger value="qr-generator">QR Tiket</TabsTrigger>
            <TabsTrigger value="security">Keamanan</TabsTrigger>
            <TabsTrigger value="backup">Backup</TabsTrigger>
          </TabsList>

          <TabsContent value="general">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="w-5 h-5" />
                  Pengaturan Umum
                </CardTitle>
                <CardDescription>Konfigurasi informasi perusahaan dan pengaturan dasar</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="companyName">Nama Perusahaan</Label>
                    <Input
                      id="companyName"
                      value={settings.companyName}
                      onChange={(e) => setSettings({ ...settings, companyName: e.target.value })}
                      placeholder="Masukkan nama perusahaan"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="companyPhone">Nomor Telepon</Label>
                    <Input
                      id="companyPhone"
                      value={settings.companyPhone}
                      onChange={(e) => setSettings({ ...settings, companyPhone: e.target.value })}
                      placeholder="Masukkan nomor telepon"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="companyEmail">Email</Label>
                    <Input
                      id="companyEmail"
                      type="email"
                      value={settings.companyEmail}
                      onChange={(e) => setSettings({ ...settings, companyEmail: e.target.value })}
                      placeholder="Masukkan email perusahaan"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lowStockThreshold">Batas Stok Rendah</Label>
                    <Input
                      id="lowStockThreshold"
                      type="number"
                      value={settings.lowStockThreshold}
                      onChange={(e) => setSettings({ ...settings, lowStockThreshold: e.target.value })}
                      placeholder="5"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="companyAddress">Alamat Perusahaan</Label>
                  <Textarea
                    id="companyAddress"
                    value={settings.companyAddress}
                    onChange={(e) => setSettings({ ...settings, companyAddress: e.target.value })}
                    placeholder="Masukkan alamat lengkap perusahaan"
                    rows={3}
                  />
                </div>
                <Button onClick={handleSaveSettings} disabled={saveLoading}>
                  {saveLoading ? "Menyimpan..." : "Simpan Pengaturan"}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="system">
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Database className="w-5 h-5" />
                    Pengaturan Sistem
                  </CardTitle>
                  <CardDescription>Konfigurasi sistem dan notifikasi</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Backup Otomatis</Label>
                        <p className="text-sm text-gray-500">Backup data secara otomatis</p>
                      </div>
                      <Switch
                        checked={settings.autoBackup}
                        onCheckedChange={(checked) => setSettings({ ...settings, autoBackup: checked })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="backupFrequency">Frekuensi Backup</Label>
                      <Select
                        value={settings.backupFrequency}
                        onValueChange={(value) => setSettings({ ...settings, backupFrequency: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="hourly">Setiap Jam</SelectItem>
                          <SelectItem value="daily">Harian</SelectItem>
                          <SelectItem value="weekly">Mingguan</SelectItem>
                          <SelectItem value="monthly">Bulanan</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Notifikasi</Label>
                        <p className="text-sm text-gray-500">Tampilkan notifikasi sistem</p>
                      </div>
                      <Switch
                        checked={settings.notifications}
                        onCheckedChange={(checked) => setSettings({ ...settings, notifications: checked })}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Email Notifikasi</Label>
                        <p className="text-sm text-gray-500">Kirim notifikasi via email</p>
                      </div>
                      <Switch
                        checked={settings.emailNotifications}
                        onCheckedChange={(checked) => setSettings({ ...settings, emailNotifications: checked })}
                      />
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <Button onClick={handleSaveSettings} disabled={saveLoading}>
                      {saveLoading ? "Menyimpan..." : "Simpan Pengaturan"}
                    </Button>
                    <Button variant="outline" onClick={handleTestConnection}>
                      <Database className="w-4 h-4 mr-2" />
                      Test Koneksi
                    </Button>
                  </div>
                </CardContent>
              </Card>
              
              <FirebaseRulesSetup />
            </div>
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
                      <WifiOff className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                      <p className="text-red-500">Error memuat data perangkat</p>
                      <p className="text-sm text-gray-500 mt-2">{devicesError}</p>
                    </div>
                  ) : !devices || devices.length === 0 ? (
                    <div className="text-center py-8">
                      <WifiOff className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                      <p className="text-gray-500">Tidak ada perangkat ESP32 yang terdaftar</p>
                      <p className="text-sm text-gray-400 mt-2">
                        Perangkat akan muncul secara otomatis saat mengirim heartbeat pertama
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {devices.map((device, index) => (
                        <div key={device.deviceId || index} className="flex items-center justify-between p-4 border rounded-lg">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                              <Wifi className="w-6 h-6 text-blue-600" />
                            </div>
                            <div>
                              <h3 className="font-medium">{device.deviceId || `ESP32-${index + 1}`}</h3>
                              <p className="text-sm text-gray-500">IP: {device.ipAddress || "Tidak tersedia"}</p>
                              <p className="text-sm text-gray-500">
                                Terakhir aktif: {formatDateTime(device.lastSeen)}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="text-right">
                              {getStatusBadge(device)}
                              <p className="text-sm text-gray-500 mt-1">
                                Uptime: {device.uptime ? `${Math.floor(device.uptime / 3600)}h` : "N/A"}
                              </p>
                              <p className="text-sm text-gray-500">
                                Ver: {(device as any).version || "Unknown"}
                              </p>
                              <p className="text-sm text-gray-500">
                                Heap: {device.freeHeap ? `${Math.floor(device.freeHeap / 1024)}KB` : "N/A"}
                              </p>
                            </div>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              onClick={() => handleRestartDevice(device.deviceId || `Device-${index + 1}`)}
                              disabled={!(device.status === "online" || (device.lastSeen && Date.now() - new Date(device.lastSeen).getTime() < 60 * 1000))}
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

          <TabsContent value="qr-generator">
            <div className="space-y-6">
              <AttendanceQRGenerator />
              
              <Card>
                <CardHeader>
                  <CardTitle>Petunjuk Penggunaan QR Code</CardTitle>
                  <CardDescription>Cara menggunakan QR code untuk absensi seminar</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 text-sm font-medium">1</div>
                      <div>
                        <h4 className="font-medium">Generate QR Code</h4>
                        <p className="text-sm text-gray-600">Masukkan NIM peserta (contoh: 10222005) dan klik "Buat QR Code"</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 text-sm font-medium">2</div>
                      <div>
                        <h4 className="font-medium">Download QR Code</h4>
                        <p className="text-sm text-gray-600">Download QR code dan cetak pada tiket atau kartu peserta</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 text-sm font-medium">3</div>
                      <div>
                        <h4 className="font-medium">Scan untuk Absensi</h4>
                        <p className="text-sm text-gray-600">Peserta scan QR code di halaman absensi untuk mencatat kehadiran</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <h5 className="font-medium text-blue-900 mb-2">Informasi Penting:</h5>
                    <ul className="text-sm text-blue-800 space-y-1">
                      <li>• QR code berisi NIM peserta (contoh: 10222005)</li>
                      <li>• Sistem akan otomatis mencegah duplikasi absensi</li>
                      <li>• Data absensi tersimpan terpisah dari data inventaris</li>
                      <li>• Bisa export data ke format CSV</li>
                    </ul>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="security">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="w-5 h-5" />
                  Pengaturan Keamanan
                </CardTitle>
                <CardDescription>Konfigurasi keamanan dan akses sistem</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="sessionTimeout">Session Timeout (menit)</Label>
                    <Input
                      id="sessionTimeout"
                      type="number"
                      value={settings.sessionTimeout}
                      onChange={(e) => setSettings({ ...settings, sessionTimeout: e.target.value })}
                      placeholder="60"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Wajib Ganti Password</Label>
                      <p className="text-sm text-gray-500">Paksa user ganti password berkala</p>
                    </div>
                    <Switch
                      checked={settings.requirePasswordChange}
                      onCheckedChange={(checked) => setSettings({ ...settings, requirePasswordChange: checked })}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Two-Factor Authentication</Label>
                      <p className="text-sm text-gray-500">Aktifkan 2FA untuk keamanan extra</p>
                    </div>
                    <Switch
                      checked={settings.twoFactorAuth}
                      onCheckedChange={(checked) => setSettings({ ...settings, twoFactorAuth: checked })}
                    />
                  </div>
                </div>
                <Button onClick={handleSaveSettings} disabled={saveLoading}>
                  {saveLoading ? "Menyimpan..." : "Simpan Pengaturan Keamanan"}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="backup">
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Download className="w-5 h-5" />
                    Backup & Restore
                  </CardTitle>
                  <CardDescription>Kelola backup data dan restore sistem</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Button onClick={handleBackupNow} className="flex items-center gap-2">
                      <Download className="w-4 h-4" />
                      Backup Sekarang
                    </Button>
                    <Button variant="outline" className="flex items-center gap-2">
                      <Upload className="w-4 h-4" />
                      Restore Data
                    </Button>
                    <Button variant="outline" className="flex items-center gap-2">
                      <Download className="w-4 h-4" />
                      Download Backup
                    </Button>
                  </div>

                  <div className="border rounded-lg p-4">
                    <h3 className="font-medium mb-4">Riwayat Backup</h3>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
                        <div>
                          <p className="font-medium">backup_{new Date().toISOString().split('T')[0]}_auto.json</p>
                          <p className="text-sm text-gray-500">{new Date().toLocaleString()} - Auto Backup</p>
                        </div>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm">
                            <Download className="w-4 h-4" />
                          </Button>
                          <Button variant="outline" size="sm">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
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
