import { type NextRequest, NextResponse } from "next/server"
import { database } from "@/lib/firebase"
import { ref, set, get } from "firebase/database"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { deviceId, uptime, freeHeap, scanCount, version } = body

    console.log("Heartbeat received from device:", deviceId, {
      uptime,
      freeHeap,
      scanCount,
      version,
    })

    // Check if Firebase is available
    if (!database) {
      return NextResponse.json(
        {
          success: false,
          error: "Firebase not available",
          message: "Device heartbeat received but Firebase is not available",
        },
        { status: 200 }, // Still return 200 so ESP32 doesn't retry unnecessarily
      )
    }

    // Update device status in Firebase
    const deviceRef = ref(database, `devices/${deviceId}`)
    const deviceSnapshot = await get(deviceRef)
    const existingData = deviceSnapshot.val() || {}

    await set(deviceRef, {
      ...existingData,
      deviceId,
      status: "online",
      lastSeen: Date.now(),
      uptime: uptime || 0,
      freeHeap: freeHeap || 0,
      scanCount: scanCount || existingData.scanCount || 0,
      version: version || "unknown",
      ipAddress:
        request.headers.get("x-forwarded-for") ||
        request.headers.get("x-real-ip") ||
        existingData.ipAddress ||
        "unknown",
    })

    return NextResponse.json({
      success: true,
      message: "Heartbeat received and device status updated",
      serverTime: Date.now(),
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
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  })
}
