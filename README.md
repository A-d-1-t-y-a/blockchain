# Decentralized Cloud Resource Access Control

A production-ready decentralized cloud resource access control system using FROST threshold cryptography and gas-optimized multi-signature smart contracts.

## Quick Start

### 1. Install Dependencies
```bash
pnpm install
cd api && pnpm install
```

### 2. Configure Environment Variables
Create `.env` file in root directory (see `ENV_TEMPLATE.txt`):
```env
# AWS (Required)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
AWS_SESSION_TOKEN=your_token  # Required for AWS Academy

# Blockchain (Optional)
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_PROJECT_ID
PRIVATE_KEY=0xYOUR_PRIVATE_KEY

# API
API_PORT=3000
NODE_ENV=development

# FROST
FROST_THRESHOLD=3
FROST_PARTICIPANTS=5
```

### 3. Compile Contracts
```bash
npm run compile
```

### 4. Start API Server
```bash
cd api
pnpm start
```

Or from root directory:
```bash
pnpm run api:start
```

The server will start on `http://localhost:3000`

## API Endpoints

### Health Check
```bash
GET /health
```

### Authorize Request
```bash
POST /api/authorize
Content-Type: application/json

{
  "principal": "arn:aws:iam::123456789012:user/username",
  "resource": "arn:aws:s3:::my-bucket/object",
  "action": "s3:GetObject",
  "signatureShares": []
}
```

### Get FROST Config
```bash
GET /api/frost/config
```

## Testing

```bash
# Quick system test
./test.sh

# Run all unit tests
pnpm test

# Run with gas reporting
pnpm run test:gas
```

## Deployment

```bash
# Deploy to Sepolia testnet
pnpm run deploy:sepolia

# Deploy to local network
pnpm run deploy:local
```

## Project Structure

```
├── contracts/          # Solidity smart contracts
├── scripts/            # Deployment scripts
├── test/               # Test files
├── api/                # API gateway
│   └── src/
│       ├── server.ts   # Express server
│       └── services/   # FROST, AWS, Blockchain clients
└── benchmarks/         # Gas profiling tests
```

## Features

- ✅ FROST Threshold Signatures
- ✅ Gas-optimized Smart Contracts
- ✅ AWS IAM Integration
- ✅ Dynamic Threshold Management
- ✅ WebSocket Event Streaming
- ✅ Byzantine Fault Tolerance

## Documentation

- `ARCHITECTURE.md` - System architecture details

## License

ISC
