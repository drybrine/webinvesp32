import { initializeApp, getApps, cert, ServiceAccount } from 'firebase-admin/app'
import { getDatabase } from 'firebase-admin/database'
import type { App } from 'firebase-admin/app'

// Server-side Firebase Admin configuration
let adminApp: App | null = null
let adminDatabase: any = null

export const initializeFirebaseAdmin = () => {
  if (adminApp) {
    return { app: adminApp, database: adminDatabase }
  }

  try {
    // Check if we have service account credentials
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
    
    if (serviceAccount) {
      // Initialize with service account (production)
      const serviceAccountKey = JSON.parse(serviceAccount) as ServiceAccount
      
      if (getApps().length === 0) {
        adminApp = initializeApp({
          credential: cert(serviceAccountKey),
          databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL
        }, 'admin')
      } else {
        adminApp = getApps().find((app: App) => app.name === 'admin') || getApps()[0]
      }
    } else {
      // Development mode - use default credentials or client SDK
      console.log('🔧 Development mode: Using client SDK for server operations')
      return null
    }

    adminDatabase = getDatabase(adminApp)
    console.log('✅ Firebase Admin initialized successfully')
    
    return { app: adminApp, database: adminDatabase }
  } catch (error) {
    console.error('❌ Failed to initialize Firebase Admin:', error)
    return null
  }
}

export const getAdminDatabase = () => {
  if (!adminDatabase) {
    const result = initializeFirebaseAdmin()
    return result?.database || null
  }
  return adminDatabase
}
