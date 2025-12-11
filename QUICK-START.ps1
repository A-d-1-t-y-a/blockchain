# ============================================
# QUICK START - For Running Already Setup Project
# Use this if you've already run COMPLETE-SETUP.ps1
# ============================================

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "QUICK START - Decentralized Access Control" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Check if .env exists
if (-not (Test-Path ".env")) {
    Write-Host "✗ .env file not found!" -ForegroundColor Red
    Write-Host "Please run COMPLETE-SETUP.ps1 first" -ForegroundColor Yellow
    exit 1
}

# Check if contracts are compiled
if (-not (Test-Path "artifacts")) {
    Write-Host "✗ Contracts not compiled!" -ForegroundColor Red
    Write-Host "Please run COMPLETE-SETUP.ps1 first" -ForegroundColor Yellow
    exit 1
}

Write-Host "[1/3] Starting Hardhat blockchain..." -ForegroundColor Yellow

# Kill existing processes
$existingBlockchain = Get-NetTCPConnection -LocalPort 8545 -ErrorAction SilentlyContinue
if ($existingBlockchain) {
    Stop-Process -Id $existingBlockchain.OwningProcess -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
}

Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD'; npx hardhat node"
Start-Sleep -Seconds 8

Write-Host "✓ Blockchain started" -ForegroundColor Green

Write-Host "`n[2/3] Deploying contracts..." -ForegroundColor Yellow
npx hardhat run scripts/deploy.ts --network localhost
Write-Host "✓ Contracts deployed" -ForegroundColor Green

Write-Host "`n[3/3] Starting API server..." -ForegroundColor Yellow

$existingAPI = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
if ($existingAPI) {
    Stop-Process -Id $existingAPI.OwningProcess -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
}

Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD\api'; npm start"
Start-Sleep -Seconds 6

Write-Host "✓ API server started" -ForegroundColor Green

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "SYSTEM READY!" -ForegroundColor Green
Write-Host "========================================`n" -ForegroundColor Cyan

Write-Host "Blockchain: http://127.0.0.1:8545" -ForegroundColor White
Write-Host "API Server: http://localhost:3000" -ForegroundColor White
Write-Host "Health:     http://localhost:3000/health`n" -ForegroundColor White

Write-Host "Test with:" -ForegroundColor Yellow
Write-Host "  curl http://localhost:3000/health" -ForegroundColor White
Write-Host ""
