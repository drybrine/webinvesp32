import { type NextRequest, NextResponse } from "next/server"
import { database } from "@/lib/firebase"
import { ref, get, update } from "firebase/database"

export async function POST(request: NextRequest) {
  try {
    // Verifikasi authorization untuk keamanan
    const authHeader = request.headers.get("authorization")
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
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

    Object.keys(devices).forEach((deviceId) => {
      const device = devices[deviceId]
      const lastSeen = device.lastSeen
      
      // Jika device belum pernah kirim heartbeat atau terakhir kirim > 30 detik
      if (!lastSeen || (now - lastSeen) > 30000) {
        if (device.status !== "offline") {
          updates[`${deviceId}/status`] = "offline"
          updatedCount++
          console.log(`Setting device ${deviceId} to offline`)
        }
      } else {
        // Jika device masih aktif dalam 30 detik terakhir
        if (device.status !== "online") {
          updates[`${deviceId}/status`] = "online"
          updatedCount++
          console.log(`Setting device ${deviceId} to online`)
        }
      }
    })

    // Update semua perubahan status sekaligus
    if (Object.keys(updates).length > 0) {
      await update(devicesRef, updates)
    }

    return NextResponse.json({
      success: true,
      message: `Checked ${Object.keys(devices).length} devices, updated ${updatedCount} statuses`,
      updatedDevices: updatedCount
    })

  } catch (error) {
    console.error("Error checking device status:", error)
    return NextResponse.json(
      { error: "Failed to check device status" },
      { status: 500 }
    )
  }
}