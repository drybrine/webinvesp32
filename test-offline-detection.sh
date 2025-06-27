#!/bin/bash

# Test script to verify offline device detection
# This script tests that devices are properly marked as offline when they stop sending heartbeats

DEVICE_ID="ESP32-TEST-OFFLINE"
API_URL="http://localhost:3000/api/heartbeat"
STATUS_CHECK_URL="http://localhost:3000/api/check-device-status"

echo "🧪 Testing Offline Device Detection"
echo "=================================="
echo "Device ID: $DEVICE_ID"
echo "API URL: $API_URL"
echo ""

# Step 1: Send a heartbeat to create the device
echo "📡 Step 1: Sending initial heartbeat to create device..."
HEARTBEAT_PAYLOAD=$(cat <<EOF
{
  "deviceId": "$DEVICE_ID",
  "uptime": 60000,
  "freeHeap": 250000,
  "scanCount": 5,
  "version": "3.1"
}
EOF
)

RESPONSE=$(curl -s -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -d "$HEARTBEAT_PAYLOAD")

echo "✅ Initial heartbeat sent"
echo "📊 Response: $RESPONSE"
echo ""

# Step 2: Wait for device to be considered offline (2+ minutes)
echo "⏰ Step 2: Waiting 3 minutes for device to be considered offline..."
echo "    (Device timeout is set to 2 minutes)"

for i in {1..180}; do
  if [ $((i % 30)) -eq 0 ]; then
    echo "    ... $i seconds elapsed ($(($i/60)) minutes)"
  fi
  sleep 1
done

echo ""

# Step 3: Call device status check API to update statuses
echo "🔍 Step 3: Calling device status check API to update offline status..."
STATUS_RESPONSE=$(curl -s -X POST "$STATUS_CHECK_URL" \
  -H "Content-Type: application/json")

echo "✅ Device status check completed"
echo "📊 Status Response: $STATUS_RESPONSE"
echo ""

# Step 4: Verify device is marked as offline by checking the database
echo "🔎 Step 4: Verifying device status in database..."
echo "   (You can check the Firebase console or the device status page)"
echo ""

# Step 5: Send another heartbeat to bring device back online
echo "🔄 Step 5: Sending heartbeat to bring device back online..."
ONLINE_PAYLOAD=$(cat <<EOF
{
  "deviceId": "$DEVICE_ID",
  "uptime": 120000,
  "freeHeap": 240000,
  "scanCount": 8,
  "version": "3.1"
}
EOF
)

ONLINE_RESPONSE=$(curl -s -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -d "$ONLINE_PAYLOAD")

echo "✅ Online heartbeat sent"
echo "📊 Response: $ONLINE_RESPONSE"
echo ""

# Step 6: Call device status check again to update to online
echo "🔍 Step 6: Calling device status check API again..."
FINAL_STATUS_RESPONSE=$(curl -s -X POST "$STATUS_CHECK_URL" \
  -H "Content-Type: application/json")

echo "✅ Final device status check completed"
echo "📊 Final Status Response: $FINAL_STATUS_RESPONSE"
echo ""

echo "🎯 Test completed! Check the device status page to verify:"
echo "   1. Device was marked as OFFLINE after 3 minutes of no heartbeat"
echo "   2. Device was marked as ONLINE after sending heartbeat again"
echo ""
echo "💡 Access http://localhost:3000/absensi to view device status"
