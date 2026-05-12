const required = [
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_DATABASE_URL",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
  "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  "NEXT_PUBLIC_FIREBASE_APP_ID",
]

const fs = require("fs")
const path = require("path")

const envPath = path.join(process.cwd(), ".env.local")
const content = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : ""
const values = Object.fromEntries(
  content
    .split(/\r?\n/)
    .filter((line) => line.trim() && !line.trim().startsWith("#"))
    .map((line) => {
      const index = line.indexOf("=")
      return index === -1 ? [line.trim(), ""] : [line.slice(0, index).trim(), line.slice(index + 1).trim()]
    })
)

const missing = required.filter((key) => !values[key])

if (missing.length) {
  console.error(`Missing Firebase environment variables in .env.local: ${missing.join(", ")}`)
  process.exit(1)
}

console.log("Firebase environment variables are present")
