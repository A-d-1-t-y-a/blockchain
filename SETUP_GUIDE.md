# Setup Guide: How to Get Started

## Step-by-Step Setup Instructions

### Prerequisites

1. **Node.js** (v18 or higher)
   - Download from: https://nodejs.org/
   - Verify: `node --version`

2. **npm** (comes with Node.js)
   - Verify: `npm --version`

3. **Git** (for cloning repository)
   - Download from: https://git-scm.com/

4. **Ethereum Wallet** (MetaMask recommended)
   - Download: https://metamask.io/
   - Create a wallet
   - Get Sepolia testnet ETH from: https://sepoliafaucet.com/

5. **AWS Account** (for IAM integration)
   - Sign up: https://aws.amazon.com/
   - Create IAM user with appropriate permissions

### Step 1: Clone and Install

```bash
# Navigate to project directory
cd Ravitejs

# Install dependencies
npm install
```

### Step 2: Configure Environment Variables

```bash
# Copy the example environment file
# On Windows (PowerShell):
Copy-Item .env.example .env

# On Linux/Mac:
cp .env.example .env
```

### Step 3: Get Required API Keys

#### A. Ethereum RPC URL (Choose one)

**Option 1: Infura**
1. Go to https://infura.io
2. Sign up for free account
3. Create a new project
4. Select "Ethereum" network
5. Copy the "Sepolia" endpoint URL
6. Paste in `.env` as `SEPOLIA_RPC_URL`

**Option 2: Alchemy**
1. Go to https://alchemy.com
2. Sign up for free account
3. Create a new app
4. Select "Ethereum" and "Sepolia" network
5. Copy the HTTPS URL
6. Paste in `.env` as `SEPOLIA_RPC_URL`

#### B. Etherscan API Key
1. Go to https://etherscan.io/register
2. Create free account
3. Go to API-KEYs section
4. Create new API key
5. Copy and paste in `.env` as `ETHERSCAN_API_KEY`

#### C. AWS Credentials
1. Log into AWS Console
2. Go to IAM → Users
3. Create new user (or use existing)
4. Attach policy: `IAMReadOnlyAccess` (or custom policy)
5. Create Access Key
6. Copy Access Key ID → `AWS_ACCESS_KEY_ID`
7. Copy Secret Access Key → `AWS_SECRET_ACCESS_KEY`
8. Set region → `AWS_REGION` (e.g., `us-east-1`)

#### D. Private Key (Deployer Wallet)
1. Open MetaMask
2. Switch to Sepolia testnet
3. Click account icon → Account Details
4. Export Private Key (enter password)
5. **WARNING**: Never share this key!
6. Paste in `.env` as `PRIVATE_KEY` (with `0x` prefix)

### Step 4: Edit .env File

Open `.env` file and fill in all the values:

```env
# Blockchain
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_ACTUAL_PROJECT_ID
PRIVATE_KEY=0xYOUR_ACTUAL_PRIVATE_KEY
ETHERSCAN_API_KEY=your_actual_etherscan_key

# AWS
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_actual_aws_key
AWS_SECRET_ACCESS_KEY=your_actual_aws_secret

# API
API_PORT=3000
NODE_ENV=development

# FROST
FROST_THRESHOLD=3
FROST_PARTICIPANTS=5
```

### Step 5: Compile Smart Contracts

```bash
# Compile all contracts
npm run compile
```

You should see: `Compiled X Solidity files successfully`

### Step 6: Run Tests

```bash
# Run all tests
npm test

# Run with gas reporting
npm run test:gas

# Run specific test file
npx hardhat test test/unit/AccessControl.test.ts
```

### Step 7: Deploy to Sepolia Testnet

```bash
# Make sure you have Sepolia ETH in your wallet
# Deploy contracts
npm run deploy:sepolia
```

After deployment, you'll see contract addresses. Copy them to `.env`:

```env
ACCESS_CONTROL_ADDRESS=0x...
THRESHOLD_MANAGER_ADDRESS=0x...
FROST_VERIFIER_ADDRESS=0x...
```

### Step 8: Start API Server

```bash
# Start the API gateway
cd api
npm install  # If not already done
npm start
```

The server will start on `http://localhost:3000`

### Step 9: Test the API

Open a new terminal and test:

```bash
# Health check
curl http://localhost:3000/health

# Get FROST config
curl http://localhost:3000/api/frost/config
```

## Quick Start (Minimal Setup)

If you just want to test locally without AWS/Blockchain:

```bash
# 1. Install dependencies
npm install

# 2. Compile contracts
npm run compile

# 3. Run tests on local Hardhat network
npm test

# 4. Start API (will work without blockchain/AWS for basic endpoints)
cd api
npm install
npm start
```

## Common Issues & Solutions

### Issue: "Cannot find module"
**Solution**: Run `npm install` in both root and `api/` directory

### Issue: "Insufficient funds"
**Solution**: Get Sepolia testnet ETH from faucet

### Issue: "Invalid RPC URL"
**Solution**: Check your Infura/Alchemy URL is correct

### Issue: "AWS credentials invalid"
**Solution**: Verify AWS Access Key ID and Secret are correct

### Issue: "Contract compilation failed"
**Solution**: Check Node.js version (should be 18+)

## Verification Checklist

- [ ] Node.js installed (v18+)
- [ ] Dependencies installed (`npm install`)
- [ ] `.env` file created and filled
- [ ] Contracts compile (`npm run compile`)
- [ ] Tests pass (`npm test`)
- [ ] API server starts (`cd api && npm start`)
- [ ] Health check works (`curl http://localhost:3000/health`)

## Next Steps

1. **Read Documentation**: Check `README.md` and `ARCHITECTURE.md`
2. **Run Tests**: Ensure all tests pass
3. **Deploy**: Deploy to Sepolia testnet
4. **Test API**: Try authorization endpoints
5. **Benchmark**: Run gas profiling tests

## Getting Help

- Check `README.md` for detailed documentation
- Review `ARCHITECTURE.md` for system design
- Look at test files for usage examples
- Check error messages for specific issues

