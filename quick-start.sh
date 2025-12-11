#!/bin/bash

# ============================================
# QUICK START - macOS/Linux Version
# ============================================
# Assumes system is already set up, just restarts services

echo ""
echo "========================================"
echo "QUICK START - Restarting Services"
echo "========================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# Clean previous processes
echo -e "${YELLOW}Cleaning previous processes...${NC}"
for PORT in 8545 3000; do
    PID=$(lsof -ti:$PORT 2>/dev/null)
    if [ ! -z "$PID" ]; then
        kill -9 $PID 2>/dev/null
        echo -e "${GREEN}[OK] Killed process on port $PORT${NC}"
    fi
done
sleep 2

# Start blockchain
echo ""
echo -e "${YELLOW}Starting blockchain...${NC}"
if [[ "$OSTYPE" == "darwin"* ]]; then
    osascript -e 'tell app "Terminal" to do script "cd '"$PWD"' && npx hardhat node"'
else
    gnome-terminal -- bash -c "cd $PWD && npx hardhat node; exec bash" 2>/dev/null || \
    xterm -e "cd $PWD && npx hardhat node" 2>/dev/null &
fi

sleep 10

# Deploy contracts
echo -e "${YELLOW}Deploying contracts...${NC}"
npx hardhat run scripts/deploy.ts --network localhost

# Start API
echo ""
echo -e "${YELLOW}Starting API server...${NC}"
if [[ "$OSTYPE" == "darwin"* ]]; then
    osascript -e 'tell app "Terminal" to do script "cd '"$PWD/api"' && pnpm start"'
else
    gnome-terminal -- bash -c "cd $PWD/api && pnpm start; exec bash" 2>/dev/null || \
    xterm -e "cd $PWD/api && pnpm start" 2>/dev/null &
fi

sleep 15

# Verify
echo ""
if curl -s http://localhost:3000/health > /dev/null 2>&1; then
    echo -e "${GREEN}[OK] System is running!${NC}"
    echo "  Blockchain: http://127.0.0.1:8545"
    echo "  API: http://localhost:3000"
else
    echo -e "${RED}[ERROR] System failed to start${NC}"
fi
echo ""
