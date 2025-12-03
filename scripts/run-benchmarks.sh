#!/bin/bash

# Performance Benchmarking Script
# Runs comprehensive performance tests and generates reports

echo "=========================================="
echo "Performance Benchmarking Suite"
echo "=========================================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Check if k6 is installed
if ! command -v k6 &> /dev/null; then
    echo -e "${YELLOW}k6 is not installed. Installing...${NC}"
    echo "Please install k6 manually:"
    echo "  sudo apt-get install k6"
    echo "Or visit: https://k6.io/docs/getting-started/installation/"
    exit 1
fi

# Check if API server is running
echo "Checking if API server is running..."
if ! curl -s http://localhost:3000/health > /dev/null; then
    echo -e "${YELLOW}⚠️  API server is not running on port 3000${NC}"
    echo "Please start the server first:"
    echo "  cd api && pnpm start"
    exit 1
fi

echo -e "${GREEN}✓ API server is running${NC}"
echo ""

# Create results directory
mkdir -p k6/results
mkdir -p benchmarks

# Run comprehensive load test
echo "Running comprehensive load test..."
echo "This will take approximately 4 minutes..."
echo ""

k6 run k6/comprehensive-load-test.js

# Generate summary
echo ""
echo "=========================================="
echo "Benchmark Complete"
echo "=========================================="
echo ""
echo "Results saved to:"
echo "  - k6/performance-report.json"
echo ""
echo "View detailed results:"
echo "  cat k6/performance-report.json"
echo ""

