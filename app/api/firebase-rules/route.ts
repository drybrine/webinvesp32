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
          ".read": true,
          ".write": true
        },
        "scans": {
          ".read": true,
          ".write": true
        },
        "devices": {
          ".read": true,
          ".write": true
        },
        "settings": {
          ".read": true,
          ".write": true
        },
        "analytics": {
          ".read": true,
          ".write": true
        },
        "transactions": {
          ".read": true,
          ".write": true
        },
        "attendance": {
          ".read": true,
          ".write": true,
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
          note: "This will give full read/write access to all collections including attendance"
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
