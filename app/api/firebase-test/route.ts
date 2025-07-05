import { NextResponse } from "next/server"

export async function GET() {
  try {
    const firebaseUrl = process.env.FIREBASE_DATABASE_URL

    if (!firebaseUrl) {
      return NextResponse.json(
        {
          success: false,
          error: "Firebase Database URL tidak dikonfigurasi",
          message: "Variabel lingkungan FIREBASE_DATABASE_URL tidak ditemukan",
        },
        { status: 500 },
      )
    }

    // Test connection to Firebase
    console.log("Testing Firebase connection to:", firebaseUrl)

    const testUrl = `${firebaseUrl}/.json`
    const response = await fetch(testUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    })

    console.log("Firebase response status:", response.status)
    console.log("Firebase response headers:", Object.fromEntries(response.headers.entries()))

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`

      // Try to get more details from the response
      try {
        const errorText = await response.text()
        console.log("Firebase error response:", errorText.substring(0, 500))

        if (errorText.includes("<!DOCTYPE")) {
          errorMessage = "Firebase Realtime Database belum diaktifkan atau URL tidak valid"
        } else if (errorText.includes("Permission denied")) {
          errorMessage = "Akses ditolak - periksa aturan keamanan Firebase"
        } else if (response.status === 404) {
          errorMessage = "Database tidak ditemukan - pastikan Realtime Database sudah diaktifkan"
        }
      } catch (parseError) {
        console.log("Could not parse error response")
      }

      return NextResponse.json(
        {
          success: false,
          error: errorMessage,
          message: "Gagal terhubung ke Firebase Realtime Database",
          firebaseUrl,
          status: response.status,
        },
        { status: 500 },
      )
    }

    // Try to parse the response
    let data
    try {
      const responseText = await response.text()
      console.log("Firebase response text:", responseText.substring(0, 200))

      if (responseText.trim().startsWith("<!DOCTYPE")) {
        throw new Error("Received HTML instead of JSON - Database may not be enabled")
      }

      data = responseText ? JSON.parse(responseText) : null
    } catch (parseError) {
      console.error("Failed to parse Firebase response:", parseError)
      return NextResponse.json(
        {
          success: false,
          error: "Firebase mengembalikan respons yang tidak valid",
          message: "Pastikan Realtime Database sudah diaktifkan di konsol Firebase",
          firebaseUrl,
        },
        { status: 500 },
      )
    }

    return NextResponse.json({
      success: true,
      message: "Koneksi Firebase berhasil",
      firebaseUrl,
      dataExists: data !== null,
      timestamp: new Date().toISOString(),
      data: data ? Object.keys(data).length : 0,
    })
  } catch (error) {
    console.error("Firebase test error:", error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        message: "Gagal menguji koneksi Firebase",
      },
      { status: 500 },
    )
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  })
}
