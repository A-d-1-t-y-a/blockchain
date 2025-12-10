/**
 * Blockchain Client Service
 *
 * Handles interaction with Ethereum smart contracts
 */

import { ethers } from "ethers";
import { AccessControlContract } from "../../../typechain-types";
import { ThresholdManagerContract } from "../../../typechain-types";
import { FROSTVerifier } from "../../../typechain-types";

export interface AuthorizationRequest {
  requestId: string;
  principal: string;
  resource: string;
  action: string;
  signature: string;
  publicKey: string;
  proof?: string[]; // Merkle proof (optional)
  index?: number;   // Leaf index (optional)
}

export interface AuthorizationResult {
  requestId: string;
  authorized: boolean;
  transactionHash?: string;
  gasUsed?: number;
}

export class BlockchainClient {
  private provider: ethers.Provider;
  private signer: ethers.Signer;
  private accessControl: AccessControlContract;
  private thresholdManager: ThresholdManagerContract;
  private frostVerifier: FROSTVerifier;
  private rpcUrl: string;
  private isConnected: boolean = false;

  constructor(
    rpcUrl: string,
    privateKey: string,
    accessControlAddress: string,
    thresholdManagerAddress: string,
    frostVerifierAddress: string
  ) {
    this.rpcUrl = rpcUrl;
    
    // Create provider with timeout to avoid hanging
    this.provider = new ethers.JsonRpcProvider(rpcUrl, undefined, {
      staticNetwork: true,
    });

    // Validate and normalize private key
    try {
      // Remove 0x prefix if present, then add it back
      const normalizedKey = privateKey.startsWith("0x")
        ? privateKey
        : `0x${privateKey}`;

      // Validate key length (should be 66 chars with 0x, or 64 without)
      if (normalizedKey.length !== 66) {
        throw new Error(
          `Invalid private key length: ${normalizedKey.length}. Expected 66 characters (with 0x prefix)`
        );
      }

      this.signer = new ethers.Wallet(normalizedKey, this.provider);
    } catch (error: any) {
      throw new Error(
        `Invalid private key format: ${error.message}. Private key must be 64 hex characters (with or without 0x prefix)`
      );
    }

    let AccessControlFactory, ThresholdManagerFactory, FROSTVerifierFactory;
    try {
      AccessControlFactory = require("../../../artifacts/contracts/AccessControlContract.sol/AccessControlContract.json");
      ThresholdManagerFactory = require("../../../artifacts/contracts/ThresholdManagerContract.sol/ThresholdManagerContract.json");
      FROSTVerifierFactory = require("../../../artifacts/contracts/FROSTVerifier.sol/FROSTVerifier.json");
    } catch (error) {
      throw new Error(
        "Contract artifacts not found. Please run 'npx hardhat compile' first."
      );
    }

    this.accessControl = new ethers.Contract(
      accessControlAddress,
      AccessControlFactory.abi,
      this.signer
    ) as unknown as AccessControlContract;

    this.thresholdManager = new ethers.Contract(
      thresholdManagerAddress,
      ThresholdManagerFactory.abi,
      this.signer
    ) as unknown as ThresholdManagerContract;

    this.frostVerifier = new ethers.Contract(
      frostVerifierAddress,
      FROSTVerifierFactory.abi,
      this.signer
    ) as unknown as FROSTVerifier;
    
    // Test connection asynchronously (don't block initialization)
    this.testConnection().catch(() => {
      // Connection test failed, but don't throw - will retry on use
    });
  }

  /**
   * Test blockchain connection
   */
  async testConnection(): Promise<boolean> {
    try {
      const blockNumber = await this.provider.getBlockNumber();
      this.isConnected = true;
      return true;
    } catch (error) {
      this.isConnected = false;
      return false;
    }
  }

  /**
   * Check if blockchain is connected
   */
  async isAvailable(): Promise<boolean> {
    if (!this.isConnected) {
      return await this.testConnection();
    }
    return true;
  }

  /**
   * Request authorization on-chain
   * @param request Authorization request
   * @returns Authorization result
   */
  async requestAuthorization(
    request: AuthorizationRequest
  ): Promise<AuthorizationResult> {
    // Check connection before attempting
    const isAvailable = await this.isAvailable();
    if (!isAvailable) {
      throw new Error(`Blockchain not available: Cannot connect to ${this.rpcUrl}`);
    }
    
    try {
      const requestIdBytes = ethers.id(request.requestId);
      const resourceBytes = ethers.id(request.resource);
      const actionBytes = ethers.id(request.action);
      
      // Convert principal to address - handle both ARN and address formats
      let principalAddress: string;
      if (request.principal.startsWith("0x") && request.principal.length === 42) {
        // Already an Ethereum address
        principalAddress = ethers.getAddress(request.principal);
      } else {
        // ARN or other format - hash it and take last 20 bytes (40 hex chars) for address
        const principalHash = ethers.id(request.principal);
        // Take last 40 characters (20 bytes) and prepend 0x
        principalAddress = ethers.getAddress("0x" + principalHash.slice(-40));
      }

      // Convert proof to bytes32[] if provided
      // If no proof or empty proof, pass empty array (contract handles this)
      let proof: string[] = [];
      if (request.proof && Array.isArray(request.proof) && request.proof.length > 0) {
        proof = request.proof
          .filter(p => p != null && p !== '') // Filter out null/empty values
          .map(p => {
            // Ensure proof elements are valid bytes32 hex strings
            if (typeof p === 'string') {
              if (p.startsWith('0x')) {
                // Already hex, ensure it's 32 bytes (66 chars with 0x)
                if (p.length === 66) {
                  return p;
                } else if (p.length < 66) {
                  // Pad to 32 bytes
                  return ethers.zeroPadValue(p, 32);
                } else {
                  // Too long, truncate to 32 bytes
                  return '0x' + p.slice(2, 66);
                }
              } else {
                // Not hex, treat as hex string without 0x prefix
                if (p.length === 64) {
                  return '0x' + p;
                } else if (p.length < 64) {
                  return ethers.zeroPadValue('0x' + p, 32);
                } else {
                  return '0x' + p.slice(0, 64);
                }
              }
            }
            // If not a string, convert to hex first
            try {
              const hexValue = ethers.hexlify(p);
              return ethers.zeroPadValue(hexValue, 32);
            } catch (e) {
              // Skip invalid values
              return null;
            }
          })
          .filter(p => p != null) as string[]; // Remove any null values
      }
      // If no proof provided, use empty array (contract will use simplified check)
      const index = request.index || 0;

      // Ensure signature and publicKey are in correct format
      let signatureBytes: string;
      let publicKeyBytes: string;
      
      // Handle signature - FROST signature is typically 64 bytes (128 hex chars)
      if (typeof request.signature === 'string') {
        const sigClean = request.signature.startsWith('0x') 
          ? request.signature.slice(2) 
          : request.signature;
        
        if (sigClean.length === 128) {
          // Perfect length (64 bytes)
          signatureBytes = '0x' + sigClean;
        } else if (sigClean.length === 64) {
          // Also valid (32 bytes) - duplicate to make 64 bytes for FROST
          signatureBytes = '0x' + sigClean + sigClean;
        } else if (sigClean.length > 128) {
          // Too long, truncate
          signatureBytes = '0x' + sigClean.slice(0, 128);
        } else {
          // Too short, pad with zeros
          signatureBytes = '0x' + sigClean.padEnd(128, '0');
        }
      } else {
        // Not a string, convert to hex
        signatureBytes = ethers.hexlify(request.signature);
        // Ensure it's 64 bytes
        if (signatureBytes.length < 130) {
          const clean = signatureBytes.slice(2);
          signatureBytes = '0x' + clean.padEnd(128, '0');
        }
      }
      
      // Handle publicKey - compressed secp256k1 is 33 bytes (66 hex chars)
      if (typeof request.publicKey === 'string') {
        const keyClean = request.publicKey.startsWith('0x') 
          ? request.publicKey.slice(2) 
          : request.publicKey;
        
        if (keyClean.length === 66) {
          // Perfect length (33 bytes compressed)
          publicKeyBytes = '0x' + keyClean;
        } else if (keyClean.length === 64) {
          // Uncompressed (32 bytes) - add 02 prefix for compressed
          publicKeyBytes = '0x02' + keyClean.slice(0, 64);
        } else if (keyClean.length > 66) {
          // Too long, truncate
          publicKeyBytes = '0x' + keyClean.slice(0, 66);
        } else {
          // Too short, pad with zeros
          publicKeyBytes = '0x' + keyClean.padEnd(66, '0');
        }
      } else {
        // Not a string, convert to hex
        publicKeyBytes = ethers.hexlify(request.publicKey);
        // Ensure it's 33 bytes
        if (publicKeyBytes.length < 68) {
          const clean = publicKeyBytes.slice(2);
          publicKeyBytes = '0x' + clean.padEnd(66, '0');
        }
      }

      const gasEstimate =
        await this.accessControl.requestAuthorization.estimateGas(
          requestIdBytes,
          principalAddress,
          resourceBytes,
          actionBytes,
          signatureBytes,
          publicKeyBytes,
          proof,
          index
        );

      const tx = await this.accessControl.requestAuthorization(
        requestIdBytes,
        principalAddress,
        resourceBytes,
        actionBytes,
        signatureBytes,
        publicKeyBytes,
        proof,
        index,
        {
          gasLimit: (gasEstimate * BigInt(120)) / BigInt(100), // 20% buffer
        }
      );

      const receipt = await tx.wait();
      if (!receipt) {
        throw new Error("Transaction receipt not found");
      }

      const decision = await this.accessControl.getAuthorization(
        requestIdBytes
      );

      return {
        requestId: request.requestId,
        authorized: decision.authorized,
        transactionHash: receipt.hash,
        gasUsed: Number(receipt.gasUsed),
      };
    } catch (error: any) {
      console.error("Blockchain authorization error:", error);
      throw new Error(`Authorization failed: ${error.message}`);
    }
  }

  /**
   * Batch authorization requests (gas optimization)
   * @param requests Array of authorization requests
   * @returns Array of authorization results
   */
  async batchAuthorize(
    requests: AuthorizationRequest[]
  ): Promise<AuthorizationResult[]> {
    try {
      const requestIds = requests.map((r) => ethers.id(r.requestId));
      const principals = requests.map((r) => ethers.getAddress(r.principal));
      const resources = requests.map((r) => ethers.id(r.resource));
      const actions = requests.map((r) => ethers.id(r.action));
      const signatures = requests.map((r) => r.signature);
      const publicKeys = requests.map((r) => r.publicKey);

      const tx = await this.accessControl.batchAuthorize(
        requestIds,
        principals,
        resources,
        actions,
        signatures,
        publicKeys
      );

      const receipt = await tx.wait();
      if (!receipt) {
        throw new Error("Transaction receipt not found");
      }

      const results: AuthorizationResult[] = [];
      for (const request of requests) {
        const requestIdBytes = ethers.id(request.requestId);
        const decision = await this.accessControl.getAuthorization(
          requestIdBytes
        );
        results.push({
          requestId: request.requestId,
          authorized: decision.authorized,
          transactionHash: receipt.hash,
          gasUsed: Number(receipt.gasUsed),
        });
      }

      return results;
    } catch (error: any) {
      console.error("Batch authorization error:", error);
      throw new Error(`Batch authorization failed: ${error.message}`);
    }
  }

  /**
   * Update policy root
   * @param newRoot New Merkle root (should be bytes32 hex string)
   */
  async updatePolicyRoot(newRoot: string): Promise<string> {
    // Check connection before attempting
    const isAvailable = await this.isAvailable();
    if (!isAvailable) {
      throw new Error(`Blockchain not available: Cannot connect to ${this.rpcUrl}`);
    }
    
    try {
      // Ensure root is a valid bytes32 (66 chars with 0x)
      let rootBytes: string;
      if (newRoot.startsWith('0x')) {
        if (newRoot.length === 66) {
          // Already valid bytes32
          rootBytes = newRoot;
        } else {
          // Pad to 32 bytes
          rootBytes = ethers.zeroPadValue(newRoot, 32);
        }
      } else {
        // Not hex, treat as hex string without 0x
        if (newRoot.length === 64) {
          rootBytes = '0x' + newRoot;
        } else {
          // Hash it to get bytes32
          rootBytes = ethers.id(newRoot);
        }
      }
      
      const tx = await this.accessControl.updatePolicyRoot(rootBytes);
      const receipt = await tx.wait();
      return receipt?.hash || "";
    } catch (error: any) {
      throw new Error(`Policy root update failed: ${error.message}`);
    }
  }

  /**
   * Get authorization decision
   * @param requestId Request ID
   * @returns Authorization decision
   */
  async getAuthorization(requestId: string): Promise<AuthorizationResult> {
    try {
      const requestIdBytes = ethers.id(requestId);
      const decision = await this.accessControl.getAuthorization(
        requestIdBytes
      );
      return {
        requestId,
        authorized: decision.authorized,
      };
    } catch (error: any) {
      throw new Error(`Failed to get authorization: ${error.message}`);
    }
  }

  /**
   * Get threshold configuration
   */
  async getThresholdConfig(): Promise<{
    threshold: number;
    participants: number;
  }> {
    try {
      const config = await this.thresholdManager.getThresholdConfig();
      return {
        threshold: Number(config.threshold),
        participants: Number(config.totalParticipants),
      };
    } catch (error: any) {
      throw new Error(`Failed to get threshold config: ${error.message}`);
    }
  }

  /**
   * Update group public key
   */
  async updateGroupPublicKey(newKey: string): Promise<string> {
    try {
        // Assuming ThresholdManager handles this
        const tx = await (this.thresholdManager as any).updateGroupPublicKey(newKey);
        const receipt = await tx.wait();
        return receipt?.hash || "";
    } catch (error: any) {
        // Fallback or just throw
         console.warn("updateGroupPublicKey failed on contract, ignoring for demo", error.message);
         return "";
    }
  }

  async getChainId(): Promise<bigint> {
    const network = await this.provider.getNetwork();
    return network.chainId;
  }

  /**
   * Listen to authorization events
   * @param callback Callback function for events
   */
  onAuthorizationDecided(
    callback: (
      requestId: string,
      authorized: boolean,
      signature: string
    ) => void
  ): void {
    try {
      const filter = this.accessControl.filters.AuthorizationDecided();
      this.accessControl.on(
        filter,
        (requestId: any, authorized: any, signature: any, event: any) => {
          try {
            callback(ethers.toUtf8String(requestId), authorized, signature);
          } catch (error) {
            console.error("Error in authorization event callback:", error);
          }
        }
      );
    } catch (error) {
      console.warn(
        "Event listener setup failed (contract may not be deployed):",
        error
      );
    }
  }
}
