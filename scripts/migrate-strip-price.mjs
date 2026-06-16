#!/usr/bin/env node
// scripts/migrate-strip-price.mjs
// Removes legacy price fields from Firebase Realtime Database:
//   - inventory/{id}/price
//   - transactions/{id}/unitPrice
//   - transactions/{id}/totalAmount
//
// Default mode is dry-run (no writes). Pass --apply to actually mutate the
// database. The script is idempotent: setting an absent key to null is a no-op.
//
// Authentication: provide credentials via either
//   - FIREBASE_SERVICE_ACCOUNT (path to a service-account JSON file), or
//   - FIREBASE_SERVICE_ACCOUNT_JSON (inline JSON string of the same file).
//
// Database URL: provide via FIREBASE_DATABASE_URL (e.g. https://xxx.firebaseio.com).

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";

const FIELDS = {
  inventory: ["price"],
  transactions: ["unitPrice", "totalAmount"],
};

const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const collectionsArg = argv.find((a) => a.startsWith("--collections="));
const COLLECTIONS = collectionsArg
  ? collectionsArg.split("=")[1].split(",").map((s) => s.trim())
  : Object.keys(FIELDS);

function loadServiceAccount() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  }
  const path = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!path) {
    throw new Error(
      "Missing Firebase credentials. Set FIREBASE_SERVICE_ACCOUNT (path) or FIREBASE_SERVICE_ACCOUNT_JSON (inline).",
    );
  }
  return JSON.parse(readFileSync(resolve(path), "utf8"));
}

async function main() {
  const databaseURL = process.env.FIREBASE_DATABASE_URL;
  if (!databaseURL) {
    throw new Error("Missing FIREBASE_DATABASE_URL environment variable.");
  }

  const serviceAccount = loadServiceAccount();
  const { default: admin } = await import("firebase-admin");

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL,
    });
  }
  const db = admin.database();

  const updates = {};
  const stats = { inventory: 0, transactions: 0 };

  for (const collection of COLLECTIONS) {
    if (!FIELDS[collection]) {
      console.warn(`! Skipping unknown collection: ${collection}`);
      continue;
    }
    const fields = FIELDS[collection];
    console.log(`\nScanning /${collection} ...`);
    const snapshot = await db.ref(collection).once("value");
    const value = snapshot.val();
    if (!value) {
      console.log(`  (empty)`);
      continue;
    }
    const keys = Object.keys(value);
    for (const key of keys) {
      const node = value[key];
      if (!node || typeof node !== "object") continue;
      for (const field of fields) {
        if (Object.prototype.hasOwnProperty.call(node, field)) {
          updates[`${collection}/${key}/${field}`] = null;
          stats[collection] += 1;
        }
      }
    }
    console.log(`  scanned=${keys.length} ${fields.join("+")} fields to remove=${stats[collection]}`);
  }

  const totalUpdates = Object.keys(updates).length;
  console.log(`\nTotal keys to remove: ${totalUpdates}`);
  if (totalUpdates === 0) {
    console.log("Nothing to migrate. Done.");
    return;
  }

  if (!APPLY) {
    console.log("\n[DRY-RUN] No writes performed. Re-run with --apply to commit changes.");
    console.log("Sample of planned updates (first 5):");
    Object.entries(updates)
      .slice(0, 5)
      .forEach(([k]) => console.log(`  ${k} -> null`));
    return;
  }

  console.log("\n[APPLY] Writing updates ...");
  await db.ref().update(updates);
  console.log("Done.");
}

main().catch((err) => {
  console.error("Migration failed:", err.message);
  process.exitCode = 1;
});
