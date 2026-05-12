import { NextRequest, NextResponse } from "next/server"

// Simple endpoint to help ESP32 detect current page mode
// This is a helper endpoint for ESP32 to understand the current application state

export async function GET(request: NextRequest) {
  try {
    const referer = request.headers.get('referer') || ''

    let currentPage = 'inventory'

    if (referer.includes('/transaksi')) {
      currentPage = 'inventory'
    } else if (referer.includes('/scan')) {
      currentPage = 'inventory'
    }

    return NextResponse.json({
      page: currentPage,
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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { page, mode } = body

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

