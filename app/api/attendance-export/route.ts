import { NextRequest, NextResponse } from "next/server"

// Simple CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders })
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const format = searchParams.get('format') || 'csv'
    const date = searchParams.get('date') || new Date().toISOString().split('T')[0]

    // Mock data - in real implementation, fetch from Firebase
    const mockAttendanceData = [
      {
        nim: '10222001',
        nama: 'John Doe',
        timestamp: Date.now() - 3600000,
        deviceId: 'qr-scanner',
        eventName: 'Seminar Teknologi 2025',
        location: 'Auditorium Utama'
      },
      {
        nim: '10222002',
        nama: 'Jane Smith',
        timestamp: Date.now() - 7200000,
        deviceId: 'manual',
        eventName: 'Seminar Teknologi 2025',
        location: 'Auditorium Utama'
      }
    ]

    if (format === 'csv') {
      const csvHeader = 'No,NIM,Nama,Waktu Absen,Device ID,Acara,Lokasi\n'
      const csvRows = mockAttendanceData.map((record, index) => 
        [
          index + 1,
          record.nim,
          record.nama || '-',
          new Date(record.timestamp).toLocaleString('id-ID'),
          record.deviceId || '-',
          record.eventName || 'Seminar Teknologi 2025',
          record.location || 'Auditorium Utama'
        ].join(',')
      ).join('\n')

      const csvContent = csvHeader + csvRows

      return new NextResponse(csvContent, {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="attendance_${date}.csv"`
        }
      })
    }

    return NextResponse.json(
      { 
        success: true, 
        data: mockAttendanceData,
        count: mockAttendanceData.length
      },
      { status: 200, headers: corsHeaders }
    )

  } catch (error) {
    console.error("Export API error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: corsHeaders }
    )
  }
}
