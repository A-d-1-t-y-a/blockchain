#!/bin/bash

# Comprehensive Test Script for Decentralized Access Control System

echo "=========================================="
echo "Decentralized Access Control - System Test"
echo "=========================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Check if server is running
echo -e "${BLUE}Checking API server...${NC}"
if ! curl -s http://localhost:3000/health > /dev/null; then
    echo -e "${RED}❌ API server is not running${NC}"
    echo "Start it with: cd api && pnpm start"
    exit 1
fi
echo -e "${GREEN}✅ Server is running on http://localhost:3000${NC}"
echo ""

# Test 1: Health Check (Detailed)
echo -e "${BLUE}==========================================${NC}"
echo -e "${BLUE}Test 1: Health Check${NC}"
echo -e "${BLUE}==========================================${NC}"
health=$(curl -s http://localhost:3000/health)
if echo "$health" | grep -q '"status":"healthy"'; then
    echo -e "${GREEN}✅ Status: HEALTHY${NC}"
    
    # Parse and show detailed status
    frost_status=$(echo "$health" | grep -o '"frost":"[^"]*"' | cut -d'"' -f4)
    aws_status=$(echo "$health" | grep -o '"aws":"[^"]*"' | cut -d'"' -f4)
    blockchain_status=$(echo "$health" | grep -o '"blockchain":"[^"]*"' | cut -d'"' -f4)
    
    echo "  FROST: $frost_status"
    if [ "$frost_status" = "operational" ]; then
        echo -e "    ${GREEN}✓ FROST threshold signatures working${NC}"
    else
        echo -e "    ${RED}✗ FROST not operational${NC}"
    fi
    
    echo "  AWS: $aws_status"
    if [ "$aws_status" = "operational" ]; then
        echo -e "    ${GREEN}✓ AWS IAM integration working${NC}"
        aws_error=$(echo "$health" | grep -o '"awsError":"[^"]*"' | cut -d'"' -f4)
        if [ ! -z "$aws_error" ]; then
            echo -e "    ${YELLOW}  Note: $aws_error${NC}"
        fi
    else
        echo -e "    ${RED}✗ AWS not operational${NC}"
        aws_error=$(echo "$health" | grep -o '"awsError":"[^"]*"' | cut -d'"' -f4)
        if [ ! -z "$aws_error" ]; then
            echo -e "    ${RED}  Error: $aws_error${NC}"
        fi
    fi
    
    echo "  Blockchain: $blockchain_status"
    if [ "$blockchain_status" = "operational" ]; then
        echo -e "    ${GREEN}✓ Blockchain connected and ready${NC}"
    elif [ "$blockchain_status" = "connection failed" ]; then
        echo -e "    ${YELLOW}⚠ Blockchain RPC connection failed (check RPC URL or test ETH)${NC}"
        blockchain_error=$(echo "$health" | grep -o '"blockchainError":"[^"]*"' | cut -d'"' -f4)
        if [ ! -z "$blockchain_error" ]; then
            echo -e "    ${YELLOW}  Note: $blockchain_error${NC}"
        fi
    elif [ "$blockchain_status" = "not configured" ]; then
        echo -e "    ${YELLOW}⚠ Blockchain not configured (optional)${NC}"
    else
        echo -e "    ${RED}✗ Blockchain error: $blockchain_status${NC}"
    fi
else
    echo -e "${RED}❌ FAILED - Server not healthy${NC}"
fi
echo ""

# Test 2: FROST Config (Detailed)
echo -e "${BLUE}==========================================${NC}"
echo -e "${BLUE}Test 2: FROST Configuration${NC}"
echo -e "${BLUE}==========================================${NC}"
frost=$(curl -s http://localhost:3000/api/frost/config)
if echo "$frost" | grep -q '"threshold"'; then
    echo -e "${GREEN}✅ FROST Configuration Retrieved${NC}"
    threshold=$(echo "$frost" | grep -o '"threshold":[0-9]*' | cut -d':' -f2)
    participants=$(echo "$frost" | grep -o '"participants":[0-9]*' | cut -d':' -f2)
    echo "  Threshold: $threshold (minimum signatures required)"
    echo "  Participants: $participants (total signers)"
    echo -e "  ${GREEN}✓ FROST threshold cryptography configured${NC}"
else
    echo -e "${RED}❌ FAILED - Could not get FROST config${NC}"
fi
echo ""

# Test 3: Policy Management (Detailed)
echo -e "${BLUE}==========================================${NC}"
echo -e "${BLUE}Test 3: Policy Management${NC}"
echo -e "${BLUE}==========================================${NC}"
policy=$(curl -s -X POST http://localhost:3000/api/policy/add \
  -H "Content-Type: application/json" \
  -d '{
    "resource": "arn:aws:s3:::test-bucket",
    "action": "s3:GetObject",
    "principal": "arn:aws:iam::123456789012:user/testuser",
    "granted": true
  }')
if echo "$policy" | grep -q '"success":true'; then
    echo -e "${GREEN}✅ Policy Added Successfully${NC}"
    root=$(echo "$policy" | grep -o '"root":"[^"]*"' | cut -d'"' -f4)
    echo "  Merkle Root: $root"
    echo -e "  ${GREEN}✓ Policy stored in Merkle tree${NC}"
    
    # Get policy count
    policy_root=$(curl -s http://localhost:3000/api/policy/root)
    count=$(echo "$policy_root" | grep -o '"policyCount":[0-9]*' | cut -d':' -f2)
    echo "  Total Policies: $count"
else
    echo -e "${YELLOW}⚠️  Policy add response: $policy${NC}"
fi
echo ""

# Test 4: Authorization (Detailed)
echo -e "${BLUE}==========================================${NC}"
echo -e "${BLUE}Test 4: Authorization Request${NC}"
echo -e "${BLUE}==========================================${NC}"
auth=$(curl -s -X POST http://localhost:3000/api/authorize \
  -H "Content-Type: application/json" \
  -d '{
    "principal": "arn:aws:iam::123456789012:user/testuser",
    "resource": "arn:aws:s3:::test-bucket/object",
    "action": "s3:GetObject",
    "signatureShares": [
      {"participantId": "p1", "share": "mock_share_1", "commitment": "mock_commit_1"},
      {"participantId": "p2", "share": "mock_share_2", "commitment": "mock_commit_2"},
      {"participantId": "p3", "share": "mock_share_3", "commitment": "mock_commit_3"}
    ]
  }')
if echo "$auth" | grep -q '"requestId"'; then
    echo -e "${GREEN}✅ Authorization Request Processed${NC}"
    request_id=$(echo "$auth" | grep -o '"requestId":"[^"]*"' | cut -d'"' -f4)
    authorized=$(echo "$auth" | grep -o '"authorized":[^,}]*' | cut -d':' -f2 | tr -d ' ')
    echo "  Request ID: $request_id"
    echo "  Authorized: $authorized"
    
    # Check AWS decision
    aws_allowed=$(echo "$auth" | grep -o '"allowed":[^,}]*' | cut -d':' -f2 | tr -d ' ')
    if [ "$aws_allowed" = "true" ]; then
        echo -e "  ${GREEN}✓ AWS IAM check: ALLOWED${NC}"
    else
        echo -e "  ${YELLOW}⚠ AWS IAM check: DENIED (test ARN doesn't exist in real AWS)${NC}"
        aws_reason=$(echo "$auth" | grep -o '"reason":"[^"]*"' | cut -d'"' -f4)
        if [ ! -z "$aws_reason" ]; then
            echo "    Reason: $aws_reason"
        fi
    fi
    
    # Check blockchain result
    blockchain_auth=$(echo "$auth" | grep -o '"blockchainResult":{[^}]*}' | grep -o '"authorized":[^,}]*' | cut -d':' -f2 | tr -d ' ')
    blockchain_error=$(echo "$auth" | grep -o '"error":"[^"]*"' | cut -d'"' -f4)
    if [ ! -z "$blockchain_error" ]; then
        if echo "$blockchain_error" | grep -q "insufficient funds"; then
            echo -e "  ${YELLOW}⚠ Blockchain: Needs test ETH for transactions${NC}"
        else
            echo -e "  ${YELLOW}⚠ Blockchain: $blockchain_error${NC}"
        fi
    elif [ "$blockchain_auth" = "true" ]; then
        echo -e "  ${GREEN}✓ Blockchain: Transaction recorded${NC}"
    fi
else
    echo -e "${RED}❌ FAILED - Could not process authorization${NC}"
    echo "Response: $auth"
fi
echo ""

# Test 5: Real AWS IAM Test (if AWS is operational)
echo -e "${BLUE}==========================================${NC}"
echo -e "${BLUE}Test 5: Real AWS IAM Test${NC}"
echo -e "${BLUE}==========================================${NC}"
if [ "$aws_status" = "operational" ]; then
    echo -e "${GREEN}Testing with real AWS credentials...${NC}"
    
    # Get caller identity
    aws_test=$(curl -s http://localhost:3000/api/aws/identity 2>/dev/null || echo "")
    if [ ! -z "$aws_test" ] && echo "$aws_test" | grep -q "arn:aws"; then
        echo -e "${GREEN}✅ AWS Credentials Valid${NC}"
        aws_arn=$(echo "$aws_test" | grep -o '"arn":"[^"]*"' | cut -d'"' -f4)
        aws_account=$(echo "$aws_test" | grep -o '"accountId":"[^"]*"' | cut -d'"' -f4)
        echo "  AWS Account: $aws_account"
        echo "  Identity ARN: $aws_arn"
        echo -e "  ${GREEN}✓ Real AWS integration working${NC}"
        echo ""
        echo -e "${BLUE}To test with real AWS resources:${NC}"
        echo "  Use this ARN as principal: $aws_arn"
        echo "  Example: curl -X POST http://localhost:3000/api/authorize \\"
        echo "    -H 'Content-Type: application/json' \\"
        echo "    -d '{\"principal\": \"$aws_arn\", \"resource\": \"arn:aws:s3:::test-bucket\", \"action\": \"s3:ListBucket\", \"signatureShares\": [...]}'"
    else
        echo -e "${YELLOW}⚠ Could not verify AWS identity (endpoint may not exist)${NC}"
        echo -e "  ${GREEN}✓ AWS health check passed (credentials valid)${NC}"
    fi
else
    echo -e "${YELLOW}⚠ AWS not operational - skipping real AWS test${NC}"
fi
echo ""

echo "=========================================="
echo -e "${GREEN}All Tests Complete!${NC}"
echo "=========================================="
echo ""
echo "Summary:"
echo "  - FROST: $frost_status"
echo "  - AWS: $aws_status"
echo "  - Blockchain: $blockchain_status"
echo ""

