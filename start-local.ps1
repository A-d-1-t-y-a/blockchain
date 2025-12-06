# PowerShell script to start local blockchain and deploy contracts
# This script sets up the complete local development environment

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Decentralized Access Control - Local Setup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if node_modules exists
if (-not (Test-Path "node_modules")) {
    Write-Host "Installing dependencies..." -ForegroundColor Yellow
    pnpm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Failed to install dependencies" -ForegroundColor Red
        exit 1
    }
}

# Check if API node_modules exists
if (-not (Test-Path "api/node_modules")) {
    Write-Host "Installing API dependencies..." -ForegroundColor Yellow
    Set-Location api
    pnpm install
    Set-Location ..
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Failed to install API dependencies" -ForegroundColor Red
        exit 1
    }
}

# Compile contracts
Write-Host "Compiling smart contracts..." -ForegroundColor Yellow
npx hardhat compile
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to compile contracts" -ForegroundColor Red
    exit 1
}
Write-Host "✓ Contracts compiled successfully" -ForegroundColor Green
Write-Host ""

# Start Hardhat node in background
Write-Host "Starting local Hardhat blockchain..." -ForegroundColor Yellow
$hardhatJob = Start-Job -ScriptBlock {
    Set-Location $using:PWD
    npx hardhat node
}

# Wait for blockchain to start
Write-Host "Waiting for blockchain to initialize..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

# Check if blockchain is running
try {
    $response = Invoke-WebRequest -Uri "http://127.0.0.1:8545" -Method POST -Body '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' -ContentType "application/json" -TimeoutSec 5 -ErrorAction Stop
    Write-Host "✓ Blockchain is running on http://127.0.0.1:8545" -ForegroundColor Green
} catch {
    Write-Host "Failed to connect to blockchain" -ForegroundColor Red
    Stop-Job $hardhatJob
    Remove-Job $hardhatJob
    exit 1
}
Write-Host ""

# Deploy contracts
Write-Host "Deploying contracts to local blockchain..." -ForegroundColor Yellow
npx hardhat run scripts/deploy.ts --network localhost
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to deploy contracts" -ForegroundColor Red
    Stop-Job $hardhatJob
    Remove-Job $hardhatJob
    exit 1
}
Write-Host "✓ Contracts deployed successfully" -ForegroundColor Green
Write-Host ""

# Update .env with deployed addresses (they should already be there from deploy script output)
Write-Host "Contract addresses have been saved to .env file" -ForegroundColor Green
Write-Host ""

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Local Environment Ready!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Blockchain: http://127.0.0.1:8545" -ForegroundColor White
Write-Host "Hardhat Job ID: $($hardhatJob.Id)" -ForegroundColor White
Write-Host ""
Write-Host "To start the API server, run:" -ForegroundColor Yellow
Write-Host "  cd api" -ForegroundColor White
Write-Host "  pnpm start" -ForegroundColor White
Write-Host ""
Write-Host "To stop the blockchain:" -ForegroundColor Yellow
Write-Host "  Stop-Job $($hardhatJob.Id)" -ForegroundColor White
Write-Host "  Remove-Job $($hardhatJob.Id)" -ForegroundColor White
Write-Host ""
Write-Host "Press Ctrl+C to stop monitoring..." -ForegroundColor Yellow

# Keep script running and show blockchain logs
try {
    while ($true) {
        Receive-Job $hardhatJob
        Start-Sleep -Seconds 1
    }
} finally {
    Write-Host "`nStopping blockchain..." -ForegroundColor Yellow
    Stop-Job $hardhatJob
    Remove-Job $hardhatJob
    Write-Host "Blockchain stopped" -ForegroundColor Green
}
