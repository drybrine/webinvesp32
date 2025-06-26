import { NextRequest, NextResponse } from "next/server"

// Simple CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
}

// In-memory duplicate prevention (in production, use Redis or database)
const recentAttendance = new Map<string, number>()
const DUPLICATE_TIMEOUT = 15000 // 15 seconds

function cleanupRecentAttendance() {
  const now = Date.now()
  for (const [key, timestamp] of recentAttendance.entries()) {
    if (now - timestamp > DUPLICATE_TIMEOUT) {
      recentAttendance.delete(key)
    }
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { nim, nama, deviceId } = body

    if (!nim) {
      return NextResponse.json(
        { error: "NIM is required" },
        { status: 400, headers: corsHeaders }
      )
    }

    // Cleanup old entries
    cleanupRecentAttendance()

    // Check for recent duplicates
    const duplicateKey = `${nim}-${deviceId || 'api'}`
    const now = Date.now()
    
    if (recentAttendance.has(duplicateKey)) {
      const lastTime = recentAttendance.get(duplicateKey)!
      const timeDiff = now - lastTime
      
      if (timeDiff < DUPLICATE_TIMEOUT) {
        console.log(`🚫 Duplicate attendance blocked: ${nim} (${timeDiff}ms ago)`)
        return NextResponse.json(
          { 
            error: "Duplicate attendance detected",
            message: `NIM ${nim} sudah tercatat ${Math.round(timeDiff/1000)} detik yang lalu`,
            timeDiff: timeDiff
          },
          { status: 409, headers: corsHeaders }
        )
      }
    }

    // Record this attendance
    recentAttendance.set(duplicateKey, now)

    // Create attendance record
    const attendanceRecord = {
      id: Date.now().toString(),
      nim,
      nama: nama || '',
      timestamp: now,
      deviceId: deviceId || 'api',
      sessionId: 'seminar-2025',
      eventName: 'Seminar Teknologi 2025',
      location: 'Auditorium Utama',
      scanned: true,
      mode: 'attendance', // Explicitly mark mode
      type: 'attendance_scan' // Explicitly mark type
    }

    console.log(`✅ New attendance recorded: ${nim} from ${deviceId || 'api'}`)

    return NextResponse.json(
      { 
        success: true, 
        message: "Attendance recorded successfully",
        data: attendanceRecord 
      },
      { status: 200, headers: corsHeaders }
    )

  } catch (error) {
    console.error("Attendance API error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: corsHeaders }
    )
  }
}

export async function GET() {
  try {
    // Return attendance statistics or recent records
    const stats = {
      totalToday: 0,
      totalUnique: 0,
      lastScanTime: null
    }

    return NextResponse.json(
      { success: true, data: stats },
      { status: 200, headers: corsHeaders }
    )

  } catch (error) {
    console.error("Attendance GET API error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: corsHeaders }
    )
  }
}
