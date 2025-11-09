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
    this.signer = new ethers.Wallet(privateKey, this.provider);

    // Initialize contract instances
    const AccessControlFactory = require("../../../artifacts/contracts/AccessControlContract.sol/AccessControlContract.json");
    const ThresholdManagerFactory = require("../../../artifacts/contracts/ThresholdManagerContract.sol/ThresholdManagerContract.json");
    const FROSTVerifierFactory = require("../../../artifacts/contracts/FROSTVerifier.sol/FROSTVerifier.json");

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
      const gasEstimate = await this.accessControl.requestAuthorization.estimateGas(
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
          gasLimit: gasEstimate * BigInt(120) / BigInt(100), // 20% buffer
        }
      );

      // Wait for confirmation
      const receipt = await tx.wait();
      if (!receipt) {
        throw new Error("Transaction receipt not found");
      }

      // Get authorization decision from event
      const decision = await this.accessControl.getAuthorization(requestIdBytes);

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
        const decision = await this.accessControl.getAuthorization(requestIdBytes);
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
      const decision = await this.accessControl.getAuthorization(requestIdBytes);
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
  async getThresholdConfig(): Promise<{ threshold: number; participants: number }> {
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
    callback: (requestId: string, authorized: boolean, signature: string) => void
  ): void {
    this.accessControl.on("AuthorizationDecided", (requestId, authorized, signature) => {
      callback(ethers.toUtf8String(requestId), authorized, signature);
    });
  }
}

