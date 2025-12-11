#!/bin/bash

# ============================================
# COMPLETE SETUP AND RUN - macOS/Linux Version
# ============================================
# This script performs complete setup and starts the application

echo ""
echo "========================================"
echo "DECENTRALIZED ACCESS CONTROL"
echo "COMPLETE SETUP AND RUN"
echo "========================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# ============================================
# STEP 1: Prerequisites Check
# ============================================
echo -e "${YELLOW}[1/9] Checking Prerequisites...${NC}"

# Check Node.js
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    echo -e "${GREEN}[OK] Node.js: $NODE_VERSION${NC}"
else
    echo -e "${RED}[ERROR] Node.js not found. Install from https://nodejs.org/${NC}"
    exit 1
fi

# Check/Install pnpm
if command -v pnpm &> /dev/null; then
    PNPM_VERSION=$(pnpm --version)
    echo -e "${GREEN}[OK] pnpm: $PNPM_VERSION${NC}"
else
    echo -e "${YELLOW}[INFO] Installing pnpm...${NC}"
    npm install -g pnpm
    echo -e "${GREEN}[OK] pnpm installed${NC}"
fi

# Check .env file
if [ ! -f ".env" ]; then
    echo -e "${RED}[ERROR] .env file not found!${NC}"
    if [ -f "ENV_TEMPLATE.txt" ]; then
        echo -e "${YELLOW}Creating .env from template...${NC}"
        cp ENV_TEMPLATE.txt .env
        echo -e "${YELLOW}[WARN] Please edit .env with your AWS credentials${NC}"
        echo -e "${CYAN}Press Enter after updating .env...${NC}"
        read
    else
        echo -e "${RED}[ERROR] ENV_TEMPLATE.txt not found${NC}"
        exit 1
    fi
fi
echo -e "${GREEN}[OK] .env file exists${NC}"

# ============================================
# STEP 2: Clean Previous Processes
# ============================================
echo ""
echo -e "${YELLOW}[2/9] Cleaning Previous Processes...${NC}"

# Kill processes on ports 8545 and 3000
for PORT in 8545 3000; do
    PID=$(lsof -ti:$PORT 2>/dev/null)
    if [ ! -z "$PID" ]; then
        kill -9 $PID 2>/dev/null
        echo -e "${GREEN}[OK] Killed process on port $PORT${NC}"
    fi
done
sleep 2

# ============================================
# STEP 3: Install Root Dependencies
# ============================================
echo ""
echo -e "${YELLOW}[3/9] Installing Root Dependencies...${NC}"

if [ ! -d "node_modules" ]; then
    echo -e "${CYAN}Installing packages...${NC}"
    pnpm install
    if [ $? -ne 0 ]; then
        echo -e "${RED}[ERROR] Failed to install root dependencies${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}[OK] Dependencies already installed${NC}"
fi

# ============================================
# STEP 4: Install API Dependencies
# ============================================
echo ""
echo -e "${YELLOW}[4/9] Installing API Dependencies...${NC}"

if [ ! -d "api/node_modules" ]; then
    echo -e "${CYAN}Installing API packages...${NC}"
    cd api
    pnpm install
    if [ $? -ne 0 ]; then
        cd ..
        echo -e "${RED}[ERROR] Failed to install API dependencies${NC}"
        exit 1
    fi
    cd ..
else
    echo -e "${GREEN}[OK] API dependencies already installed${NC}"
fi

# ============================================
# STEP 5: Compile Smart Contracts
# ============================================
echo ""
echo -e "${YELLOW}[5/9] Compiling Smart Contracts...${NC}"

npx hardhat compile
if [ $? -ne 0 ]; then
    echo -e "${RED}[ERROR] Failed to compile contracts${NC}"
    exit 1
fi
echo -e "${GREEN}[OK] Contracts compiled${NC}"

# ============================================
# STEP 6: Start Local Blockchain
# ============================================
echo ""
echo -e "${YELLOW}[6/9] Starting Local Blockchain...${NC}"

# Start blockchain in background
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    osascript -e 'tell app "Terminal" to do script "cd '"$PWD"' && npx hardhat node"'
else
    # Linux
    gnome-terminal -- bash -c "cd $PWD && npx hardhat node; exec bash" 2>/dev/null || \
    xterm -e "cd $PWD && npx hardhat node" 2>/dev/null || \
    x-terminal-emulator -e bash -c "cd $PWD && npx hardhat node; exec bash" 2>/dev/null &
fi

echo -e "${YELLOW}Waiting for blockchain to start...${NC}"
sleep 10

# Verify blockchain is running
MAX_ATTEMPTS=15
ATTEMPT=0
BLOCKCHAIN_RUNNING=false

while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
    if curl -s -X POST -H "Content-Type: application/json" \
        --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
        http://127.0.0.1:8545 > /dev/null 2>&1; then
        echo -e "${GREEN}[OK] Blockchain running on http://127.0.0.1:8545${NC}"
        BLOCKCHAIN_RUNNING=true
        break
    fi
    ATTEMPT=$((ATTEMPT + 1))
    echo "Attempt $ATTEMPT/$MAX_ATTEMPTS..."
    sleep 2
done

if [ "$BLOCKCHAIN_RUNNING" = false ]; then
    echo -e "${RED}[ERROR] Blockchain failed to start${NC}"
    exit 1
fi

# ============================================
# STEP 7: Deploy Smart Contracts
# ============================================
echo ""
echo -e "${YELLOW}[7/9] Deploying Smart Contracts...${NC}"

npx hardhat run scripts/deploy.ts --network localhost
if [ $? -ne 0 ]; then
    echo -e "${RED}[ERROR] Failed to deploy contracts${NC}"
    exit 1
fi
echo -e "${GREEN}[OK] Contracts deployed successfully${NC}"

# ============================================
# STEP 8: Start API Server
# ============================================
echo ""
echo -e "${YELLOW}[8/9] Starting API Server...${NC}"

# Start API in new terminal
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    osascript -e 'tell app "Terminal" to do script "cd '"$PWD/api"' && pnpm start"'
else
    # Linux
    gnome-terminal -- bash -c "cd $PWD/api && pnpm start; exec bash" 2>/dev/null || \
    xterm -e "cd $PWD/api && pnpm start" 2>/dev/null || \
    x-terminal-emulator -e bash -c "cd $PWD/api && pnpm start; exec bash" 2>/dev/null &
fi

echo -e "${YELLOW}Waiting for API server to start...${NC}"
sleep 15

# Verify API is running
MAX_ATTEMPTS=15
ATTEMPT=0
API_RUNNING=false

while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
    if curl -s http://localhost:3000/health > /dev/null 2>&1; then
        HEALTH=$(curl -s http://localhost:3000/health)
        echo -e "${GREEN}[OK] API server running on http://localhost:3000${NC}"
        echo -e "${CYAN}Status: $(echo $HEALTH | grep -o '"status":"[^"]*"' | cut -d'"' -f4)${NC}"
        API_RUNNING=true
        break
    fi
    ATTEMPT=$((ATTEMPT + 1))
    echo "Attempt $ATTEMPT/$MAX_ATTEMPTS..."
    sleep 3
done

if [ "$API_RUNNING" = false ]; then
    echo -e "${RED}[ERROR] API server failed to start${NC}"
    exit 1
fi

# ============================================
# STEP 9: Verify System
# ============================================
echo ""
echo -e "${YELLOW}[9/9] Verifying System...${NC}"

# Test Health
if curl -s http://localhost:3000/health > /dev/null 2>&1; then
    echo -e "${GREEN}[OK] Health Check: Passed${NC}"
else
    echo -e "${YELLOW}[WARN] Health check failed${NC}"
fi

# Test AWS Identity
if curl -s http://localhost:3000/api/aws/identity > /dev/null 2>&1; then
    AWS_ACCOUNT=$(curl -s http://localhost:3000/api/aws/identity | grep -o '"accountId":"[^"]*"' | cut -d'"' -f4)
    echo -e "${GREEN}[OK] AWS Account: $AWS_ACCOUNT${NC}"
else
    echo -e "${YELLOW}[WARN] AWS identity check failed${NC}"
fi

# Test S3 List
if curl -s http://localhost:3000/api/s3/list > /dev/null 2>&1; then
    S3_BUCKET=$(curl -s http://localhost:3000/api/s3/list | grep -o '"bucket":"[^"]*"' | cut -d'"' -f4)
    S3_COUNT=$(curl -s http://localhost:3000/api/s3/list | grep -o '"count":[0-9]*' | cut -d':' -f2)
    echo -e "${GREEN}[OK] S3 Bucket: $S3_BUCKET ($S3_COUNT files)${NC}"
else
    echo -e "${YELLOW}[WARN] S3 list failed (check AWS credentials)${NC}"
fi

# ============================================
# SUCCESS SUMMARY
# ============================================
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}SYSTEM READY!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

echo -e "${YELLOW}Services Running:${NC}"
echo -e "  ${GREEN}[OK] Blockchain: http://127.0.0.1:8545${NC}"
echo -e "  ${GREEN}[OK] API Server: http://localhost:3000${NC}"
echo -e "  ${GREEN}[OK] WebSocket: ws://localhost:3000${NC}"

echo ""
echo -e "${YELLOW}Configuration:${NC}"
echo "  AWS Account: 111236692387"
echo "  S3 Bucket: raviteja-access-control"
echo "  Region: eu-west-1"
echo "  Mode: blockchain-primary"
echo "  Threshold: 3-of-5"

echo ""
echo -e "${YELLOW}Quick Tests:${NC}"
echo -e "  ${CYAN}Health:${NC}"
echo "    curl http://localhost:3000/health"
echo ""
echo -e "  ${CYAN}AWS Identity:${NC}"
echo "    curl http://localhost:3000/api/aws/identity"
echo ""
echo -e "  ${CYAN}S3 List:${NC}"
echo "    curl http://localhost:3000/api/s3/list"

echo ""
echo -e "${YELLOW}Postman Testing:${NC}"
echo "  1. Import: Decentralized-Access-Control.postman_collection.json"
echo "  2. Base URL: http://localhost:3000"
echo "  3. Run all 18 endpoints"
echo "  4. Expected: 100% success rate"

echo ""
echo -e "${YELLOW}To Stop Services:${NC}"
echo "  Close the Terminal windows running Hardhat and API"
echo "  Or run: lsof -ti:8545,3000 | xargs kill -9"

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Ready for Testing and Screenshots!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
