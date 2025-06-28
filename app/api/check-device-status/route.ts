import { type NextRequest, NextResponse } from "next/server"
import { database, ensureFirebaseInitialized } from "@/lib/firebase"
import { ref, get, update } from "firebase/database"

// Timeout in milliseconds (30 seconds for more stable detection)
const OFFLINE_TIMEOUT = 30000

export async function POST(request: NextRequest) {
  try {
    // Authorization check for security (relaxed for internal calls)
    const authHeader = request.headers.get("authorization")
    const isInternalCall = request.headers.get("x-internal-call") === "true"
    
    if (process.env.CRON_SECRET && authHeader && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Ensure Firebase is initialized for server-side operation
    const db = ensureFirebaseInitialized()
    
    if (!db) {
      console.error("❌ Firebase database not available")
      return NextResponse.json(
        { error: "Firebase database initialization failed" },
        { status: 500 }
      )
    }

    const devicesRef = ref(db, "devices")
    const snapshot = await get(devicesRef)
    const devices = snapshot.val()

    if (!devices) {
      console.log("ℹ️ No devices found in database")
      return NextResponse.json({ message: "No devices found" })
    }

    const now = Date.now()
    const updates: Record<string, any> = {}
    let updatedCount = 0
    let offlineCount = 0
    let onlineCount = 0
    const deviceStatuses: any[] = []

    console.log(`🔍 Checking ${Object.keys(devices).length} devices for status updates...`)

    Object.keys(devices).forEach((deviceId) => {
      const device = devices[deviceId]
      const lastHeartbeat = device.lastHeartbeat
      const lastSeen = device.lastSeen
      const currentStatus = device.status
      
      // Use the most recent timestamp available
      let mostRecentTimestamp = 0
      if (lastHeartbeat && Number(lastHeartbeat) > mostRecentTimestamp) {
        mostRecentTimestamp = Number(lastHeartbeat)
      }
      if (lastSeen && Number(lastSeen) > mostRecentTimestamp) {
        mostRecentTimestamp = Number(lastSeen)
      }
      
      const timeSinceLastSeen = now - mostRecentTimestamp
      const shouldBeOffline = !mostRecentTimestamp || timeSinceLastSeen > OFFLINE_TIMEOUT
      
      deviceStatuses.push({
        deviceId,
        currentStatus,
        lastHeartbeat,
        lastSeen,
        mostRecentTimestamp,
        timeSinceLastSeen: Math.floor(timeSinceLastSeen / 1000),
        shouldBeOffline
      })
      
      // If device hasn't sent heartbeat in timeout period
      if (shouldBeOffline) {
        if (currentStatus !== "offline") {
          updates[`${deviceId}/status`] = "offline"
          console.log(`⚠️ Setting device ${deviceId} to OFFLINE - last seen: ${mostRecentTimestamp ? new Date(mostRecentTimestamp).toISOString() : 'never'}, time diff: ${Math.floor(timeSinceLastSeen/1000)}s`)
          updatedCount++
          offlineCount++
        }
      } else {
        // If device has been active recently
        if (currentStatus !== "online") {
          updates[`${deviceId}/status`] = "online"
          console.log(`✅ Setting device ${deviceId} to ONLINE - last seen: ${new Date(mostRecentTimestamp).toISOString()}`)
          updatedCount++
          onlineCount++
        }
      }
    })

    // Apply all status updates at once
    if (Object.keys(updates).length > 0) {
      await update(devicesRef, updates)
      console.log(`📝 Applied ${Object.keys(updates).length / 2} status updates to database`)
    }

    const result = {
      success: true,
      message: `Checked ${Object.keys(devices).length} devices, updated ${updatedCount} statuses (${onlineCount} online, ${offlineCount} offline)`,
      totalDevices: Object.keys(devices).length,
      updatedDevices: updatedCount,
      onlineDevices: onlineCount,
      offlineDevices: offlineCount,
      timestamp: new Date().toISOString(),
      ...(isInternalCall && { deviceDetails: deviceStatuses })
    }

    return NextResponse.json(result)

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