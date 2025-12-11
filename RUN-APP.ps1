# ============================================
# RUN APPLICATION - Complete Startup Script
# ============================================
# This script checks all prerequisites and starts the entire system

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "DECENTRALIZED ACCESS CONTROL - STARTUP" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# ============================================
# STEP 1: Check Prerequisites
# ============================================
Write-Host "[1/6] Checking Prerequisites..." -ForegroundColor Yellow

# Check Node.js
try {
    $nodeVersion = node --version
    Write-Host "[OK] Node.js installed: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "[ERROR] Node.js not found. Please install Node.js first." -ForegroundColor Red
    exit 1
}

# Check npm/pnpm
try {
    $pnpmVersion = pnpm --version
    Write-Host "[OK] pnpm installed: $pnpmVersion" -ForegroundColor Green
} catch {
    Write-Host "[WARN] pnpm not found. Installing pnpm..." -ForegroundColor Yellow
    npm install -g pnpm
}

# Check if .env exists
if (-not (Test-Path ".env")) {
    Write-Host "[ERROR] .env file not found!" -ForegroundColor Red
    Write-Host "Please create .env file from ENV_TEMPLATE.txt" -ForegroundColor Yellow
    exit 1
} else {
    Write-Host "[OK] .env file found" -ForegroundColor Green
}

# ============================================
# STEP 2: Install Dependencies
# ============================================
Write-Host "`n[2/6] Installing Dependencies..." -ForegroundColor Yellow

# Root dependencies
if (-not (Test-Path "node_modules")) {
    Write-Host "Installing root dependencies..." -ForegroundColor Cyan
    pnpm install
} else {
    Write-Host "[OK] Root dependencies already installed" -ForegroundColor Green
}

# API dependencies
if (-not (Test-Path "api/node_modules")) {
    Write-Host "Installing API dependencies..." -ForegroundColor Cyan
    Set-Location api
    pnpm install
    Set-Location ..
} else {
    Write-Host "[OK] API dependencies already installed" -ForegroundColor Green
}

# ============================================
# STEP 3: Compile Smart Contracts
# ============================================
Write-Host "`n[3/6] Compiling Smart Contracts..." -ForegroundColor Yellow

if (-not (Test-Path "artifacts")) {
    Write-Host "Compiling contracts..." -ForegroundColor Cyan
    npx hardhat compile
} else {
    Write-Host "[OK] Contracts already compiled" -ForegroundColor Green
}

# ============================================
# STEP 4: Start Blockchain
# ============================================
Write-Host "`n[4/6] Starting Local Blockchain..." -ForegroundColor Yellow

# Check if blockchain is already running
try {
    $response = Invoke-WebRequest -Uri "http://127.0.0.1:8545" -Method POST -Body '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' -ContentType "application/json" -TimeoutSec 2 -ErrorAction Stop
    Write-Host "[OK] Blockchain already running" -ForegroundColor Green
    $blockchainRunning = $true
} catch {
    Write-Host "Starting Hardhat node..." -ForegroundColor Cyan
    $blockchainRunning = $false
    
    # Start blockchain in background
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "npx hardhat node" -WindowStyle Normal
    
    Write-Host "Waiting for blockchain to start..." -ForegroundColor Yellow
    Start-Sleep -Seconds 10
    
    # Verify blockchain started
    $maxAttempts = 10
    $attempt = 0
    while ($attempt -lt $maxAttempts) {
        try {
            $response = Invoke-WebRequest -Uri "http://127.0.0.1:8545" -Method POST -Body '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' -ContentType "application/json" -TimeoutSec 2 -ErrorAction Stop
            Write-Host "[OK] Blockchain is running!" -ForegroundColor Green
            $blockchainRunning = $true
            break
        } catch {
            $attempt++
            Write-Host "Attempt $attempt/$maxAttempts..." -ForegroundColor Gray
            Start-Sleep -Seconds 2
        }
    }
    
    if (-not $blockchainRunning) {
        Write-Host "[ERROR] Failed to start blockchain" -ForegroundColor Red
        exit 1
    }
}

# ============================================
# STEP 5: Deploy Smart Contracts
# ============================================
Write-Host "`n[5/6] Deploying Smart Contracts..." -ForegroundColor Yellow

# Check if contracts are already deployed
$envContent = Get-Content .env -Raw
if ($envContent -match "ACCESS_CONTROL_ADDRESS=0x[a-fA-F0-9]{40}") {
    Write-Host "[INFO] Contracts appear to be deployed" -ForegroundColor Cyan
    Write-Host "Do you want to redeploy? (y/n): " -NoNewline -ForegroundColor Yellow
    $redeploy = Read-Host
    
    if ($redeploy -eq "y") {
        Write-Host "Deploying contracts..." -ForegroundColor Cyan
        npx hardhat run scripts/deploy.ts --network localhost
    } else {
        Write-Host "[OK] Using existing deployment" -ForegroundColor Green
    }
} else {
    Write-Host "Deploying contracts..." -ForegroundColor Cyan
    npx hardhat run scripts/deploy.ts --network localhost
}

# ============================================
# STEP 6: Start API Server
# ============================================
Write-Host "`n[6/6] Starting API Server..." -ForegroundColor Yellow

# Check if API is already running
try {
    $health = Invoke-RestMethod -Uri "http://localhost:3000/health" -TimeoutSec 2 -ErrorAction Stop
    Write-Host "[OK] API server already running" -ForegroundColor Green
    Write-Host "Status: $($health.status)" -ForegroundColor Cyan
} catch {
    Write-Host "Starting API server..." -ForegroundColor Cyan
    
    # Start API in new window
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd api; pnpm start" -WindowStyle Normal
    
    Write-Host "Waiting for API server to start..." -ForegroundColor Yellow
    Start-Sleep -Seconds 15
    
    # Verify API started
    $maxAttempts = 10
    $attempt = 0
    $apiRunning = $false
    
    while ($attempt -lt $maxAttempts) {
        try {
            $health = Invoke-RestMethod -Uri "http://localhost:3000/health" -TimeoutSec 2 -ErrorAction Stop
            Write-Host "[OK] API server is running!" -ForegroundColor Green
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
        Write-Host "[ERROR] Failed to start API server" -ForegroundColor Red
        exit 1
    }
}

# ============================================
# SYSTEM STATUS
# ============================================
Write-Host "`n========================================" -ForegroundColor Green
Write-Host "SYSTEM READY!" -ForegroundColor Green
Write-Host "========================================`n" -ForegroundColor Green

Write-Host "Services Running:" -ForegroundColor Yellow
Write-Host "  [OK] Blockchain: http://127.0.0.1:8545" -ForegroundColor Green
Write-Host "  [OK] API Server: http://localhost:3000" -ForegroundColor Green
Write-Host "  [OK] WebSocket: ws://localhost:3000" -ForegroundColor Green

Write-Host "`nQuick Tests:" -ForegroundColor Yellow
Write-Host "  Health Check:" -ForegroundColor Cyan
Write-Host "    curl http://localhost:3000/health" -ForegroundColor White
Write-Host "`n  AWS Identity:" -ForegroundColor Cyan
Write-Host "    curl http://localhost:3000/api/aws/identity" -ForegroundColor White
Write-Host "`n  S3 List:" -ForegroundColor Cyan
Write-Host "    curl http://localhost:3000/api/s3/list" -ForegroundColor White

Write-Host "`nPostman Collection:" -ForegroundColor Yellow
Write-Host "  Import: Decentralized-Access-Control.postman_collection.json" -ForegroundColor White
Write-Host "  Base URL: http://localhost:3000" -ForegroundColor White

Write-Host "`nConfiguration:" -ForegroundColor Yellow
Write-Host "  AWS Account: 111236692387" -ForegroundColor White
Write-Host "  S3 Bucket: raviteja-access-control" -ForegroundColor White
Write-Host "  Region: eu-west-1" -ForegroundColor White
Write-Host "  Mode: blockchain-primary" -ForegroundColor White
Write-Host "  Threshold: 3-of-5" -ForegroundColor White

Write-Host "`nTo Stop Services:" -ForegroundColor Yellow
Write-Host "  Close the Hardhat and API terminal windows" -ForegroundColor White
Write-Host "  Or run: Get-Process | Where-Object {$_.ProcessName -match 'node'} | Stop-Process" -ForegroundColor White

Write-Host "`n========================================" -ForegroundColor Green
Write-Host "Ready for Testing and Screenshots!" -ForegroundColor Green
Write-Host "========================================`n" -ForegroundColor Green
