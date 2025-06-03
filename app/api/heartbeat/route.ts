import { type NextRequest, NextResponse } from "next/server"
import { database } from "@/lib/firebase"
import { ref, get, set, serverTimestamp } from "firebase/database"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { deviceId, uptime, freeHeap, scanCount, version } = body

    // Check if Firebase is available
    if (!database) {
      return NextResponse.json(
        {
          success: false,
          error: "Firebase not available",
        },
        { status: 503 },
      )
    }

    // Update device status dengan heartbeat
    const deviceRef = ref(database, `devices/${deviceId}`)
    const deviceSnapshot = await get(deviceRef)
    const existingData = deviceSnapshot.val() || {}

    const deviceData = {
      ...existingData,
      deviceId,
      status: "online",
      lastSeen: Date.now(), // Gunakan timestamp client
      ipAddress:
        request.headers.get("x-forwarded-for") ||
        request.headers.get("x-real-ip") ||
        "unknown",
      uptime: uptime || existingData.uptime || 0,
      freeHeap: freeHeap || existingData.freeHeap || 0,
      scanCount: scanCount || existingData.scanCount || 0,
      version: version || existingData.version || "1.0.0",
    }

    await set(deviceRef, deviceData)

    return NextResponse.json({
      success: true,
      message: "Heartbeat received",
      deviceId,
      timestamp: Date.now(),
    })
  } catch (error) {
    console.error("Error processing heartbeat:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Failed to process heartbeat",
      },
      { status: 500 },
    )
  }
}

// Allow CORS for ESP32 requests
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  })
}
