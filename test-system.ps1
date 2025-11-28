# Simple Test Script for Decentralized Cloud Access Control
# Run this script to test your system

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  System Testing Script" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Check if server is running
Write-Host "Step 1: Checking if server is running..." -ForegroundColor Yellow
try {
    $health = Invoke-WebRequest -Uri http://localhost:3000/health -UseBasicParsing -TimeoutSec 3
    $healthData = $health.Content | ConvertFrom-Json
    Write-Host "✅ Server is running!" -ForegroundColor Green
    Write-Host "   Status: $($healthData.status)" -ForegroundColor White
    Write-Host "   FROST: $($healthData.services.frost)" -ForegroundColor $(if($healthData.services.frost -eq "operational"){"Green"}else{"Yellow"})
    Write-Host "   AWS: $($healthData.services.aws)" -ForegroundColor $(if($healthData.services.aws -eq "operational"){"Green"}else{"Yellow"})
    Write-Host "   Blockchain: $($healthData.services.blockchain)" -ForegroundColor $(if($healthData.services.blockchain -eq "operational"){"Green"}else{"Yellow"})
} catch {
    Write-Host "❌ Server is NOT running!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please start the server first:" -ForegroundColor Yellow
    Write-Host "  1. Open a NEW PowerShell window" -ForegroundColor White
    Write-Host "  2. Run: cd D:\projects\Ravitejs" -ForegroundColor White
    Write-Host "  3. Run: pnpm api:start" -ForegroundColor Green
    Write-Host "  4. Wait for 'API Gateway server running on port 3000'" -ForegroundColor White
    Write-Host "  5. Then run this script again" -ForegroundColor White
    Write-Host ""
    exit 1
}

Write-Host ""

# Step 2: Test FROST Configuration
Write-Host "Step 2: Testing FROST Configuration..." -ForegroundColor Yellow
try {
    $config = Invoke-WebRequest -Uri http://localhost:3000/api/frost/config -UseBasicParsing -TimeoutSec 5
    $configData = $config.Content | ConvertFrom-Json
    Write-Host "✅ FROST Configuration: Threshold=$($configData.threshold), Participants=$($configData.participants)" -ForegroundColor Green
} catch {
    Write-Host "❌ FROST Config failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# Step 3: Test FROST Participants
Write-Host "Step 3: Testing FROST Participants..." -ForegroundColor Yellow
try {
    $participants = Invoke-WebRequest -Uri http://localhost:3000/api/frost/participants -UseBasicParsing -TimeoutSec 5
    $participantsData = $participants.Content | ConvertFrom-Json
    Write-Host "✅ FROST Participants: $($participantsData.Count) participants found" -ForegroundColor Green
} catch {
    Write-Host "❌ FROST Participants failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# Step 4: Test Authorization (Main Function)
Write-Host "Step 4: Testing Authorization Endpoint..." -ForegroundColor Yellow
$body = @{
    principal = "arn:aws:iam::123456789012:user/testuser"
    resource = "arn:aws:s3:::test-bucket/test-object.txt"
    action = "s3:GetObject"
    signatureShares = @()
} | ConvertTo-Json

try {
    $response = Invoke-WebRequest -Uri http://localhost:3000/api/authorize `
        -Method POST `
        -Body $body `
        -ContentType "application/json" `
        -UseBasicParsing `
        -TimeoutSec 10
    
    $result = $response.Content | ConvertFrom-Json
    Write-Host "✅ Authorization Request Successful!" -ForegroundColor Green
    Write-Host "   Request ID: $($result.requestId)" -ForegroundColor Cyan
    Write-Host "   Authorized: $($result.authorized)" -ForegroundColor $(if($result.authorized){"Green"}else{"Yellow"})
    Write-Host "   AWS Decision: $($result.awsDecision.allowed)" -ForegroundColor $(if($result.awsDecision.allowed){"Green"}else{"Yellow"})
    
    if ($result.awsDecision.reason) {
        Write-Host "   AWS Reason: $($result.awsDecision.reason)" -ForegroundColor Yellow
    }
    
    if ($result.blockchainResult) {
        Write-Host "   Blockchain: $($result.blockchainResult.authorized)" -ForegroundColor Cyan
    }
} catch {
    Write-Host "❌ Authorization failed: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "   Response: $responseBody" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Testing Complete!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "  - To run automated tests: pnpm run test:all-api" -ForegroundColor White
Write-Host "  - To see detailed guide: Read STEP_BY_STEP_TESTING.md" -ForegroundColor White
Write-Host ""

