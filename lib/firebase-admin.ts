import { initializeApp, getApps, cert, ServiceAccount, App } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';

// Server-side Firebase Admin configuration
let adminApp: App | null = null
let adminDatabase: any = null

export const initializeFirebaseAdmin = () => {
  if (adminApp) {
    return { app: adminApp, database: adminDatabase }
  }

  try {
    // Check if we have service account credentials
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);

    // Initialize with service account (production - Vercel, Netlify, etc.)
    console.log('🔧 Initializing Firebase Admin with service account...')
    
    if (getApps().length === 0) {
      adminApp = initializeApp({
        credential: cert(serviceAccount),
        databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL
      }, 'admin')
    } else {
      adminApp = getApps().find((app: App) => app.name === 'admin') || getApps()[0]
    }

    adminDatabase = getDatabase(adminApp)
    console.log('✅ Firebase Admin initialized successfully')
    
    return { app: adminApp, database: adminDatabase }
  } catch (error) {
    console.error('❌ Failed to initialize Firebase Admin:', error)
    console.error('💡 Check your FIREBASE_SERVICE_ACCOUNT_KEY environment variable')
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
