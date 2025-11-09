# Architecture Documentation

## System Overview

The Decentralized Cloud Resource Access Control system combines FROST threshold cryptography, gas-optimized smart contracts, and AWS IAM integration to provide a Byzantine fault-tolerant access control solution.

## Component Architecture

### 1. Smart Contract Layer

#### AccessControlContract
- **Purpose**: Main authorization contract
- **Key Features**:
  - FROST signature verification
  - Merkle tree policy storage
  - Authorization decision logging
  - Gas-optimized storage packing
- **Gas Target**: <30,000 gas per authorization

#### ThresholdManagerContract
- **Purpose**: Dynamic threshold and participant management
- **Key Features**:
  - Add/remove participants
  - Update threshold dynamically
  - Key refresh mechanism
  - Emergency lock functionality

#### FROSTVerifier
- **Purpose**: On-chain FROST signature verification
- **Key Features**:
  - secp256k1 signature verification
  - Batch verification support
  - Gas-optimized assembly code

### 2. Off-Chain Services

#### FROST Coordinator
- **Purpose**: Threshold signature coordination
- **Key Features**:
  - Distributed Key Generation (DKG)
  - Threshold signature aggregation
  - Participant management
  - Key refresh (CHURP protocol)

#### AWS IAM Client
- **Purpose**: AWS IAM integration
- **Key Features**:
  - Policy simulation
  - Access decision evaluation
  - Policy attachment/detachment

#### Blockchain Client
- **Purpose**: Ethereum interaction
- **Key Features**:
  - Contract interaction
  - Transaction management
  - Event listening
  - Gas estimation

### 3. API Gateway

#### Express.js Server
- **Purpose**: RESTful API and WebSocket server
- **Key Features**:
  - Authorization endpoints
  - FROST management
  - Policy management
  - Real-time event streaming

## Data Flow

### Authorization Request Flow

```
1. Client → API Gateway
   POST /api/authorize
   {
     principal, resource, action, signatureShares
   }

2. API Gateway → FROST Coordinator
   Aggregate threshold signature

3. API Gateway → AWS IAM Client
   Check IAM policy

4. API Gateway → Blockchain Client
   Request on-chain authorization

5. Blockchain Client → AccessControlContract
   Verify FROST signature and policy

6. AccessControlContract → FROSTVerifier
   Verify signature on-chain

7. AccessControlContract → ThresholdManagerContract
   Verify participant status

8. Response → Client
   {
     authorized, awsDecision, blockchainResult
   }
```

## Security Architecture

### Threat Model

1. **Single Point of Failure**: Mitigated by threshold signatures
2. **Byzantine Nodes**: Tolerated up to f = ⌊(n-1)/3⌋
3. **Reentrancy Attacks**: Prevented by ReentrancyGuard
4. **Signature Forgery**: Prevented by FROST threshold cryptography
5. **Policy Tampering**: Prevented by Merkle tree and on-chain storage

### Security Measures

- **Access Control**: Role-based permissions (OpenZeppelin)
- **Reentrancy Protection**: ReentrancyGuard on all external functions
- **Input Validation**: Comprehensive checks on all inputs
- **Circuit Breaker**: Emergency pause functionality
- **Gas Optimization**: Prevents DoS via gas limit exhaustion

## Performance Optimization

### Gas Optimization Strategies

1. **Storage Packing**: Pack multiple values in single storage slot
2. **Batch Operations**: Aggregate multiple operations
3. **Merkle Tree Caching**: Store proofs off-chain
4. **Event Optimization**: Minimize event data
5. **Assembly Optimization**: Hand-crafted assembly for hot paths

### Scalability Solutions

1. **Layer 2 Integration**: Support for Arbitrum/Optimism
2. **Off-Chain Computation**: FROST signing off-chain
3. **Caching**: API gateway caching layer
4. **Batch Processing**: Aggregate multiple requests

## Deployment Architecture

### Network Configuration

- **Development**: Hardhat local network
- **Testing**: Sepolia testnet
- **Production**: Ethereum mainnet + Layer 2 (Arbitrum/Optimism)

### Infrastructure Components

1. **Blockchain Node**: Ethereum RPC endpoint (Infura/Alchemy)
2. **API Server**: Node.js/Express.js
3. **Database**: Optional PostgreSQL for caching
4. **AWS Services**: IAM, STS for policy evaluation

## Monitoring and Observability

### Metrics

- Authorization latency
- Gas consumption per operation
- Transaction throughput
- Error rates
- Byzantine node detection

### Logging

- Authorization decisions
- FROST signature events
- Policy updates
- Threshold changes

## Future Enhancements

1. **Full FROST Implementation**: Complete RFC 9591 compliance
2. **Multi-Cloud Support**: Azure AD integration
3. **Layer 2 Scaling**: Optimistic rollups integration
4. **Formal Verification**: Certora verification
5. **Advanced Policy Engine**: Attribute-based access control

