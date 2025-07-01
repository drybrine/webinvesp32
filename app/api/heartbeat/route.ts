import { type NextRequest, NextResponse } from "next/server"
import { database } from "@/lib/firebase"
import { ref, set, get } from "firebase/database"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { deviceId, uptime, freeHeap, scanCount, version } = body
    
    // Debug: Log received values
    console.log(`📡 Heartbeat received from ${deviceId}:`, {
      uptime: uptime,
      uptimeType: typeof uptime,
      freeHeap,
      scanCount,
      version
    });

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
      uptime: uptime || 0, // Keep it simple - 0 if not provided
      freeHeap: freeHeap || existingData.freeHeap || 0,
      scanCount: scanCount || existingData.scanCount || 0,
      version: version || existingData.version || "1.0.0",
      // Add a field to track when device was first seen for better uptime calculation
      firstSeen: existingData.firstSeen || Date.now(),
    }

    // Debug: Log data being stored
    console.log(`💾 Storing device data for ${deviceId}:`, deviceData);

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
