import { NextRequest, NextResponse } from "next/server"

// Simple endpoint to help ESP32 detect current page mode
// This is a helper endpoint for ESP32 to understand the current application state

export async function GET(request: NextRequest) {
  try {
    // Get referer header to determine current page
    const referer = request.headers.get('referer') || ''
    
    // Always return inventory mode
    return NextResponse.json({
      page: 'inventory',
      mode: 'inventory',
      timestamp: Date.now(),
      success: true
    })
    
  } catch (error) {
    console.error("Error detecting page mode:", error)
    return NextResponse.json({
      page: 'inventory',
      mode: 'inventory',
      error: 'Failed to detect page mode',
      timestamp: Date.now(),
      success: false
    }, { status: 500 })
  }
}

// POST endpoint to manually set page mode (for testing)
export async function POST(request: NextRequest) {
  try {
    // Only allow inventory mode
    return NextResponse.json({
      page: 'inventory',
      mode: 'inventory',
      timestamp: Date.now(),
      success: true,
      message: `Page mode set to inventory`
    })
    
  } catch (error) {
    console.error("Error setting page mode:", error)
    return NextResponse.json({
      error: 'Failed to set page mode',
      timestamp: Date.now(),
      success: false
    }, { status: 500 })
  }
}
