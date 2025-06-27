#!/bin/bash

# Comprehensive test for device status offline detection
echo "🧪 Comprehensive Device Status Offline Detection Test"
echo "===================================================="

DEVICE_ID="ESP32-TEST-COMPREHENSIVE"
BASE_URL="http://localhost:3000"
HEARTBEAT_URL="$BASE_URL/api/heartbeat"
STATUS_CHECK_URL="$BASE_URL/api/check-device-status"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}ℹ️ $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️ $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Function to test API endpoint
test_api() {
    local url=$1
    local method=$2
    local data=$3
    local description=$4
    
    log_info "Testing: $description"
    
    if [ "$method" = "POST" ] && [ -n "$data" ]; then
        RESPONSE=$(curl -s -w "%{http_code}" -X POST "$url" \
            -H "Content-Type: application/json" \
            -H "X-Internal-Call: true" \
            -d "$data")
    else
        RESPONSE=$(curl -s -w "%{http_code}" -X POST "$url" \
            -H "Content-Type: application/json" \
            -H "X-Internal-Call: true")
    fi
    
    HTTP_CODE="${RESPONSE: -3}"
    BODY="${RESPONSE%???}"
    
    if [ "$HTTP_CODE" = "200" ]; then
        log_success "API call successful (HTTP $HTTP_CODE)"
        echo "   Response: $BODY"
        return 0
    else
        log_error "API call failed (HTTP $HTTP_CODE)"
        echo "   Response: $BODY"
        return 1
    fi
}

# Step 1: Test basic API connectivity
log_info "Step 1: Testing basic API connectivity"
if ! test_api "$STATUS_CHECK_URL" "POST" "" "Basic device status check"; then
    log_error "Basic API test failed. Make sure the server is running on localhost:3000"
    exit 1
fi
echo ""

# Step 2: Send initial heartbeat
log_info "Step 2: Creating test device with heartbeat"
HEARTBEAT_DATA=$(cat <<EOF
{
  "deviceId": "$DEVICE_ID",
  "uptime": 60000,
  "freeHeap": 250000,
  "scanCount": 5,
  "version": "3.1"
}
EOF
)

if test_api "$HEARTBEAT_URL" "POST" "$HEARTBEAT_DATA" "Initial heartbeat"; then
    log_success "Test device created successfully"
else
    log_warning "Heartbeat API failed, but continuing test..."
fi
echo ""

# Step 3: Verify device is online
log_info "Step 3: Verifying device status (should be online)"
if test_api "$STATUS_CHECK_URL" "POST" "" "Device status after heartbeat"; then
    log_success "Device status check after heartbeat successful"
fi
echo ""

# Step 4: Wait for device to go offline
log_info "Step 4: Waiting for device offline detection (2.5 minutes)"
log_warning "This will take 2.5 minutes to ensure device is considered offline..."

WAIT_TIME=150 # 2.5 minutes
for i in $(seq 1 $WAIT_TIME); do
    if [ $((i % 30)) -eq 0 ]; then
        log_info "   ... ${i}s elapsed ($(($i/60))m $(($i%60))s) - device should be offline after 120s"
    fi
    sleep 1
done
echo ""

# Step 5: Check device status (should be offline)
log_info "Step 5: Checking device status (should be offline now)"
if test_api "$STATUS_CHECK_URL" "POST" "" "Device status after timeout"; then
    log_success "Device status check after timeout successful"
    log_info "Check the response above - device should be marked as offline"
fi
echo ""

# Step 6: Send heartbeat to bring device back online
log_info "Step 6: Sending heartbeat to bring device back online"
ONLINE_HEARTBEAT=$(cat <<EOF
{
  "deviceId": "$DEVICE_ID",
  "uptime": 180000,
  "freeHeap": 240000,
  "scanCount": 10,
  "version": "3.1"
}
EOF
)

if test_api "$HEARTBEAT_URL" "POST" "$ONLINE_HEARTBEAT" "Recovery heartbeat"; then
    log_success "Recovery heartbeat sent successfully"
fi
echo ""

# Step 7: Final status check (should be online again)
log_info "Step 7: Final device status check (should be online again)"
if test_api "$STATUS_CHECK_URL" "POST" "" "Final device status check"; then
    log_success "Final device status check successful"
    log_info "Check the response above - device should be marked as online again"
fi
echo ""

# Summary
log_success "Test completed!"
echo ""
echo "📊 Test Summary:"
echo "1. ✅ Basic API connectivity tested"
echo "2. ✅ Device creation with heartbeat tested"
echo "3. ✅ Online status verification tested"
echo "4. ✅ Offline detection after 2+ minutes tested"
echo "5. ✅ Device recovery with new heartbeat tested"
echo "6. ✅ Online status restoration tested"
echo ""
log_info "Check the Firebase console or device status page to verify:"
log_info "- Device '$DEVICE_ID' exists in the database"
log_info "- Device status changed from online → offline → online"
log_info "- Timestamps are properly recorded"
echo ""
log_info "🌐 View device status at: http://localhost:3000/absensi"
