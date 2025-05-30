"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Database, CheckCircle, AlertCircle, Settings, Copy, ExternalLink } from "lucide-react"
import { toast } from "@/hooks/use-toast"

export default function FirebaseSetup() {
  const [testing, setTesting] = useState(false)
  const [initializing, setInitializing] = useState(false)
  const [testResult, setTestResult] = useState<any>(null)

  const testFirebaseConnection = async () => {
    setTesting(true)
    setTestResult(null)

    try {
      const response = await fetch("/api/firebase-test")
      const result = await response.json()
      setTestResult(result)

      if (result.success) {
        toast({
          title: "Tes Firebase Berhasil",
          description: "Koneksi ke Firebase Realtime Database berfungsi",
        })
      } else {
        let description = result.error
        if (result.error.includes("belum diaktifkan")) {
          description = "Silakan aktifkan Realtime Database di konsol Firebase terlebih dahulu"
        } else if (result.error.includes("Permission denied")) {
          description = "Periksa aturan keamanan Firebase - pastikan read/write diizinkan"
        }

        toast({
          title: "Tes Firebase Gagal",
          description,
          variant: "destructive",
        })
      }
    } catch (error) {
      const errorResult = {
        success: false,
        error: "Kesalahan jaringan atau server tidak tersedia",
      }
      setTestResult(errorResult)

      toast({
        title: "Tes Gagal",
        description: "Tidak dapat terhubung ke endpoint tes",
        variant: "destructive",
      })
    } finally {
      setTesting(false)
    }
  }

  const initializeFirebase = async () => {
    setInitializing(true)

    try {
      const response = await fetch("/api/firebase-init", {
        method: "POST",
      })
      const result = await response.json()

      if (result.success) {
        toast({
          title: "Firebase Diinisialisasi",
          description: result.alreadyInitialized
            ? "Database sudah diinisialisasi"
            : "Data sampel telah ditambahkan ke Firebase",
        })
      } else {
        toast({
          title: "Inisialisasi Gagal",
          description: result.error,
          variant: "destructive",
        })
      }
    } catch (error) {
      toast({
        title: "Inisialisasi Gagal",
        description: "Tidak dapat menginisialisasi database Firebase",
        variant: "destructive",
      })
    } finally {
      setInitializing(false)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast({
      title: "Disalin",
      description: "Konfigurasi disalin ke clipboard",
    })
  }

  const esp32Config = `// ESP32 Firebase Configuration
const char* firebaseUrl = "https://barcodescanesp32-default-rtdb.asia-southeast1.firebasedatabase.app";

// Update your ESP32 deviceConfig:
strncpy(deviceConfig.firebaseUrl, firebaseUrl, sizeof(deviceConfig.firebaseUrl) - 1);

// Complete ESP32 setup:
void setup() {
  // ... existing setup code ...
  
  // Set Firebase URL
  strcpy(deviceConfig.firebaseUrl, "https://barcodescanesp32-default-rtdb.asia-southeast1.firebasedatabase.app");
  strcpy(deviceConfig.serverUrl, "https://your-vercel-app.vercel.app"); // Ganti dengan URL aplikasi Vercel Anda
  
  saveDeviceConfig();
}`

  const firebaseRules = `{
  "rules": {
    "inventory": {
      ".read": true,
      ".write": true
    },
    "scans": {
      ".read": true,
      ".write": true
    },
    "devices": {
      ".read": true,
      ".write": true
    },
    "settings": {
      ".read": true,
      ".write": true
    },
    "analytics": {
      ".read": true,
      ".write": true
    }
  }
}`

  return (
    <div className="space-y-6">
      <Alert className="border-red-500 bg-red-50 mb-4">
        <AlertCircle className="h-4 w-4 text-red-600" />
        <AlertDescription>
          <strong>Troubleshooting:</strong> Jika Anda mendapat error "Unexpected token", pastikan:
          <ul className="list-disc list-inside mt-2 space-y-1">
            <li>Realtime Database sudah diaktifkan di konsol Firebase</li>
            <li>URL database benar: https://barcodescanesp32-default-rtdb.asia-southeast1.firebasedatabase.app</li>
            <li>Aturan keamanan mengizinkan akses read/write</li>
          </ul>
        </AlertDescription>
      </Alert>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="w-5 h-5" />
            Proyek Firebase: barcodescanesp32
          </CardTitle>
          <CardDescription>Uji koneksi Firebase Anda dan inisialisasi database</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="w-5 h-5 text-blue-600" />
              <span className="font-medium text-blue-800">Proyek Firebase Dikonfigurasi</span>
            </div>
            <div className="text-sm text-blue-700 space-y-1">
              <p>
                <strong>ID Proyek:</strong> barcodescanesp32
              </p>
              <p>
                <strong>URL Database:</strong>{" "}
                https://barcodescanesp32-default-rtdb.asia-southeast1.firebasedatabase.app
              </p>
              <p>
                <strong>Wilayah:</strong> Asia Tenggara 1 (Singapura)
              </p>
            </div>
          </div>

          <div className="flex gap-4">
            <Button onClick={testFirebaseConnection} disabled={testing} variant="outline">
              <Database className="w-4 h-4 mr-2" />
              {testing ? "Menguji..." : "Uji Koneksi"}
            </Button>

            <Button onClick={initializeFirebase} disabled={initializing} variant="default">
              <Settings className="w-4 h-4 mr-2" />
              {initializing ? "Menginisialisasi..." : "Inisialisasi Database"}
            </Button>

            <Button variant="outline" asChild>
              <a
                href="https://console.firebase.google.com/project/barcodescanesp32/database/barcodescanesp32-default-rtdb/data"
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                Buka Konsol Firebase
              </a>
            </Button>
          </div>

          {testResult && (
            <Alert className={testResult.success ? "border-green-500 bg-green-50" : "border-red-500 bg-red-50"}>
              {testResult.success ? (
                <CheckCircle className="h-4 w-4 text-green-600" />
              ) : (
                <AlertCircle className="h-4 w-4 text-red-600" />
              )}
              <AlertDescription>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge variant={testResult.success ? "default" : "destructive"}>
                      {testResult.success ? "Terhubung" : "Gagal"}
                    </Badge>
                    <span className="text-sm">{testResult.message}</span>
                  </div>

                  {testResult.success && (
                    <div className="text-xs space-y-1">
                      <p>
                        <strong>URL Firebase:</strong> {testResult.firebaseUrl}
                      </p>
                      <p>
                        <strong>Data Ada:</strong> {testResult.dataExists ? "Ya" : "Tidak"}
                      </p>
                      <p>
                        <strong>Timestamp:</strong> {new Date(testResult.timestamp).toLocaleString()}
                      </p>
                    </div>
                  )}

                  {!testResult.success && (
                    <div className="text-xs text-red-600">
                      <p>
                        <strong>Error:</strong> {testResult.error}
                      </p>
                    </div>
                  )}
                </div>
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Konfigurasi ESP32</CardTitle>
          <CardDescription>Salin konfigurasi ini untuk firmware ESP32 Anda</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Konfigurasi Firebase ESP32</Label>
              <Button variant="outline" size="sm" onClick={() => copyToClipboard(esp32Config)}>
                <Copy className="w-4 h-4 mr-2" />
                Salin
              </Button>
            </div>
            <Textarea value={esp32Config} readOnly className="font-mono text-sm" rows={15} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Aturan Database Firebase</CardTitle>
          <CardDescription>Atur aturan ini di Konsol Firebase Anda untuk pengembangan</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert className="border-yellow-500 bg-yellow-50">
            <AlertCircle className="h-4 w-4 text-yellow-600" />
            <AlertDescription>
              <strong>Penting:</strong> Aturan ini mengizinkan akses baca/tulis publik untuk pengembangan. Perbarui ke
              aturan yang lebih ketat untuk penggunaan produksi.
            </AlertDescription>
          </Alert>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Aturan Database (Pengembangan)</Label>
              <Button variant="outline" size="sm" onClick={() => copyToClipboard(firebaseRules)}>
                <Copy className="w-4 h-4 mr-2" />
                Salin Aturan
              </Button>
            </div>
            <Textarea value={firebaseRules} readOnly className="font-mono text-sm" rows={15} />
          </div>

          <div className="text-sm text-gray-600">
            <p>
              <strong>Untuk menerapkan aturan ini:</strong>
            </p>
            <ol className="list-decimal list-inside space-y-1 mt-2">
              <li>
                Buka{" "}
                <a
                  href="https://console.firebase.google.com/project/barcodescanesp32/database/barcodescanesp32-default-rtdb/rules"
                  className="text-blue-600 underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Aturan Database Firebase
                </a>
              </li>
              <li>Ganti aturan yang ada dengan aturan di atas</li>
              <li>Klik "Publikasikan" untuk menyimpan perubahan</li>
            </ol>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Daftar Periksa Pengaturan</CardTitle>
          <CardDescription>Selesaikan langkah-langkah ini untuk menyelesaikan pengaturan Firebase Anda</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <Badge variant="default" className="mt-1">
                ✅
              </Badge>
              <div>
                <p className="font-medium">Proyek Firebase Dibuat</p>
                <p className="text-sm text-gray-600">Proyek "barcodescanesp32" siap</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Badge variant="outline" className="mt-1">
                2
              </Badge>
              <div>
                <p className="font-medium">Aktifkan Realtime Database</p>
                <p className="text-sm text-gray-600">
                  Buka{" "}
                  <a
                    href="https://console.firebase.google.com/project/barcodescanesp32/database"
                    className="text-blue-600 underline"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    bagian Database
                  </a>{" "}
                  dan buat Realtime Database
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Badge variant="outline" className="mt-1">
                3
              </Badge>
              <div>
                <p className="font-medium">Atur Aturan Database</p>
                <p className="text-sm text-gray-600">Salin dan terapkan aturan database yang ditampilkan di atas</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Badge variant="outline" className="mt-1">
                4
              </Badge>
              <div>
                <p className="font-medium">Uji Koneksi</p>
                <p className="text-sm text-gray-600">Klik "Uji Koneksi" di atas untuk memverifikasi pengaturan</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Badge variant="outline" className="mt-1">
                5
              </Badge>
              <div>
                <p className="font-medium">Inisialisasi Database</p>
                <p className="text-sm text-gray-600">Klik "Inisialisasi Database" untuk menambahkan data sampel</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Badge variant="outline" className="mt-1">
                6
              </Badge>
              <div>
                <p className="font-medium">Perbarui Firmware ESP32</p>
                <p className="text-sm text-gray-600">Gunakan kode konfigurasi ESP32 di atas dalam firmware Anda</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
