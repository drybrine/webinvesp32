import { type NextRequest, NextResponse } from "next/server"
import { database, ensureFirebaseInitialized } from "@/lib/firebase"
import { ref, get } from "firebase/database"

export async function GET(request: NextRequest) {
  try {
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
      return NextResponse.json({ 
        devices: [],
        total: 0,
        online: 0,
        offline: 0 
      })
    }

    // Convert to array with complete device information
    const deviceList = Object.keys(devices).map((deviceId) => {
      const device = devices[deviceId]
      return {
        deviceId,
        status: device.status || 'offline',
        ipAddress: device.ipAddress || device.ip || '',
        lastSeen: device.lastSeen || device.lastHeartbeat,
        scanCount: device.scanCount || 0,
        freeHeap: device.freeHeap,
        version: device.version,
        name: device.name || deviceId,
        batteryLevel: device.batteryLevel,
        lastHeartbeat: device.lastHeartbeat,
        firstSeen: device.firstSeen,
      }
    })

    const onlineDevices = deviceList.filter(d => d.status === 'online')
    const offlineDevices = deviceList.filter(d => d.status === 'offline')

    const result = {
      devices: deviceList,
      total: deviceList.length,
      online: onlineDevices.length,
      offline: offlineDevices.length,
      timestamp: new Date().toISOString(),
    }

    return NextResponse.json(result)

  } catch (error) {
    console.error("Error fetching devices:", error)
    return NextResponse.json(
      { error: "Failed to fetch devices" },
      { status: 500 }
    )
  }
}

// Allow CORS
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS", 
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  })
}
