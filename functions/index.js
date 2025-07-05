const {onSchedule} = require("firebase-functions/v2/scheduler");
const {initializeApp} = require("firebase-admin/app");
const {getDatabase} = require("firebase-admin/database");

initializeApp();

// Fungsi yang berjalan setiap 30 detik untuk mengecek status perangkat
exports.checkDeviceStatus = onSchedule("every 30 seconds", async (event) => {
  const db = getDatabase();
  const devicesRef = db.ref("devices");
  
  try {
    const snapshot = await devicesRef.once("value");
    const devices = snapshot.val();
    
    if (!devices) {
      console.log("No devices found");
      return;
    }

    const now = Date.now();
    const updates = {};
    
    Object.keys(devices).forEach((deviceId) => {
      const device = devices[deviceId];
      const lastSeen = device.lastSeen;
      
      // Jika device belum pernah kirim heartbeat atau terakhir kirim > 30 detik
      if (!lastSeen || (now - lastSeen) > 30000) {
        if (device.status !== "offline") {
          updates[`${deviceId}/status`] = "offline";
          console.log(`Setting device ${deviceId} to offline`);
        }
      } else {
        // Jika device masih aktif dalam 30 detik terakhir
        if (device.status !== "online") {
          updates[`${deviceId}/status`] = "online";
          console.log(`Setting device ${deviceId} to online`);
        }
      }
    });

    // Update semua perubahan status sekaligus
    if (Object.keys(updates).length > 0) {
      await devicesRef.update(updates);
      console.log(`Updated ${Object.keys(updates).length} device statuses`);
    }
    
  } catch (error) {
    console.error("Error checking device status:", error);
  }
});