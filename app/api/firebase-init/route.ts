import { NextResponse } from "next/server"

export async function POST() {
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

    console.log("Initializing Firebase database:", firebaseUrl)

    // First, test if we can access the database
    const testUrl = `${firebaseUrl}/.json`
    const testResponse = await fetch(testUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    })

    if (!testResponse.ok) {
      let errorMessage = `HTTP ${testResponse.status}: ${testResponse.statusText}`

      if (testResponse.status === 404) {
        errorMessage = "Database tidak ditemukan - pastikan Realtime Database sudah diaktifkan di konsol Firebase"
      } else if (testResponse.status === 401 || testResponse.status === 403) {
        errorMessage = "Akses ditolak - periksa aturan keamanan Firebase"
      }

      return NextResponse.json(
        {
          success: false,
          error: errorMessage,
          message: "Tidak dapat mengakses Firebase Realtime Database",
          firebaseUrl,
          status: testResponse.status,
        },
        { status: 500 },
      )
    }

    // Check if response is HTML (indicates database not enabled)
    const testText = await testResponse.text()
    if (testText.trim().startsWith("<!DOCTYPE")) {
      return NextResponse.json(
        {
          success: false,
          error: "Firebase Realtime Database belum diaktifkan",
          message: "Silakan aktifkan Realtime Database di konsol Firebase",
          firebaseUrl,
        },
        { status: 500 },
      )
    }

    // Check if database is already initialized
    let existingData = null
    try {
      existingData = testText ? JSON.parse(testText) : null
    } catch (parseError) {
      console.warn("Could not parse existing data:", parseError)
    }

    if (
      existingData &&
      existingData.settings &&
      existingData.settings.system &&
      existingData.settings.system.initialized
    ) {
      return NextResponse.json({
        success: true,
        message: "Database Firebase sudah diinisialisasi",
        alreadyInitialized: true,
        firebaseUrl,
      })
    }

    // Initialize Firebase database with sample data structure
    const initialData = {
      inventory: {
        sample_item_1: {
          name: "Laptop Sampel",
          barcode: "1234567890123",
          category: "Elektronik",
          quantity: 10,
          minStock: 5,
          price: 15000000,
          description: "Laptop sampel untuk pengujian",
          location: "Gudang A-1",
          createdAt: { ".sv": "timestamp" },
          updatedAt: { ".sv": "timestamp" },
        },
        sample_item_2: {
          name: "Kursi Kantor Sampel",
          barcode: "9876543210987",
          category: "Furnitur",
          quantity: 3,
          minStock: 5,
          price: 2500000,
          description: "Kursi kantor ergonomis",
          location: "Gudang B-2",
          createdAt: { ".sv": "timestamp" },
          updatedAt: { ".sv": "timestamp" },
        },
      },
      settings: {
        system: {
          initialized: true,
          version: "3.0",
          lastUpdate: { ".sv": "timestamp" },
        },
      },
      analytics: {
        totalScans: 0,
        totalItems: 2,
        lowStockAlerts: 1,
        lastReset: { ".sv": "timestamp" },
      },
    }

    // Initialize the database
    const initUrl = `${firebaseUrl}/.json`
    const response = await fetch(initUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(initialData),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error("Firebase initialization failed:", errorText)

      let errorMessage = `HTTP ${response.status}: ${response.statusText}`
      if (errorText.includes("Permission denied")) {
        errorMessage = "Akses ditolak - periksa aturan keamanan Firebase"
      }

      return NextResponse.json(
        {
          success: false,
          error: errorMessage,
          message: "Gagal menginisialisasi database Firebase",
          firebaseUrl,
          status: response.status,
        },
        { status: 500 },
      )
    }

    return NextResponse.json({
      success: true,
      message: "Database Firebase berhasil diinisialisasi",
      firebaseUrl,
      data: initialData,
    })
  } catch (error) {
    console.error("Firebase initialization error:", error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        message: "Gagal menginisialisasi database Firebase",
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
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  })
}
