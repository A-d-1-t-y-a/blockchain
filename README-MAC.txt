================================================================================
DECENTRALIZED CLOUD ACCESS CONTROL SYSTEM - macOS/Linux Guide
================================================================================

Author: Ravi Teja Gandu (x24111490)
Project: Research in Computing CA2
Institution: National College of Ireland
Date: December 11, 2025

================================================================================
QUICK START (macOS/Linux)
================================================================================

FIRST TIME SETUP:
  chmod +x setup-and-run.sh
  ./setup-and-run.sh

SUBSEQUENT RUNS:
  chmod +x quick-start.sh
  ./quick-start.sh

RUN TESTS:
  chmod +x test-system.sh
  ./test-system.sh

================================================================================
AVAILABLE SCRIPTS
================================================================================

1. setup-and-run.sh (RECOMMENDED)
   - Complete setup and run in one command
   - Installs dependencies
   - Compiles contracts
   - Starts blockchain and API
   - Verifies system

2. quick-start.sh
   - Quick restart (assumes already set up)
   - Starts blockchain and API only

3. test-system.sh
   - Automated testing
   - Tests all endpoints
   - Shows success rate

================================================================================
WINDOWS vs macOS/Linux SCRIPTS
================================================================================

Windows (PowerShell):
  - SETUP-AND-RUN.ps1
  - QUICK-START.ps1
  - TEST-SYSTEM.ps1
  - RUN-APP.ps1
  - COMPLETE-SETUP.ps1

macOS/Linux (Bash):
  - setup-and-run.sh
  - quick-start.sh
  - test-system.sh

All scripts do the same thing, just different syntax!

================================================================================
PREREQUISITES (macOS/Linux)
================================================================================

1. Node.js (v16 or higher)
   macOS: brew install node
   Linux: sudo apt install nodejs npm

2. pnpm (Package Manager)
   npm install -g pnpm

3. Git (Optional)
   macOS: brew install git
   Linux: sudo apt install git

4. AWS CLI (Optional)
   macOS: brew install awscli
   Linux: sudo apt install awscli

================================================================================
MAKING SCRIPTS EXECUTABLE
================================================================================

Before running any .sh script, make it executable:

  chmod +x setup-and-run.sh
  chmod +x quick-start.sh
  chmod +x test-system.sh

Or make all executable at once:
  chmod +x *.sh

================================================================================
SYSTEM CONFIGURATION
================================================================================

AWS Account: 111236692387
Region: eu-west-1
S3 Bucket: raviteja-access-control

IAM Users:
  - alice (arn:aws:iam::111236692387:user/alice)
  - bob (arn:aws:iam::111236692387:user/bob)
  - admin (arn:aws:iam::111236692387:user/admin)

Blockchain: Local Hardhat (http://127.0.0.1:8545)
API Server: http://localhost:3000
Authorization Mode: blockchain-primary
FROST Threshold: 3-of-5

================================================================================
TERMINAL BEHAVIOR
================================================================================

macOS:
  - Scripts open new Terminal windows automatically
  - One for Hardhat blockchain
  - One for API server
  - Keep both windows open!

Linux:
  - Scripts try to use gnome-terminal, xterm, or x-terminal-emulator
  - If none available, processes run in background
  - Check with: ps aux | grep node

================================================================================
STOPPING SERVICES
================================================================================

Option 1: Close Terminal Windows
  - Close the Hardhat terminal window
  - Close the API terminal window

Option 2: Kill by Port
  lsof -ti:8545,3000 | xargs kill -9

Option 3: Kill All Node Processes
  pkill -f node

================================================================================
TROUBLESHOOTING (macOS/Linux)
================================================================================

Issue: "Permission denied"
Solution: Make script executable
  chmod +x setup-and-run.sh

Issue: "Port already in use"
Solution: Kill processes on ports
  lsof -ti:8545,3000 | xargs kill -9

Issue: "command not found: pnpm"
Solution: Install pnpm
  npm install -g pnpm

Issue: "Cannot find module"
Solution: Reinstall dependencies
  rm -rf node_modules api/node_modules
  ./setup-and-run.sh

Issue: Terminal doesn't open (Linux)
Solution: Install terminal emulator
  sudo apt install gnome-terminal
  # or
  sudo apt install xterm

================================================================================
TESTING
================================================================================

Quick Health Check:
  curl http://localhost:3000/health

AWS Identity:
  curl http://localhost:3000/api/aws/identity

S3 List:
  curl http://localhost:3000/api/s3/list

Full Test Suite:
  ./test-system.sh

Authorization Test:
  curl -X POST http://localhost:3000/api/authorize \
    -H "Content-Type: application/json" \
    -d '{
      "principal": "arn:aws:iam::111236692387:user/alice",
      "resource": "s3://raviteja-access-control/test.txt",
      "action": "read",
      "cloudProvider": "aws"
    }'

================================================================================
POSTMAN TESTING
================================================================================

Collection File: Decentralized-Access-Control.postman_collection.json

Import Steps:
1. Open Postman
2. Click "Import"
3. Select the collection JSON file
4. All 18 endpoints are pre-configured

Base URL: http://localhost:3000
Expected Success Rate: 100%

================================================================================
DIRECTORY STRUCTURE
================================================================================

.
├── contracts/              # Smart contracts
├── api/                    # API server
│   ├── src/
│   │   ├── server.ts
│   │   └── services/
│   └── package.json
├── scripts/                # Deployment scripts
├── .env                    # Configuration (create from ENV_TEMPLATE.txt)
├── setup-and-run.sh       # Main setup script (macOS/Linux)
├── quick-start.sh         # Quick restart (macOS/Linux)
├── test-system.sh         # Test script (macOS/Linux)
├── SETUP-AND-RUN.ps1      # Main setup script (Windows)
├── QUICK-START.ps1        # Quick restart (Windows)
└── TEST-SYSTEM.ps1        # Test script (Windows)

================================================================================
ENVIRONMENT VARIABLES (.env)
================================================================================

Required variables:
  BLOCKCHAIN_RPC_URL=http://127.0.0.1:8545
  PRIVATE_KEY=<your_private_key>
  AWS_ACCESS_KEY_ID=<your_aws_key>
  AWS_SECRET_ACCESS_KEY=<your_aws_secret>
  AWS_REGION=eu-west-1
  S3_BUCKET=raviteja-access-control
  AUTHORIZATION_MODE=blockchain-primary
  THRESHOLD=3
  TOTAL_PARTICIPANTS=5

================================================================================
PERFORMANCE METRICS
================================================================================

Success Rate: 100% (18/18 endpoints)
Gas Usage: ~256,000 gas (consistent)
Response Time: <2 seconds
Authorization Mode: blockchain-primary
Threshold: 3-of-5 Byzantine fault tolerance

================================================================================
PLATFORM-SPECIFIC NOTES
================================================================================

macOS:
  - Uses osascript to open Terminal windows
  - Requires Terminal.app
  - Works on Intel and Apple Silicon (M1/M2)

Linux:
  - Tries gnome-terminal first
  - Falls back to xterm
  - Falls back to x-terminal-emulator
  - Install preferred terminal emulator

Both:
  - Use bash shell
  - Require curl for testing
  - Port management via lsof

================================================================================
CROSS-PLATFORM COMPATIBILITY
================================================================================

The project works on:
  ✓ Windows (PowerShell scripts)
  ✓ macOS (Bash scripts)
  ✓ Linux (Bash scripts)

All platforms:
  - Same functionality
  - Same API endpoints
  - Same Postman collection
  - Same test results

================================================================================
SUPPORT
================================================================================

Health Check: http://localhost:3000/health
API Endpoints: http://localhost:3000/api
WebSocket: ws://localhost:3000
Blockchain RPC: http://127.0.0.1:8545

For Windows users: See README.txt
For macOS/Linux users: This file!

================================================================================
END OF macOS/Linux GUIDE
================================================================================
