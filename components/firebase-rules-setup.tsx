"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Copy, ExternalLink, AlertTriangle, CheckCircle } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface FirebaseRulesSetupProps {
  className?: string
}

export function FirebaseRulesSetup({ className }: FirebaseRulesSetupProps) {
  const [loading, setLoading] = useState(false)
  const [rules, setRules] = useState<any>(null)
  const { toast } = useToast()

  const fetchRules = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/firebase-rules')
      const data = await response.json()
      setRules(data.rules)
      
      toast({
        title: "Rules Loaded",
        description: "Firebase rules berhasil dimuat",
      })
    } catch (error) {
      console.error("Error fetching rules:", error)
      toast({
        title: "Error",
        description: "Gagal memuat Firebase rules",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  const copyRules = () => {
    if (rules) {
      navigator.clipboard.writeText(JSON.stringify(rules, null, 2))
      toast({
        title: "Copied",
        description: "Firebase rules disalin ke clipboard",
      })
    }
  }

  const openFirebaseConsole = () => {
    window.open('https://console.firebase.google.com/project/barcodescanesp32/database/barcodescanesp32-default-rtdb/rules', '_blank')
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-orange-500" />
          Firebase Database Rules Setup
        </CardTitle>
        <CardDescription>
          Konfigurasi rules Firebase untuk mengizinkan akses ke data attendance
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Error "permission_denied" terjadi karena Firebase Database Rules belum dikonfigurasi untuk path '/attendance'. 
            Ikuti langkah-langkah di bawah untuk memperbaiki.
          </AlertDescription>
        </Alert>

        <div className="space-y-3">
          <h4 className="font-medium flex items-center gap-2">
            <Badge variant="outline" className="text-xs">1</Badge>
            Load Firebase Rules
          </h4>
          <Button onClick={fetchRules} disabled={loading} className="w-full">
            {loading ? "Loading..." : "Load Firebase Rules"}
          </Button>
        </div>

        {rules && (
          <>
            <div className="space-y-3">
              <h4 className="font-medium flex items-center gap-2">
                <Badge variant="outline" className="text-xs">2</Badge>
                Copy Rules ke Clipboard
              </h4>
              <Button onClick={copyRules} variant="outline" className="w-full">
                <Copy className="h-4 w-4 mr-2" />
                Copy Firebase Rules
              </Button>
            </div>

            <div className="space-y-3">
              <h4 className="font-medium flex items-center gap-2">
                <Badge variant="outline" className="text-xs">3</Badge>
                Buka Firebase Console
              </h4>
              <Button onClick={openFirebaseConsole} variant="outline" className="w-full">
                <ExternalLink className="h-4 w-4 mr-2" />
                Open Firebase Console
              </Button>
            </div>

            <div className="bg-gray-50 p-4 rounded-lg">
              <h5 className="font-medium mb-2">Manual Steps:</h5>
              <ol className="text-sm space-y-1 list-decimal list-inside">
                <li>Click "Open Firebase Console" button above</li>
                <li>Go to Database → Rules tab</li>
                <li>Replace existing rules with copied rules</li>
                <li>Click "Publish" button</li>
                <li>Wait 2-3 minutes for rules to propagate</li>
                <li>Refresh this page and try again</li>
              </ol>
            </div>

            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                Setelah rules diupdate, sistem absensi akan dapat mengakses Firebase database.
                Rules memberikan full read/write access untuk development.
              </AlertDescription>
            </Alert>

            <div className="bg-blue-50 p-4 rounded-lg">
              <h5 className="font-medium text-blue-900 mb-2">Preview Rules:</h5>
              <pre className="text-xs bg-white p-2 rounded border overflow-x-auto">
                {JSON.stringify(rules, null, 2)}
              </pre>
            </div>
          </>
        )}

        <div className="bg-yellow-50 p-4 rounded-lg">
          <h5 className="font-medium text-yellow-900 mb-2">Production Note:</h5>
          <p className="text-sm text-yellow-800">
            Rules di atas memberikan full access untuk development. 
            Untuk production, sebaiknya implementasikan authentication-based rules 
            yang lebih secure.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
