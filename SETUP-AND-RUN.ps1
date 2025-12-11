# ============================================
# COMPLETE SETUP AND RUN - All-in-One Script
# ============================================
# This script performs complete setup and starts the application

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "DECENTRALIZED ACCESS CONTROL" -ForegroundColor Cyan
Write-Host "COMPLETE SETUP AND RUN" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# ============================================
# STEP 1: Prerequisites Check
# ============================================
Write-Host "[1/9] Checking Prerequisites..." -ForegroundColor Yellow

# Check Node.js
try {
    $nodeVersion = node --version
    Write-Host "[OK] Node.js: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "[ERROR] Node.js not found. Install from https://nodejs.org/" -ForegroundColor Red
    exit 1
}

# Check/Install pnpm
try {
    $pnpmVersion = pnpm --version
    Write-Host "[OK] pnpm: $pnpmVersion" -ForegroundColor Green
} catch {
    Write-Host "[INFO] Installing pnpm..." -ForegroundColor Yellow
    npm install -g pnpm
    Write-Host "[OK] pnpm installed" -ForegroundColor Green
}

# Check .env file
if (-not (Test-Path ".env")) {
    Write-Host "[ERROR] .env file not found!" -ForegroundColor Red
    Write-Host "Creating .env from template..." -ForegroundColor Yellow
    
    if (Test-Path "ENV_TEMPLATE.txt") {
        Copy-Item "ENV_TEMPLATE.txt" ".env"
        Write-Host "[WARN] Please edit .env with your AWS credentials" -ForegroundColor Yellow
        Write-Host "Press Enter after updating .env..." -ForegroundColor Cyan
        Read-Host
    } else {
        Write-Host "[ERROR] ENV_TEMPLATE.txt not found" -ForegroundColor Red
        exit 1
    }
}
Write-Host "[OK] .env file exists" -ForegroundColor Green

# ============================================
# STEP 2: Clean Previous Processes
# ============================================
Write-Host "`n[2/9] Cleaning Previous Processes..." -ForegroundColor Yellow

# Kill processes on ports 8545 and 3000
$ports = @(8545, 3000)
foreach ($port in $ports) {
    $connections = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    if ($connections) {
        foreach ($conn in $connections) {
            try {
                Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
                Write-Host "[OK] Killed process on port $port" -ForegroundColor Green
            } catch {
                Write-Host "[WARN] Could not kill process on port $port" -ForegroundColor Yellow
            }
        }
    }
}
Start-Sleep -Seconds 2

# ============================================
# STEP 3: Install Root Dependencies
# ============================================
Write-Host "`n[3/9] Installing Root Dependencies..." -ForegroundColor Yellow

if (-not (Test-Path "node_modules")) {
    Write-Host "Installing packages..." -ForegroundColor Cyan
    pnpm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Failed to install root dependencies" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "[OK] Dependencies already installed" -ForegroundColor Green
}

# ============================================
# STEP 4: Install API Dependencies
# ============================================
Write-Host "`n[4/9] Installing API Dependencies..." -ForegroundColor Yellow

if (-not (Test-Path "api/node_modules")) {
    Write-Host "Installing API packages..." -ForegroundColor Cyan
    Set-Location api
    pnpm install
    if ($LASTEXITCODE -ne 0) {
        Set-Location ..
        Write-Host "[ERROR] Failed to install API dependencies" -ForegroundColor Red
        exit 1
    }
    Set-Location ..
} else {
    Write-Host "[OK] API dependencies already installed" -ForegroundColor Green
}

# ============================================
# STEP 5: Compile Smart Contracts
# ============================================
Write-Host "`n[5/9] Compiling Smart Contracts..." -ForegroundColor Yellow

npx hardhat compile
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Failed to compile contracts" -ForegroundColor Red
    exit 1
}
Write-Host "[OK] Contracts compiled" -ForegroundColor Green

# ============================================
# STEP 6: Start Local Blockchain
# ============================================
Write-Host "`n[6/9] Starting Local Blockchain..." -ForegroundColor Yellow

# Start blockchain in new window
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD'; npx hardhat node" -WindowStyle Normal

Write-Host "Waiting for blockchain to start..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

# Verify blockchain is running
$maxAttempts = 15
$attempt = 0
$blockchainRunning = $false

while ($attempt -lt $maxAttempts) {
    try {
        $response = Invoke-WebRequest -Uri "http://127.0.0.1:8545" -Method POST -Body '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' -ContentType "application/json" -TimeoutSec 2 -ErrorAction Stop
        Write-Host "[OK] Blockchain running on http://127.0.0.1:8545" -ForegroundColor Green
        $blockchainRunning = $true
        break
    } catch {
        $attempt++
        Write-Host "Attempt $attempt/$maxAttempts..." -ForegroundColor Gray
        Start-Sleep -Seconds 2
    }
}

if (-not $blockchainRunning) {
    Write-Host "[ERROR] Blockchain failed to start" -ForegroundColor Red
    exit 1
}

# ============================================
# STEP 7: Deploy Smart Contracts
# ============================================
Write-Host "`n[7/9] Deploying Smart Contracts..." -ForegroundColor Yellow

npx hardhat run scripts/deploy.ts --network localhost
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Failed to deploy contracts" -ForegroundColor Red
    exit 1
}
Write-Host "[OK] Contracts deployed successfully" -ForegroundColor Green

# ============================================
# STEP 8: Start API Server
# ============================================
Write-Host "`n[8/9] Starting API Server..." -ForegroundColor Yellow

# Start API in new window
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD\api'; pnpm start" -WindowStyle Normal

Write-Host "Waiting for API server to start..." -ForegroundColor Yellow
Start-Sleep -Seconds 15

# Verify API is running
$maxAttempts = 15
$attempt = 0
$apiRunning = $false

while ($attempt -lt $maxAttempts) {
    try {
        $health = Invoke-RestMethod -Uri "http://localhost:3000/health" -TimeoutSec 2 -ErrorAction Stop
        Write-Host "[OK] API server running on http://localhost:3000" -ForegroundColor Green
        Write-Host "Status: $($health.status)" -ForegroundColor Cyan
        $apiRunning = $true
        break
    } catch {
        $attempt++
        Write-Host "Attempt $attempt/$maxAttempts..." -ForegroundColor Gray
        Start-Sleep -Seconds 3
    }
}

if (-not $apiRunning) {
    Write-Host "[ERROR] API server failed to start" -ForegroundColor Red
    exit 1
}

# ============================================
# STEP 9: Verify System
# ============================================
Write-Host "`n[9/9] Verifying System..." -ForegroundColor Yellow

# Test Health
try {
    $health = Invoke-RestMethod -Uri "http://localhost:3000/health"
    Write-Host "[OK] Health Check: $($health.status)" -ForegroundColor Green
} catch {
    Write-Host "[WARN] Health check failed" -ForegroundColor Yellow
}

# Test AWS Identity
try {
    $identity = Invoke-RestMethod -Uri "http://localhost:3000/api/aws/identity"
    Write-Host "[OK] AWS Account: $($identity.accountId)" -ForegroundColor Green
} catch {
    Write-Host "[WARN] AWS identity check failed" -ForegroundColor Yellow
}

# Test S3 List
try {
    $s3 = Invoke-RestMethod -Uri "http://localhost:3000/api/s3/list"
    Write-Host "[OK] S3 Bucket: $($s3.bucket) ($($s3.count) files)" -ForegroundColor Green
} catch {
    Write-Host "[WARN] S3 list failed (check AWS credentials)" -ForegroundColor Yellow
}

# ============================================
# SUCCESS SUMMARY
# ============================================
Write-Host "`n========================================" -ForegroundColor Green
Write-Host "SYSTEM READY!" -ForegroundColor Green
Write-Host "========================================`n" -ForegroundColor Green

Write-Host "Services Running:" -ForegroundColor Yellow
Write-Host "  [OK] Blockchain: http://127.0.0.1:8545" -ForegroundColor Green
Write-Host "  [OK] API Server: http://localhost:3000" -ForegroundColor Green
Write-Host "  [OK] WebSocket: ws://localhost:3000" -ForegroundColor Green

Write-Host "`nConfiguration:" -ForegroundColor Yellow
Write-Host "  AWS Account: 111236692387" -ForegroundColor White
Write-Host "  S3 Bucket: raviteja-access-control" -ForegroundColor White
Write-Host "  Region: eu-west-1" -ForegroundColor White
Write-Host "  Mode: blockchain-primary" -ForegroundColor White
Write-Host "  Threshold: 3-of-5" -ForegroundColor White

Write-Host "`nQuick Tests:" -ForegroundColor Yellow
Write-Host "  Health:" -ForegroundColor Cyan
Write-Host "    curl http://localhost:3000/health" -ForegroundColor White
Write-Host "`n  AWS Identity:" -ForegroundColor Cyan
Write-Host "    curl http://localhost:3000/api/aws/identity" -ForegroundColor White
Write-Host "`n  S3 List:" -ForegroundColor Cyan
Write-Host "    curl http://localhost:3000/api/s3/list" -ForegroundColor White
Write-Host "`n  Authorization Test:" -ForegroundColor Cyan
Write-Host '    $body = @{' -ForegroundColor White
Write-Host '        principal = "arn:aws:iam::111236692387:user/alice"' -ForegroundColor White
Write-Host '        resource = "s3://raviteja-access-control/test.txt"' -ForegroundColor White
Write-Host '        action = "read"' -ForegroundColor White
Write-Host '        cloudProvider = "aws"' -ForegroundColor White
Write-Host '    } | ConvertTo-Json' -ForegroundColor White
Write-Host '    Invoke-RestMethod -Uri "http://localhost:3000/api/authorize" -Method POST -Body $body -ContentType "application/json"' -ForegroundColor White

Write-Host "`nPostman Testing:" -ForegroundColor Yellow
Write-Host "  1. Import: Decentralized-Access-Control.postman_collection.json" -ForegroundColor White
Write-Host "  2. Base URL: http://localhost:3000" -ForegroundColor White
Write-Host "  3. Run all 18 endpoints" -ForegroundColor White
Write-Host "  4. Expected: 100% success rate" -ForegroundColor White

Write-Host "`nTo Run Tests:" -ForegroundColor Yellow
Write-Host "  .\TEST-SYSTEM.ps1" -ForegroundColor Cyan

Write-Host "`nTo Stop Services:" -ForegroundColor Yellow
Write-Host "  Close the Hardhat and API terminal windows" -ForegroundColor White
Write-Host "  Or run:" -ForegroundColor White
Write-Host "    Get-Process | Where-Object {`$_.ProcessName -match 'node'} | Stop-Process" -ForegroundColor Cyan

Write-Host "`nRunning Services:" -ForegroundColor Yellow
Write-Host "  - Hardhat Node (separate window)" -ForegroundColor White
Write-Host "  - API Server (separate window)" -ForegroundColor White
Write-Host "  - Keep both windows open!" -ForegroundColor White

Write-Host "`n========================================" -ForegroundColor Green
Write-Host "Ready for Testing and Screenshots!" -ForegroundColor Green
Write-Host "========================================`n" -ForegroundColor Green
