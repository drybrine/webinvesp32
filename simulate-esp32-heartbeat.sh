#!/bin/bash

# Simulasi ESP32 Heartbeat untuk Testing
# Script ini akan mengirim heartbeat secara berkala ke API

DEVICE_ID="ESP32-5fbf713c"
API_URL="http://localhost:3000/api/heartbeat"

echo "🔄 Starting ESP32 Heartbeat Simulation..."
echo "Device ID: $DEVICE_ID"
echo "API URL: $API_URL"
echo "Press Ctrl+C to stop"
echo ""

# Counter untuk uptime
UPTIME=0

while true; do
  # Increment uptime
  UPTIME=$((UPTIME + 30000))
  
  # Generate random values untuk simulasi
  FREE_HEAP=$((200000 + RANDOM % 50000))
  SCAN_COUNT=$((RANDOM % 10))
  
  # Prepare JSON payload
  JSON_PAYLOAD=$(cat <<EOF
{
  "deviceId": "$DEVICE_ID",
  "uptime": $UPTIME,
  "freeHeap": $FREE_HEAP,
  "scanCount": $SCAN_COUNT,
  "version": "3.1"
}
EOF
)

  echo "$(date '+%H:%M:%S') - Sending heartbeat..."
  
  # Send heartbeat
  RESPONSE=$(curl -s -X POST "$API_URL" \
    -H "Content-Type: application/json" \
    -d "$JSON_PAYLOAD")
  
  if [ $? -eq 0 ]; then
    echo "✅ Heartbeat sent successfully"
    echo "📊 Response: $RESPONSE"
  else
    echo "❌ Failed to send heartbeat"
  fi
  
  echo "---"
  
  # Wait 30 seconds before next heartbeat
  sleep 30
done
