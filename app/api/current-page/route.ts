import { NextRequest, NextResponse } from "next/server"

// Simple endpoint to help ESP32 detect current page mode
// This is a helper endpoint for ESP32 to understand the current application state

export async function GET(request: NextRequest) {
  try {
    // Get referer header to determine current page
    const referer = request.headers.get('referer') || ''
    
    // Simple page detection based on URL patterns
    let currentPage = 'inventory' // default
    
    if (referer.includes('/absensi')) {
      currentPage = 'attendance'
    } else if (referer.includes('/transaksi')) {
      currentPage = 'inventory'
    } else if (referer.includes('/scan')) {
      currentPage = 'inventory'
    }
    
    // For ESP32 requests, we'll rely on a simple state management
    // In a real application, you might want to use Redis or similar
    
    return NextResponse.json({
      page: currentPage,
      mode: currentPage === 'attendance' ? 'attendance' : 'inventory',
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
    const body = await request.json()
    const { page, mode } = body
    
    // In a real application, you would store this in a database or cache
    // For demo purposes, we'll just return the set mode
    
    return NextResponse.json({
      page: page || 'inventory',
      mode: mode || 'inventory',
      timestamp: Date.now(),
      success: true,
      message: `Page mode set to ${page || 'inventory'}`
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
