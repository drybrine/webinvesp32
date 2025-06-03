"use client"

import { useState } from "react"
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
import { useFirebaseDevices } from "@/hooks/use-firebase" // Tambahkan import untuk real data

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

  // Hapus mock data dan gunakan real data dari Firebase
  const { devices, loading: devicesLoading, error: devicesError } = useFirebaseDevices()

  const { toast } = useToast()

  const handleSaveSettings = () => {
    // In real app, save to backend
    toast({
      title: "Berhasil",
      description: "Pengaturan berhasil disimpan",
    })
  }

  const handleTestConnection = () => {
    toast({
      title: "Menguji Koneksi",
      description: "Sedang menguji koneksi database...",
    })

    // Simulate test
    setTimeout(() => {
      toast({
        title: "Koneksi Berhasil",
        description: "Database terhubung dengan baik",
      })
    }, 2000)
  }

  const handleBackupNow = () => {
    toast({
      title: "Backup Dimulai",
      description: "Proses backup sedang berjalan...",
    })

    setTimeout(() => {
      toast({
        title: "Backup Selesai",
        description: "Data berhasil di-backup",
      })
    }, 3000)
  }

  const handleRestartDevice = (deviceId: string) => {
    toast({
      title: "Restart Device",
      description: `Mengirim perintah restart ke ${deviceId}...`,
    })
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

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Pengaturan Sistem</h1>
          <p className="text-gray-600 mt-2">Konfigurasi aplikasi dan perangkat</p>
        </div>

        <Tabs defaultValue="general" className="space-y-6">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="general">Umum</TabsTrigger>
            <TabsTrigger value="system">Sistem</TabsTrigger>
            <TabsTrigger value="devices">Perangkat</TabsTrigger>
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
                <Button onClick={handleSaveSettings}>Simpan Pengaturan</Button>
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
                    <Button onClick={handleSaveSettings}>Simpan Pengaturan</Button>
                    <Button variant="outline" onClick={handleTestConnection}>
                      <Database className="w-4 h-4 mr-2" />
                      Test Koneksi
                    </Button>
                  </div>
                </CardContent>
              </Card>
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
                  <Button onClick={handleSaveSettings}>Simpan Pengaturan Scanner</Button>
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
                <Button onClick={handleSaveSettings}>Simpan Pengaturan Keamanan</Button>
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
                          <p className="font-medium">backup_2024-01-20_15-30.sql</p>
                          <p className="text-sm text-gray-500">20 Jan 2024, 15:30 - 2.5 MB</p>
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
                      <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
                        <div>
                          <p className="font-medium">backup_2024-01-19_15-30.sql</p>
                          <p className="text-sm text-gray-500">19 Jan 2024, 15:30 - 2.3 MB</p>
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
                      <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
                        <div>
                          <p className="font-medium">backup_2024-01-18_15-30.sql</p>
                          <p className="text-sm text-gray-500">18 Jan 2024, 15:30 - 2.1 MB</p>
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
