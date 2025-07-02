import { type NextRequest, NextResponse } from "next/server"
import { database } from "@/lib/firebase"
import { ref, push, set, get } from "firebase/database"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { barcode, deviceId, timestamp, location } = body

    // Log the scan
    console.log("Barcode scan received:", {
      barcode,
      deviceId,
      timestamp,
      location,
    })

    // Check if Firebase is available
    if (!database) {
      return NextResponse.json(
        {
          success: false,
          error: "Firebase not available",
          localSave: true,
          barcode,
          deviceId,
        },
        { status: 200 }, // Still return 200 so ESP32 doesn't retry unnecessarily
      )
    }

    // Create scan data
    const scanData = {
      barcode,
      deviceId,
      timestamp: timestamp || Date.now(),
      processed: false,
      location: location || "Unknown",
      mode: body.mode || "inventory", // Default to inventory mode if not specified
      type: body.type || "inventory_scan", // Default type if not specified
    }

    // Save to Firebase
    const scansRef = ref(database, "scans")
    const newScanRef = push(scansRef)
    await set(newScanRef, scanData)

    // Update device status
    const deviceRef = ref(database, `devices/${deviceId}`)
    const deviceSnapshot = await get(deviceRef)
    const deviceData = deviceSnapshot.val() || {}

    await set(deviceRef, {
      ...deviceData,
      status: "online",
      lastSeen: Date.now(),
      ipAddress: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown",
      scanCount: (deviceData.scanCount || 0) + 1,
    })

    // Check if barcode exists in inventory
    const inventoryRef = ref(database, "inventory")
    const inventorySnapshot = await get(inventoryRef)
    const inventory = inventorySnapshot.val() || {}

    let itemFound = false
    let itemId = null

    // Search for the barcode in inventory
    for (const [id, item] of Object.entries(inventory)) {
      if ((item as Record<string, unknown>).barcode === barcode) {
        itemFound = true
        itemId = id
        break
      }
    }

    // Update scan with item info
    if (itemFound && itemId) {
      await set(ref(database, `scans/${newScanRef.key}`), {
        ...scanData,
        processed: true,
        itemFound: true,
        itemId,
      })
    }

    return NextResponse.json({
      success: true,
      message: "Barcode scan saved successfully",
      scanId: newScanRef.key,
      itemFound,
      itemId,
    })
  } catch (error) {
    console.error("Error processing barcode scan:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Failed to process barcode scan",
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
