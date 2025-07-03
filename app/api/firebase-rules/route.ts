import { NextRequest, NextResponse } from "next/server"

// Simple CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders })
}

export async function GET() {
  try {
    const rules = {
      "rules": {
        "inventory": {
          ".read": "auth != null",
          ".write": "auth != null"
        },
        "scans": {
          ".read": "auth != null",
          ".write": "auth != null"
        },
        "devices": {
          ".read": true,
          ".write": "auth != null"
        },
        "settings": {
          ".read": "auth != null",
          ".write": "auth != null"
        },
        "analytics": {
          ".read": "auth != null",
          ".write": "auth != null"
        },
        "transactions": {
          ".read": "auth != null",
          ".write": "auth != null"
        },
        "attendance": {
          ".read": "auth != null",
          ".write": "auth != null",
          ".indexOn": ["nim", "timestamp", "deviceId"]
        }
      }
    }

    return NextResponse.json(
      { 
        success: true,
        message: "Firebase Database Rules for StokManager",
        rules,
        instructions: {
          step1: "Copy the rules object above",
          step2: "Go to Firebase Console > Database > Rules",
          step3: "Paste the rules and click 'Publish'",
          step4: "Wait a few minutes for rules to propagate",
          note: "These rules require authentication for data access while keeping device status public for API monitoring"
        }
      },
      { status: 200, headers: corsHeaders }
    )

  } catch (error) {
    console.error("Firebase rules API error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: corsHeaders }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    return NextResponse.json(
      { 
        success: false,
        message: "Automatic rules update not implemented",
        instructions: "Please manually update Firebase rules using the GET endpoint response"
      },
      { status: 501, headers: corsHeaders }
    )

  } catch (error) {
    console.error("Firebase rules POST API error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: corsHeaders }
    )
  }
}
