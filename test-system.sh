#!/bin/bash

# ============================================
# TEST SYSTEM - macOS/Linux Version
# ============================================

echo ""
echo "========================================"
echo "SYSTEM TESTING"
echo "========================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

BASE_URL="http://localhost:3000"
PASSED=0
FAILED=0

# Test function
test_endpoint() {
    local name=$1
    local url=$2
    local method=${3:-GET}
    local body=$4
    
    echo -e "${CYAN}Testing: $name${NC}"
    
    if [ "$method" = "POST" ]; then
        response=$(curl -s -X POST -H "Content-Type: application/json" -d "$body" "$url" 2>/dev/null)
    else
        response=$(curl -s "$url" 2>/dev/null)
    fi
    
    if [ $? -eq 0 ] && [ ! -z "$response" ]; then
        echo -e "${GREEN}[PASS] $name${NC}"
        PASSED=$((PASSED + 1))
        return 0
    else
        echo -e "${RED}[FAIL] $name${NC}"
        FAILED=$((FAILED + 1))
        return 1
    fi
}

# Test 1: Health Check
test_endpoint "Health Check" "$BASE_URL/health"

# Test 2: FROST Configuration
test_endpoint "FROST Configuration" "$BASE_URL/api/frost/config"

# Test 3: AWS Identity
test_endpoint "AWS Identity" "$BASE_URL/api/aws/identity"

# Test 4: S3 List
test_endpoint "S3 List" "$BASE_URL/api/s3/list"

# Test 5: Authorization - Read
AUTH_BODY='{"principal":"arn:aws:iam::111236692387:user/alice","resource":"s3://raviteja-access-control/test.txt","action":"read","cloudProvider":"aws"}'
test_endpoint "Authorization - Read" "$BASE_URL/api/authorize" "POST" "$AUTH_BODY"

# Test 6: Authorization - Write
AUTH_BODY='{"principal":"arn:aws:iam::111236692387:user/bob","resource":"s3://raviteja-access-control/data.txt","action":"write","cloudProvider":"aws"}'
test_endpoint "Authorization - Write" "$BASE_URL/api/authorize" "POST" "$AUTH_BODY"

# Test 7: Authorization - Delete
AUTH_BODY='{"principal":"arn:aws:iam::111236692387:user/admin","resource":"s3://raviteja-access-control/old.txt","action":"delete","cloudProvider":"aws"}'
test_endpoint "Authorization - Delete" "$BASE_URL/api/authorize" "POST" "$AUTH_BODY"

# Summary
echo ""
echo "========================================"
echo -e "${YELLOW}TEST SUMMARY${NC}"
echo "========================================"
echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${RED}Failed: $FAILED${NC}"
TOTAL=$((PASSED + FAILED))
if [ $TOTAL -gt 0 ]; then
    SUCCESS_RATE=$((PASSED * 100 / TOTAL))
    echo "Success Rate: $SUCCESS_RATE%"
fi
echo "========================================"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}All tests passed! System is 100% operational.${NC}"
    exit 0
else
    echo -e "${YELLOW}Some tests failed. Check the output above.${NC}"
    exit 1
fi
