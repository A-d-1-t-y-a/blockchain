# ============================================
# COMPREHENSIVE SYSTEM TEST SCRIPT
# Tests all components of the decentralized access control system
# ============================================

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "SYSTEM TESTING SUITE" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

$baseUrl = "http://localhost:3000"
$testsPassed = 0
$testsFailed = 0

# Helper function to test endpoint
function Test-Endpoint {
    param(
        [string]$Name,
        [string]$Url,
        [string]$Method = "GET",
        [object]$Body = $null
    )
    
    Write-Host "`nTesting: $Name" -ForegroundColor Yellow
    Write-Host "URL: $Url" -ForegroundColor Gray
    
    try {
        if ($Method -eq "POST" -and $Body) {
            $jsonBody = $Body | ConvertTo-Json -Depth 10
            Write-Host "Body: $jsonBody" -ForegroundColor Gray
            $response = Invoke-RestMethod -Uri $Url -Method $Method -Body $jsonBody -ContentType "application/json" -TimeoutSec 10
        } else {
            $response = Invoke-RestMethod -Uri $Url -Method $Method -TimeoutSec 10
        }
        
        Write-Host "[PASSED]" -ForegroundColor Green
        Write-Host "Response:" -ForegroundColor Gray
        $response | ConvertTo-Json -Depth 5 | Write-Host -ForegroundColor Cyan
        $script:testsPassed++
        return $response
    } catch {
        Write-Host "[FAILED]" -ForegroundColor Red
        Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
        $script:testsFailed++
        return $null
    }
}

# Test 1: Health Check
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "TEST 1: Health Check" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Test-Endpoint -Name "Health Endpoint" -Url "$baseUrl/health"

# Test 2: FROST Configuration
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "TEST 2: FROST Configuration" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Test-Endpoint -Name "FROST Config" -Url "$baseUrl/api/frost/config"
Test-Endpoint -Name "FROST Participants" -Url "$baseUrl/api/frost/participants"

# Test 3: Authorization Request (Blockchain-Primary Mode)
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "TEST 3: Authorization Request" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

$authRequest = @{
    principal = "arn:aws:iam::123456789012:user/test-user"
    resource = "s3://my-bucket/data.txt"
    action = "read"
    cloudProvider = "aws"
}

$authResult = Test-Endpoint -Name "Authorization Request" -Url "$baseUrl/api/authorize" -Method "POST" -Body $authRequest

# Test 4: Retrieve Authorization Result
if ($authResult -and $authResult.requestId) {
    Write-Host "`n========================================" -ForegroundColor Cyan
    Write-Host "TEST 4: Retrieve Authorization" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    Test-Endpoint -Name "Get Authorization" -Url "$baseUrl/api/authorize/$($authResult.requestId)"
}

# Test 5: Multiple Authorization Requests
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "TEST 5: Multiple Authorizations" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

$resources = @("s3://bucket1/file1.txt", "s3://bucket2/file2.txt", "s3://bucket3/file3.txt")
foreach ($resource in $resources) {
    $req = @{
        principal = "arn:aws:iam::123456789012:user/test-user"
        resource = $resource
        action = "write"
        cloudProvider = "aws"
    }
    Test-Endpoint -Name "Auth for $resource" -Url "$baseUrl/api/authorize" -Method "POST" -Body $req
    Start-Sleep -Milliseconds 500
}

# Test 6: Different Actions
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "TEST 6: Different Actions" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

$actions = @("read", "write", "delete", "list")
foreach ($action in $actions) {
    $req = @{
        principal = "arn:aws:iam::123456789012:user/admin"
        resource = "s3://secure-bucket/sensitive-data.txt"
        action = $action
        cloudProvider = "aws"
    }
    Test-Endpoint -Name "Action: $action" -Url "$baseUrl/api/authorize" -Method "POST" -Body $req
    Start-Sleep -Milliseconds 500
}

# Test 7: AWS Identity (if configured)
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "TEST 7: AWS Identity Check" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Test-Endpoint -Name "AWS Identity" -Url "$baseUrl/api/aws/identity"

# Test 8: S3 Operations (if configured)
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "TEST 8: S3 Operations" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

$s3UploadRequest = @{
    key = "test-file-$(Get-Date -Format 'yyyyMMdd-HHmmss').txt"
    content = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes("Hello from automated test!"))
    bucket = "ravitejs-demo-bucket"
}

Test-Endpoint -Name "S3 Upload" -Url "$baseUrl/api/s3/upload" -Method "POST" -Body $s3UploadRequest
Test-Endpoint -Name "S3 List" -Url "$baseUrl/api/s3/list"

# Test 9: Policy Update
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "TEST 9: Policy Update" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

$policyUpdate = @{
    newRoot = "0x" + ("a" * 64)  # Mock policy root
}

Test-Endpoint -Name "Update Policy Root" -Url "$baseUrl/api/policy/update-root" -Method "POST" -Body $policyUpdate

# Test 10: Performance Test
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "TEST 10: Performance Test - 10 requests" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

$startTime = Get-Date
$perfResults = @()

for ($i = 1; $i -le 10; $i++) {
    $reqStart = Get-Date
    $req = @{
        principal = "arn:aws:iam::123456789012:user/perf-test-$i"
        resource = "s3://perf-bucket/file-$i.txt"
        action = "read"
        cloudProvider = "aws"
    }
    
    try {
        $jsonBody = $req | ConvertTo-Json
        $response = Invoke-RestMethod -Uri "$baseUrl/api/authorize" -Method POST -Body $jsonBody -ContentType "application/json" -TimeoutSec 10
        $reqEnd = Get-Date
        $duration = ($reqEnd - $reqStart).TotalMilliseconds
        $perfResults += $duration
        Write-Host "Request $i : $([math]::Round($duration, 2)) ms" -ForegroundColor Cyan
    } catch {
        Write-Host "Request $i : FAILED" -ForegroundColor Red
    }
}

$endTime = Get-Date
$totalTime = ($endTime - $startTime).TotalSeconds
$avgTime = ($perfResults | Measure-Object -Average).Average

Write-Host "`nPerformance Summary:" -ForegroundColor Yellow
Write-Host "Total Time: $([math]::Round($totalTime, 2)) seconds" -ForegroundColor White
Write-Host "Average Response Time: $([math]::Round($avgTime, 2)) ms" -ForegroundColor White
Write-Host "Min Response Time: $([math]::Round(($perfResults | Measure-Object -Minimum).Minimum, 2)) ms" -ForegroundColor White
Write-Host "Max Response Time: $([math]::Round(($perfResults | Measure-Object -Maximum).Maximum, 2)) ms" -ForegroundColor White

# Final Summary
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "TEST SUMMARY" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

$totalTests = $testsPassed + $testsFailed
Write-Host "`nTotal Tests: $totalTests" -ForegroundColor White
Write-Host "Passed: $testsPassed" -ForegroundColor Green
Write-Host "Failed: $testsFailed" -ForegroundColor Red

if ($testsFailed -eq 0) {
    Write-Host "`n[SUCCESS] ALL TESTS PASSED!" -ForegroundColor Green
} else {
    Write-Host "`n[WARNING] Some tests failed. Check the output above." -ForegroundColor Yellow
}

Write-Host "`n========================================`n" -ForegroundColor Cyan
