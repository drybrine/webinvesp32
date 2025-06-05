import { type NextRequest, NextResponse } from "next/server"
import { database } from "@/lib/firebase"
import { ref, get, update } from "firebase/database"

// Timeout in milliseconds (60 seconds)
const OFFLINE_TIMEOUT = 60000

export async function POST(request: NextRequest) {
  try {
    // Authorization check for security
    const authHeader = request.headers.get("authorization")
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!database) {
      return NextResponse.json(
        { error: "Firebase not available" },
        { status: 500 }
      )
    }

    const devicesRef = ref(database, "devices")
    const snapshot = await get(devicesRef)
    const devices = snapshot.val()

    if (!devices) {
      return NextResponse.json({ message: "No devices found" })
    }

    const now = Date.now()
    const updates: Record<string, any> = {}
    let updatedCount = 0
    let offlineCount = 0
    let onlineCount = 0

    Object.keys(devices).forEach((deviceId) => {
      const device = devices[deviceId]
      const lastSeen = device.lastHeartbeat || device.lastSeen
      
      // If device hasn't sent heartbeat in last 60 seconds
      if (!lastSeen || (now - Number(lastSeen)) > OFFLINE_TIMEOUT) {
        if (device.status !== "offline") {
          updates[`${deviceId}/status`] = "offline"
          console.log(`Setting device ${deviceId} to offline, last seen: ${lastSeen}, diff: ${now - Number(lastSeen)}ms`)
          updatedCount++
          offlineCount++
        }
      } else {
        // If device has been active in last 60 seconds
        if (device.status !== "online") {
          updates[`${deviceId}/status`] = "online"
          console.log(`Setting device ${deviceId} to online, last seen: ${new Date(Number(lastSeen)).toISOString()}`)
          updatedCount++
          onlineCount++
        }
      }
    })

    // Apply all status updates at once
    if (Object.keys(updates).length > 0) {
      await update(devicesRef, updates)
    }

    return NextResponse.json({
      success: true,
      message: `Checked ${Object.keys(devices).length} devices, updated ${updatedCount} statuses (${onlineCount} online, ${offlineCount} offline)`,
      updatedDevices: updatedCount,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error("Error checking device status:", error)
    return NextResponse.json(
      { error: "Failed to check device status" },
      { status: 500 }
    )
  }
}

// Allow CORS for cron job
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