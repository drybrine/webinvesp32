import fs from "node:fs"
import {after, before, beforeEach, test} from "node:test"
import assert from "node:assert/strict"
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing"
import {get, increment, ref, remove, serverTimestamp, set, update} from "firebase/database"

let env

const inventoryItem = {
  id: "item-1",
  name: "Busi",
  category: "Mesin",
  barcode: "8990001",
  quantity: 10,
  minStock: 2,
  lastUpdated: Date.now(),
  operationId: "operation-seed-1",
  updatedByUid: "seed",
  createdAt: Date.now(),
  updatedAt: Date.now(),
}

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-stokmanager-test",
    database: {
      rules: fs.readFileSync("firebase-rules-strict.json", "utf8"),
    },
  })
})

beforeEach(async () => {
  await env.clearDatabase()
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.database()
    await set(ref(db, "inventory/item-1"), inventoryItem)
    await set(ref(db, "deviceAuth/device-user"), {
      uid: "device-user",
      deviceId: "ESP32-1234ABCD",
      disabled: false,
    })
    await set(ref(db, "users"), {
      "admin-1": {uid: "admin-1", role: "admin", disabled: false},
      "operator-1": {uid: "operator-1", role: "operator", disabled: false},
      "viewer-1": {uid: "viewer-1", role: "viewer", disabled: false},
      "disabled-1": {uid: "disabled-1", role: "admin", disabled: true},
    })
    await set(ref(db, "auditLogs/audit-1"), {
      entity: "inventory",
      entityId: "item-1",
      action: "create",
      actorUid: "admin-1",
      actorType: "user",
      changedFields: ["quantity"],
      timestamp: Date.now(),
    })
  })
})

after(async () => {
  await env.cleanup()
})

function human(uid, role, extra = {}) {
  return env.authenticatedContext(uid, {role, disabled: false, ...extra}).database()
}

function device(uid = "device-user", deviceId = "ESP32-1234ABCD", extra = {}) {
  return env.authenticatedContext(uid, {
    role: "device",
    device: true,
    deviceId,
    disabled: false,
    ...extra,
  }).database()
}

test("anonymous users cannot read or write", async () => {
  const db = env.unauthenticatedContext().database()
  await assertFails(get(ref(db, "inventory")))
  await assertFails(set(ref(db, "inventory/item-2"), inventoryItem))
})

test("viewer can read but cannot mutate inventory", async () => {
  const db = human("viewer-1", "viewer")
  await assertSucceeds(get(ref(db, "inventory")))
  await assertFails(update(ref(db, "inventory/item-1"), {quantity: 9}))
})

test("disabled human is denied even with a stale enabled token", async () => {
  const db = env.authenticatedContext("disabled-1", {role: "admin", disabled: false}).database()
  await assertFails(get(ref(db, "inventory")))
})

test("missing or mismatched human profile is denied despite valid-looking claims", async () => {
  await assertFails(get(ref(human("missing-user", "admin"), "inventory")))
  await assertFails(get(ref(human("viewer-1", "admin"), "inventory")))
  await assertSucceeds(get(ref(human("viewer-1", "viewer"), "inventory")))
})

test("operator stock and ledger update is atomic and cannot go negative", async () => {
  const db = human("operator-1", "operator")
  const now = Date.now()
  await assertSucceeds(update(ref(db), {
    "inventory/item-1/quantity": 7,
    "inventory/item-1/lastUpdated": now,
    "inventory/item-1/updatedAt": now,
    "inventory/item-1/operationId": "operation-stock-1",
    "inventory/item-1/updatedByUid": "operator-1",
    "transactions/tx-1": {
      id: "tx-1",
      type: "out",
      productName: "Busi",
      productBarcode: "8990001",
      quantity: -3,
      reason: "Test",
      operator: "Dashboard",
      operatorUid: "operator-1",
      operationId: "operation-stock-1",
      timestamp: now,
    },
  }))
  await assertFails(update(ref(db, "inventory/item-1"), {
    quantity: -1,
    lastUpdated: now,
    updatedAt: now,
    operationId: "operation-stock-2",
    updatedByUid: "operator-1",
  }))
})

test("transactions are append-only", async () => {
  const db = human("operator-1", "operator")
  const transaction = {
    id: "tx-1",
    type: "in",
    productName: "Busi",
    productBarcode: "8990001",
    quantity: 1,
    reason: "Test",
    operator: "Dashboard",
    operatorUid: "operator-1",
    operationId: "operation-ledger-1",
    timestamp: Date.now(),
  }
  await assertSucceeds(set(ref(db, "transactions/tx-1"), transaction))
  await assertFails(update(ref(db, "transactions/tx-1"), {quantity: 99}))
  await assertFails(remove(ref(db, "transactions/tx-1")))
})

test("inventory and transactions reject legacy price fields", async () => {
  const db = human("operator-1", "operator")
  const now = Date.now()
  await assertFails(set(ref(db, "inventory/item-price"), {
    ...inventoryItem,
    id: "item-price",
    operationId: "operation-price-1",
    updatedByUid: "operator-1",
    price: 1000,
  }))
  await assertFails(set(ref(db, "transactions/tx-price"), {
    id: "tx-price",
    type: "in",
    productName: "Busi",
    productBarcode: "8990001",
    quantity: 1,
    reason: "Test",
    operator: "Dashboard",
    operatorUid: "operator-1",
    operationId: "operation-ledger-2",
    timestamp: now,
    unitPrice: 1000,
  }))
})

test("device can read inventory and write only its own heartbeat and scans", async () => {
  const db = device()
  const now = Date.now()
  await assertSucceeds(get(ref(db, "inventory")))
  await assertSucceeds(set(ref(db, "devices/ESP32-1234ABCD"), {
    status: "online",
    lastSeen: now,
    lastHeartbeat: now,
    ipAddress: "192.168.1.20",
    batteryLevel: 87,
    rssi: -55,
    version: "6.4.1",
    scanCount: 12,
    freeHeap: 120000,
    currentMode: "inventory",
    uptime: 5000,
    name: "Gudang",
  }))
  await assertFails(set(ref(db, "devices/ESP32-1234ABCD"), {
    status: "online",
    lastSeen: now,
    batteryLevel: 101,
  }))
  await assertFails(set(ref(db, "devices/ESP32-1234ABCD"), {
    status: "online",
    lastSeen: now,
    price: 1000,
  }))
  await assertFails(set(ref(db, "devices/ESP32-FFFFFFFF"), {
    status: "online",
    lastSeen: now,
  }))
  await assertSucceeds(set(ref(db, "scans/scan-1"), {
    barcode: "8990001",
    deviceId: "ESP32-1234ABCD",
    timestamp: now,
    mode: "inventory",
    type: "inventory_scan",
    processed: false,
  }))
  await assertFails(set(ref(db, "scans/scan-2"), {
    barcode: "8990001",
    deviceId: "ESP32-FFFFFFFF",
    timestamp: now,
    mode: "inventory",
    type: "inventory_scan",
    processed: false,
  }))
})

test("device can append scanner stock transactions with one-unit inventory delta only", async () => {
  const db = device()
  const now = Date.now()
  await assertSucceeds(update(ref(db), {
    "inventory/item-1/quantity": increment(1),
    "inventory/item-1/lastUpdated": serverTimestamp(),
    "inventory/item-1/updatedAt": serverTimestamp(),
    "inventory/item-1/operationId": "operation-device-in-1",
    "inventory/item-1/updatedByUid": "device-user",
    "transactions/tx-device-in-1": {
      id: "tx-device-in-1",
      type: "in",
      productName: "Busi",
      productBarcode: "8990001",
      quantity: 1,
      reason: "Auto IN dari scanner",
      operator: "Scanner",
      operatorUid: "device-user",
      operationId: "operation-device-in-1",
      timestamp: serverTimestamp(),
    },
  }))

  await assertSucceeds(update(ref(db), {
    "inventory/item-1/quantity": increment(-1),
    "inventory/item-1/lastUpdated": serverTimestamp(),
    "inventory/item-1/updatedAt": serverTimestamp(),
    "inventory/item-1/operationId": "operation-device-out-1",
    "inventory/item-1/updatedByUid": "device-user",
    "transactions/tx-device-out-1": {
      id: "tx-device-out-1",
      type: "out",
      productName: "Busi",
      productBarcode: "8990001",
      quantity: 1,
      reason: "Auto OUT dari scanner",
      operator: "Scanner",
      operatorUid: "device-user",
      operationId: "operation-device-out-1",
      timestamp: serverTimestamp(),
    },
  }))

  await assertFails(update(ref(db), {
    "inventory/item-1/quantity": increment(2),
    "inventory/item-1/lastUpdated": serverTimestamp(),
    "inventory/item-1/updatedAt": serverTimestamp(),
    "inventory/item-1/operationId": "operation-device-bad-delta",
    "inventory/item-1/updatedByUid": "device-user",
  }))

  await assertFails(update(ref(db), {
    "transactions/tx-device-bad-operator": {
      id: "tx-device-bad-operator",
      type: "in",
      productName: "Busi",
      productBarcode: "8990001",
      quantity: 1,
      reason: "Auto IN dari scanner",
      operator: "Dashboard",
      operatorUid: "device-user",
      operationId: "operation-device-bad-operator",
      timestamp: now,
    },
  }))
})

test("revoked or mismatched device is denied", async () => {
  const missing = device("missing-device", "ESP32-1234ABCD")
  await assertFails(get(ref(missing, "inventory")))
  const wrong = device("device-user", "ESP32-FFFFFFFF")
  await assertFails(set(ref(wrong, "devices/ESP32-FFFFFFFF"), {status: "online", lastSeen: Date.now()}))
})

test("scan identity fields are immutable when operator marks processed", async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    await set(ref(context.database(), "scans/scan-1"), {
      barcode: "8990001",
      deviceId: "ESP32-1234ABCD",
      timestamp: 100,
      mode: "inventory",
      type: "inventory_scan",
      processed: false,
    })
  })
  const db = human("operator-1", "operator")
  await assertSucceeds(update(ref(db, "scans/scan-1"), {
    processed: true,
    processedAt: Date.now(),
    processedByUid: "operator-1",
    operationId: "operation-scan-1",
  }))
  await assertFails(update(ref(db, "scans/scan-1"), {barcode: "changed"}))
})

test("device reads only its own OTA command and writes only its own OTA status", async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.database()
    await set(ref(db, "deviceCommands/ESP32-1234ABCD/ota"), {
      commandId: "cmd-1",
      version: "6.4.0",
      binaryUrl: "https://example.com/firmware.bin",
      size: 1200000,
      sha256: "a".repeat(64),
      signature: "sig",
      issuedAt: 100,
    })
    await set(ref(db, "deviceCommands/ESP32-FFFFFFFF/ota"), {commandId: "cmd-2", version: "6.4.0", issuedAt: 100})
  })
  const db = device()
  const now = Date.now()
  await assertSucceeds(get(ref(db, "deviceCommands/ESP32-1234ABCD/ota")))
  await assertFails(get(ref(db, "deviceCommands/ESP32-FFFFFFFF/ota")))
  await assertFails(set(ref(db, "deviceCommands/ESP32-1234ABCD/ota"), {commandId: "x", version: "6.4.0", issuedAt: now}))
  await assertSucceeds(set(ref(db, "deviceOtaStatus/ESP32-1234ABCD"), {
    phase: "downloading",
    progress: 40,
    updatedAt: now,
    version: "6.4.1",
    commandId: "cmd-1",
    message: "Downloading",
  }))
  await assertFails(set(ref(db, "deviceOtaStatus/ESP32-FFFFFFFF"), {phase: "downloading", updatedAt: now}))
  await assertFails(set(ref(db, "deviceOtaStatus/ESP32-1234ABCD"), {phase: "haxor", updatedAt: now}))
  await assertFails(set(ref(db, "deviceOtaStatus/ESP32-1234ABCD"), {phase: "success", updatedAt: now, price: 1}))
})

test("admin can read OTA status but cannot forge a device command or status", async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    await set(ref(context.database(), "deviceOtaStatus/ESP32-1234ABCD"), {phase: "success", version: "6.4.0", updatedAt: 100})
  })
  const admin = human("admin-1", "admin")
  await assertSucceeds(get(ref(admin, "deviceOtaStatus/ESP32-1234ABCD")))
  await assertFails(set(ref(admin, "deviceCommands/ESP32-1234ABCD/ota"), {commandId: "x", version: "6.4.0", issuedAt: Date.now()}))
  await assertFails(set(ref(admin, "deviceOtaStatus/ESP32-1234ABCD"), {phase: "success", updatedAt: Date.now()}))
})

test("audit logs are admin-readable and immutable to every client", async () => {
  await assertSucceeds(get(ref(human("admin-1", "admin"), "auditLogs")))
  await assertFails(get(ref(human("viewer-1", "viewer"), "auditLogs")))
  await assertFails(set(ref(human("admin-1", "admin"), "auditLogs/client-write"), {timestamp: Date.now()}))
  assert.ok(true)
})
