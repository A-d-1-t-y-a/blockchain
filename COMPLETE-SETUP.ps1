# ============================================
# COMPLETE SETUP SCRIPT FOR DECENTRALIZED ACCESS CONTROL
# This script sets up everything you need to run the project locally
# ============================================

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "DECENTRALIZED CLOUD ACCESS CONTROL" -ForegroundColor Cyan
Write-Host "Complete Setup & Run Script" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Step 1: Create .env file if it doesn't exist
Write-Host "[1/8] Setting up environment variables..." -ForegroundColor Yellow

if (-not (Test-Path ".env")) {
    Write-Host "Creating .env file from template..." -ForegroundColor Cyan
    
    # Get Hardhat's first account private key (deterministic for local testing)
    $localPrivateKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
    
    # Create .env file with local development settings
    @"
# ============================================
# BLOCKCHAIN CONFIGURATION (LOCAL DEVELOPMENT)
# ============================================

# Local Hardhat Network
SEPOLIA_RPC_URL=http://127.0.0.1:8545
RPC_URL=http://127.0.0.1:8545

# Hardhat Account #0 Private Key (FOR LOCAL TESTING ONLY!)
PRIVATE_KEY=$localPrivateKey

# Etherscan API Key (not needed for local)
ETHERSCAN_API_KEY=

# ============================================
# AWS CONFIGURATION
# ============================================

AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_aws_access_key_id_here
AWS_SECRET_ACCESS_KEY=your_aws_secret_access_key_here
AWS_SESSION_TOKEN=

# S3 Bucket (optional)
S3_BUCKET=ravitejs-demo-bucket

# ============================================
# API SERVER CONFIGURATION
# ============================================

API_PORT=3000
NODE_ENV=development
AUTHORIZATION_MODE=blockchain-primary

# ============================================
# FROST THRESHOLD CONFIGURATION
# ============================================

FROST_THRESHOLD=3
FROST_PARTICIPANTS=5

# ============================================
# SMART CONTRACT ADDRESSES
# (Will be auto-filled after deployment)
# ============================================

ACCESS_CONTROL_ADDRESS=
THRESHOLD_MANAGER_ADDRESS=
FROST_VERIFIER_ADDRESS=

# ============================================
# DEVELOPMENT TOOLS
# ============================================

REPORT_GAS=false
DEPLOY_PROXY=false
"@ | Out-File -FilePath ".env" -Encoding utf8
    
    Write-Host "[OK] .env file created with local development settings" -ForegroundColor Green
} else {
    Write-Host "[OK] .env file already exists" -ForegroundColor Green
}

# Step 2: Install root dependencies
Write-Host "`n[2/8] Installing root dependencies..." -ForegroundColor Yellow
if (-not (Test-Path "node_modules")) {
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Failed to install dependencies" -ForegroundColor Red
        exit 1
    }
}
Write-Host "[OK] Root dependencies installed" -ForegroundColor Green

# Step 3: Install API dependencies
Write-Host "`n[3/8] Installing API dependencies..." -ForegroundColor Yellow
if (-not (Test-Path "api/node_modules")) {
    Set-Location api
    npm install
    Set-Location ..
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Failed to install API dependencies" -ForegroundColor Red
        exit 1
    }
}
Write-Host "[OK] API dependencies installed" -ForegroundColor Green

# Step 4: Compile smart contracts
Write-Host "`n[4/8] Compiling smart contracts..." -ForegroundColor Yellow
npx hardhat compile
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Failed to compile contracts" -ForegroundColor Red
    exit 1
}
Write-Host "[OK] Contracts compiled successfully" -ForegroundColor Green

# Step 5: Start local blockchain
Write-Host "`n[5/8] Starting local Hardhat blockchain..." -ForegroundColor Yellow
Write-Host "Opening new terminal for blockchain node..." -ForegroundColor Cyan

# Kill any existing process on port 8545
$existingProcess = Get-NetTCPConnection -LocalPort 8545 -ErrorAction SilentlyContinue
if ($existingProcess) {
    Write-Host "Killing existing process on port 8545..." -ForegroundColor Yellow
    Stop-Process -Id $existingProcess.OwningProcess -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
}

Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD'; Write-Host 'Starting Hardhat Node...' -ForegroundColor Cyan; npx hardhat node"
Write-Host "Waiting for blockchain to start..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

# Verify blockchain is running
try {
    $response = Invoke-WebRequest -Uri "http://127.0.0.1:8545" -Method POST -Body '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' -ContentType "application/json" -TimeoutSec 5 -ErrorAction Stop
    Write-Host "[OK] Blockchain is running on http://127.0.0.1:8545" -ForegroundColor Green
} catch {
    Write-Host "[ERROR] Failed to connect to blockchain" -ForegroundColor Red
    Write-Host "Please ensure Hardhat node started successfully" -ForegroundColor Yellow
    exit 1
}

# Step 6: Deploy contracts
Write-Host "`n[6/8] Deploying smart contracts..." -ForegroundColor Yellow
npx hardhat run scripts/deploy.ts --network localhost
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Failed to deploy contracts" -ForegroundColor Red
    exit 1
}
Write-Host "[OK] Contracts deployed successfully" -ForegroundColor Green

# Step 7: Start API server
Write-Host "`n[7/8] Starting API server..." -ForegroundColor Yellow
Write-Host "Opening new terminal for API server..." -ForegroundColor Cyan

# Kill any existing process on port 3000
$existingAPI = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
if ($existingAPI) {
    Write-Host "Killing existing process on port 3000..." -ForegroundColor Yellow
    Stop-Process -Id $existingAPI.OwningProcess -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
}

Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD\api'; Write-Host 'Starting API Server...' -ForegroundColor Cyan; npm start"
Write-Host "Waiting for API server to start..." -ForegroundColor Yellow
Start-Sleep -Seconds 8

# Verify API is running
try {
    $healthCheck = Invoke-WebRequest -Uri "http://localhost:3000/health" -TimeoutSec 5 -ErrorAction Stop
    Write-Host "[OK] API server is running on http://localhost:3000" -ForegroundColor Green
} catch {
    Write-Host "[WARN] API server may still be starting..." -ForegroundColor Yellow
}

# Step 8: Display summary
Write-Host "`n[8/8] Setup Complete!" -ForegroundColor Green

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "ALL SERVICES RUNNING!" -ForegroundColor Green
Write-Host "========================================`n" -ForegroundColor Cyan

Write-Host "Blockchain Node:  http://127.0.0.1:8545" -ForegroundColor White
Write-Host "API Server:       http://localhost:3000" -ForegroundColor White
Write-Host "Health Check:     http://localhost:3000/health`n" -ForegroundColor White

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "TESTING THE SYSTEM" -ForegroundColor Yellow
Write-Host "========================================`n" -ForegroundColor Cyan

Write-Host "1. Test Health Endpoint:" -ForegroundColor Yellow
Write-Host "   curl http://localhost:3000/health`n" -ForegroundColor White

Write-Host "2. Test Authorization (Blockchain-Primary Mode):" -ForegroundColor Yellow
Write-Host '   $body = @{' -ForegroundColor White
Write-Host '       principal = "arn:aws:iam::123456789012:user/test-user"' -ForegroundColor White
Write-Host '       resource = "s3://my-bucket/data.txt"' -ForegroundColor White
Write-Host '       action = "read"' -ForegroundColor White
Write-Host '       cloudProvider = "aws"' -ForegroundColor White
Write-Host '   } | ConvertTo-Json' -ForegroundColor White
Write-Host '   Invoke-RestMethod -Uri "http://localhost:3000/api/authorize" -Method POST -Body $body -ContentType "application/json"`n' -ForegroundColor White

Write-Host "3. Test FROST Configuration:" -ForegroundColor Yellow
Write-Host "   curl http://localhost:3000/api/frost/config`n" -ForegroundColor White

Write-Host "4. Test AWS Identity (if AWS credentials configured):" -ForegroundColor Yellow
Write-Host "   curl http://localhost:3000/api/aws/identity`n" -ForegroundColor White

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "IMPORTANT NOTES" -ForegroundColor Yellow
Write-Host "========================================`n" -ForegroundColor Cyan

Write-Host "Authorization Modes:" -ForegroundColor Yellow
Write-Host "   - blockchain-primary: Blockchain is authority (current)" -ForegroundColor White
Write-Host "   - hybrid: Both cloud AND blockchain must approve" -ForegroundColor White
Write-Host "   - cloud-only: Traditional centralized IAM" -ForegroundColor White
Write-Host ""

Write-Host "AWS Credentials:" -ForegroundColor Yellow
Write-Host "   - Edit .env file to add your AWS credentials" -ForegroundColor White
Write-Host "   - For AWS Academy, include AWS_SESSION_TOKEN" -ForegroundColor White
Write-Host "   - System works without AWS (blockchain-only mode)" -ForegroundColor White
Write-Host ""

Write-Host "Blockchain:" -ForegroundColor Yellow
Write-Host "   - Running on local Hardhat network (chainId: 1337)" -ForegroundColor White
Write-Host "   - 10,000 ETH pre-funded test accounts" -ForegroundColor White
Write-Host "   - Contracts auto-deployed and addresses saved to .env" -ForegroundColor White
Write-Host ""

Write-Host "Testing:" -ForegroundColor Yellow
Write-Host "   - Run: npm test (for smart contract tests)" -ForegroundColor White
Write-Host "   - Run: npm run test:api (for API tests)" -ForegroundColor White
Write-Host "   - Run: npm run test:all (for complete test suite)" -ForegroundColor White
Write-Host ""

Write-Host "`nPress any key to exit..." -ForegroundColor Yellow
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
