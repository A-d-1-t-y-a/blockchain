# Simple PowerShell script to set up and run the complete system
# This handles everything in the correct order

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "Decentralized Access Control - Complete Setup" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Step 1: Install dependencies
Write-Host "[1/6] Installing dependencies..." -ForegroundColor Yellow
if (-not (Test-Path "node_modules")) {
    pnpm install
}
if (-not (Test-Path "api/node_modules")) {
    Set-Location api
    pnpm install
    Set-Location ..
}
Write-Host "✓ Dependencies installed`n" -ForegroundColor Green

# Step 2: Compile contracts
Write-Host "[2/6] Compiling smart contracts..." -ForegroundColor Yellow
npx hardhat compile
Write-Host "✓ Contracts compiled`n" -ForegroundColor Green

# Step 3: Start Hardhat node
Write-Host "[3/6] Starting local blockchain..." -ForegroundColor Yellow
Write-Host "Opening new terminal for Hardhat node..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD'; npx hardhat node"
Write-Host "Waiting for blockchain to start..." -ForegroundColor Yellow
Start-Sleep -Seconds 8

# Step 4: Deploy contracts
Write-Host "`n[4/6] Deploying contracts..." -ForegroundColor Yellow
npx hardhat run scripts/deploy.ts --network localhost
Write-Host "✓ Contracts deployed`n" -ForegroundColor Green

# Step 5: Start API server
Write-Host "[5/6] Starting API server..." -ForegroundColor Yellow
Write-Host "Opening new terminal for API server..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD\api'; pnpm start"
Write-Host "Waiting for API server to start..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

# Step 6: Run tests
Write-Host "`n[6/6] System is ready!" -ForegroundColor Green
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "All Services Running!" -ForegroundColor Green
Write-Host "========================================`n" -ForegroundColor Cyan

Write-Host "Blockchain:  http://127.0.0.1:8545" -ForegroundColor White
Write-Host "API Server:  http://localhost:3000" -ForegroundColor White
Write-Host "Health Check: http://localhost:3000/health`n" -ForegroundColor White

Write-Host "To test the system, run:" -ForegroundColor Yellow
Write-Host "  .\test.sh" -ForegroundColor White
Write-Host "  (or use Git Bash if available)`n" -ForegroundColor White

Write-Host "Press any key to exit..." -ForegroundColor Yellow
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
