#!/bin/bash

# Quick test script to verify device status API is working
echo "🧪 Testing Device Status API"
echo "============================="

# Wait for server to start (if running in background)
echo "⏰ Waiting for server..."
sleep 5

# Test the device status API
echo "📡 Testing device status check API..."
RESPONSE=$(curl -s -w "%{http_code}" -X POST "http://localhost:3000/api/check-device-status" \
  -H "Content-Type: application/json" \
  -H "X-Internal-Call: true")

HTTP_CODE="${RESPONSE: -3}"
BODY="${RESPONSE%???}"

echo "📊 HTTP Response Code: $HTTP_CODE"
echo "📄 Response Body: $BODY"

if [ "$HTTP_CODE" = "200" ]; then
  echo "✅ API is working correctly!"
else
  echo "❌ API returned error code: $HTTP_CODE"
  echo "Response: $BODY"
fi

echo ""
echo "🔍 Testing with curl verbose for debugging..."
curl -v -X POST "http://localhost:3000/api/check-device-status" \
  -H "Content-Type: application/json" \
  -H "X-Internal-Call: true"
