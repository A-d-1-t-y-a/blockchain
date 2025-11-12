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

  constructor(
    rpcUrl: string,
    privateKey: string,
    accessControlAddress: string,
    thresholdManagerAddress: string,
    frostVerifierAddress: string
  ) {
    this.provider = new ethers.JsonRpcProvider(rpcUrl);

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

    // Initialize contract instances
    // Try to load artifacts, but handle gracefully if they don't exist
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
  }

  /**
   * Request authorization on-chain
   * @param request Authorization request
   * @returns Authorization result
   */
  async requestAuthorization(
    request: AuthorizationRequest
  ): Promise<AuthorizationResult> {
    try {
      const requestIdBytes = ethers.id(request.requestId);
      const resourceBytes = ethers.id(request.resource);
      const actionBytes = ethers.id(request.action);
      const principalAddress = ethers.getAddress(request.principal);

      // Estimate gas first
      const gasEstimate =
        await this.accessControl.requestAuthorization.estimateGas(
          requestIdBytes,
          principalAddress,
          resourceBytes,
          actionBytes,
          request.signature,
          request.publicKey
        );

      // Send transaction
      const tx = await this.accessControl.requestAuthorization(
        requestIdBytes,
        principalAddress,
        resourceBytes,
        actionBytes,
        request.signature,
        request.publicKey,
        {
          gasLimit: (gasEstimate * BigInt(120)) / BigInt(100), // 20% buffer
        }
      );

      // Wait for confirmation
      const receipt = await tx.wait();
      if (!receipt) {
        throw new Error("Transaction receipt not found");
      }

      // Get authorization decision from event
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

      // Get results for each request
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
   * @param newRoot New Merkle root
   */
  async updatePolicyRoot(newRoot: string): Promise<string> {
    try {
      const rootBytes = ethers.hexlify(ethers.toUtf8Bytes(newRoot));
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
    // Note: Event listening requires proper event filter setup
    // This is a simplified implementation - in production use proper event filters
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
