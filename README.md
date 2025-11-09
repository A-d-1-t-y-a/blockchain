# Decentralized Cloud Resource Access Control

A production-ready decentralized cloud resource access control system using FROST threshold cryptography and gas-optimized multi-signature smart contracts.

## Overview

This project implements a Byzantine fault-tolerant access control system for multi-cloud environments, combining:
- **FROST Threshold Signatures** (RFC 9591 compliant)
- **Gas-optimized Solidity smart contracts** (<30,000 gas per operation)
- **AWS IAM integration** via RESTful API gateway
- **Dynamic threshold management** without service interruption

## Architecture

```
API Gateway → FROST Coordinator → Smart Contracts → Ethereum Sepolia
                    ↓
              AWS IAM Integration
```

## Prerequisites

- Node.js >= 18.0.0
- npm or yarn
- Hardhat ^2.19.0
- Ethereum wallet with Sepolia testnet ETH (for deployment)

## Installation

```bash
npm install
```

## Configuration

1. Copy `.env.example` to `.env`
2. Fill in your configuration:
   - `SEPOLIA_RPC_URL`: Your Infura or Alchemy Sepolia endpoint
   - `PRIVATE_KEY`: Your deployer wallet private key
   - `ETHERSCAN_API_KEY`: For contract verification
   - AWS credentials for IAM integration

## Development

### Compile Contracts
```bash
npx hardhat compile
```

### Run Tests
```bash
npx hardhat test
```

### Run Tests with Gas Reporting
```bash
REPORT_GAS=true npx hardhat test
```

### Run Coverage
```bash
npx hardhat coverage
```

### Deploy to Sepolia
```bash
npx hardhat run scripts/deploy.ts --network sepolia
```

## Project Structure

```
├── contracts/          # Solidity smart contracts
├── scripts/            # Deployment and utility scripts
├── test/               # Test files
├── api/                # API gateway and off-chain services
│   └── src/
│       └── services/   # FROST coordinator, AWS IAM client, etc.
└── benchmarks/         # Performance and gas benchmarks
```

## Security

This project follows security best practices:
- OpenZeppelin contracts for battle-tested components
- Reentrancy guards on all external functions
- Comprehensive input validation
- Security audit tools: Slither, Mythril

## API Documentation

### Endpoints

#### POST `/api/authorize`
Request authorization for cloud resource access.

**Request Body:**
```json
{
  "principal": "arn:aws:iam::123456789012:user/username",
  "resource": "arn:aws:s3:::my-bucket/object",
  "action": "s3:GetObject",
  "signatureShares": [
    {
      "participantId": "p1",
      "share": "signature_share_hex",
      "commitment": "commitment_hex"
    }
  ]
}
```

**Response:**
```json
{
  "requestId": "unique-request-id",
  "authorized": true,
  "awsDecision": {
    "allowed": true,
    "policies": ["arn:aws:iam::123456789012:policy/PolicyName"]
  },
  "blockchainResult": {
    "authorized": true,
    "transactionHash": "0x...",
    "gasUsed": 25000
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

#### GET `/api/authorize/:requestId`
Get authorization status for a request.

#### GET `/api/frost/config`
Get FROST threshold configuration.

#### GET `/api/frost/participants`
Get list of active FROST participants.

#### POST `/api/policy/update-root`
Update policy Merkle root (requires admin role).

### WebSocket Events

Connect to `ws://localhost:3000` to receive real-time authorization events:

```javascript
const socket = io('http://localhost:3000');
socket.on('authorization', (data) => {
  console.log('Authorization event:', data);
});
```

## Architecture Details

### Smart Contracts

1. **AccessControlContract**: Main authorization contract with FROST signature verification and Merkle tree policy storage
2. **ThresholdManagerContract**: Manages FROST threshold and participant configuration
3. **FROSTVerifier**: On-chain FROST signature verification
4. **MerkleTree Library**: Gas-optimized Merkle tree for policy storage

### Gas Optimization

- Storage packing: Uses `uint128` and `uint64` to pack multiple values in single storage slot
- Batch operations: Aggregate multiple authorizations in single transaction
- Merkle tree caching: Store policy proofs off-chain, verify on-chain
- Event optimization: Use indexed parameters, minimize event data

### Security Features

- ReentrancyGuard on all external functions
- Access control with role-based permissions
- Circuit breaker (pause functionality)
- Input validation on all parameters
- OpenZeppelin battle-tested libraries

## Testing

### Run Unit Tests
```bash
npm test
```

### Run Integration Tests
```bash
npx hardhat test test/integration
```

### Run Gas Profiling
```bash
npx hardhat test benchmarks/gas-profiling.test.ts
```

### Run Security Tests
```bash
npx hardhat test test/security
```

### Generate Coverage Report
```bash
npm run coverage
```

## Deployment

### Prerequisites
- Ethereum wallet with Sepolia testnet ETH
- Infura or Alchemy account for RPC endpoint
- Etherscan API key for contract verification

### Deploy to Sepolia
```bash
# Set environment variables
export SEPOLIA_RPC_URL="https://sepolia.infura.io/v3/YOUR_PROJECT_ID"
export PRIVATE_KEY="your_private_key"
export ETHERSCAN_API_KEY="your_etherscan_api_key"

# Deploy
npm run deploy:sepolia
```

### Verify Contracts
```bash
npx hardhat verify --network sepolia <CONTRACT_ADDRESS> <CONSTRUCTOR_ARGS>
```

## Performance Metrics

### Target Metrics
- Gas consumption: <30,000 gas per authorization
- Authorization latency: <200ms (end-to-end)
- System throughput: >1,000 TPS
- Byzantine fault tolerance: Up to 33% malicious nodes

### Benchmarking
Run gas profiling tests to measure actual gas consumption:
```bash
npx hardhat test benchmarks/gas-profiling.test.ts
```

## Troubleshooting

### Common Issues

1. **Compilation Errors**: Ensure Solidity version matches (^0.8.20)
2. **Network Connection**: Check RPC URL and network configuration
3. **Gas Estimation Failures**: Ensure sufficient ETH balance
4. **AWS IAM Errors**: Verify AWS credentials and permissions

## Contributing

This is a research project. For contributions, please follow the code style and ensure all tests pass.

## License

ISC

