#!/usr/bin/env node

import {applicationDefault, cert, getApps, initializeApp} from "firebase-admin/app"
import {getAuth} from "firebase-admin/auth"
import {getDatabase, ServerValue} from "firebase-admin/database"

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, "").split("=")
    return [key, rest.join("=")]
  }),
)

const email = args.email || process.env.BOOTSTRAP_ADMIN_EMAIL
const password = args.password || process.env.BOOTSTRAP_ADMIN_PASSWORD
const displayName = args.name || process.env.BOOTSTRAP_ADMIN_NAME || "Administrator"
const databaseURL = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL || process.env.FIREBASE_DATABASE_URL

if (!email || !password || password.length < 12 || !databaseURL) {
  console.error("Usage: npm run bootstrap:admin -- --email=admin@example.com --password='minimum-12-char' --name='Admin'")
  console.error("NEXT_PUBLIC_FIREBASE_DATABASE_URL and Application Default Credentials are required.")
  process.exit(1)
}

const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT
const credential = serviceAccountJson ? cert(JSON.parse(serviceAccountJson)) : applicationDefault()
if (!getApps().length) initializeApp({credential, databaseURL})

const auth = getAuth()
let user
try {
  user = await auth.getUserByEmail(email)
  user = await auth.updateUser(user.uid, {password, displayName, disabled: false})
} catch (error) {
  if (error.code !== "auth/user-not-found") throw error
  user = await auth.createUser({email, password, displayName, disabled: false, emailVerified: false})
}

await auth.setCustomUserClaims(user.uid, {role: "admin", disabled: false})
await auth.revokeRefreshTokens(user.uid)
await getDatabase().ref(`users/${user.uid}`).set({
  uid: user.uid,
  email,
  displayName,
  role: "admin",
  disabled: false,
  operationId: `bootstrap_${Date.now()}`,
  updatedByUid: user.uid,
  createdAt: ServerValue.TIMESTAMP,
  updatedAt: ServerValue.TIMESTAMP,
})

console.log(`Bootstrap admin ready: ${email} (${user.uid})`)
