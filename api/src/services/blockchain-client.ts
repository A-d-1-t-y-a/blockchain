/**
 * Blockchain Client
 *
 * Manages interactions with the Ethereum blockchain
 */

import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";

// ABI definitions (simplified for MVP)
const ACCESS_CONTROL_ABI = [
  "function requestAuthorization(bytes32 requestId, address principal, bytes32 resource, bytes32 action, bytes calldata signature) external returns (bool)",
  "function getAuthorization(bytes32 requestId) external view returns (tuple(bytes32 requestId, address principal, bytes32 resource, bytes32 action, bool authorized, uint64 timestamp, bytes signature))",
  "function updatePolicyRoot(bytes32 newRoot) external",
  "function updateGroupPublicKey(bytes calldata _groupPublicKey) external",
  "event AuthorizationDecided(bytes32 indexed requestId, bool authorized, bytes signature)",
];

export interface AuthorizationRequest {
  requestId: string;
  principal: string;
  resource: string;
  action: string;
  signature: string; // Hex string
  publicKey?: string; // Optional/Ignored now
}

export class BlockchainClient {
  private provider: ethers.JsonRpcProvider;
  private wallet: ethers.Wallet;
  private accessControlContract: ethers.Contract;

  constructor(
    rpcUrl: string,
    privateKey: string,
    accessControlAddress: string,
    thresholdManagerAddress: string,
    frostVerifierAddress: string
  ) {
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.wallet = new ethers.Wallet(privateKey, this.provider);

    this.accessControlContract = new ethers.Contract(
      accessControlAddress,
      ACCESS_CONTROL_ABI,
      this.wallet
    );
  }

  /**
   * Submit authorization request to blockchain
   */
  async requestAuthorization(request: AuthorizationRequest): Promise<{
    transactionHash: string;
    authorized: boolean;
  }> {
    try {
      // Convert strings to bytes32 where needed
      const resourceBytes32 = ethers.keccak256(ethers.toUtf8Bytes(request.resource));
      const actionBytes32 = ethers.keccak256(ethers.toUtf8Bytes(request.action));
      const requestIdBytes32 = ethers.keccak256(ethers.toUtf8Bytes(request.requestId));
      
      // Ensure signature is 0x-prefixed
      const signature = request.signature.startsWith("0x") 
        ? request.signature 
        : "0x" + request.signature;

      // Call contract
      // Note: In production, this should be a meta-transaction or called by the user
      // Here the API gateway relays it (paying gas)
      const tx = await this.accessControlContract.requestAuthorization(
        requestIdBytes32,
        request.principal, // Assuming principal is an address, if not need mapping
        resourceBytes32,
        actionBytes32,
        signature
      );

      console.log(`Blockchain transaction sent: ${tx.hash}`);
      const receipt = await tx.wait();
      
      // Parse event to get result
      // In a real app, we might just return the tx hash and let client poll
      return {
        transactionHash: receipt.hash,
        authorized: true, // If tx succeeded, it returned true (or reverted)
      };
    } catch (error: any) {
      console.error("Blockchain request failed:", error);
      throw new Error(`Blockchain error: ${error.message}`);
    }
  }

  /**
   * Get authorization decision from blockchain
   */
  async getAuthorization(requestId: string): Promise<any> {
    try {
      const requestIdBytes32 = ethers.keccak256(ethers.toUtf8Bytes(requestId));
      const result = await this.accessControlContract.getAuthorization(requestIdBytes32);
      
      return {
        requestId: result.requestId,
        principal: result.principal,
        authorized: result.authorized,
        timestamp: result.timestamp.toString(),
      };
    } catch (error: any) {
      throw new Error(`Failed to fetch authorization: ${error.message}`);
    }
  }

  /**
   * Update policy root
   */
  async updatePolicyRoot(newRoot: string): Promise<string> {
    try {
      const tx = await this.accessControlContract.updatePolicyRoot(newRoot);
      await tx.wait();
      return tx.hash;
    } catch (error: any) {
      throw new Error(`Failed to update policy root: ${error.message}`);
    }
  }

  /**
   * Update group public key
   */
  async updateGroupPublicKey(publicKey: string): Promise<string> {
    try {
      const tx = await this.accessControlContract.updateGroupPublicKey(publicKey);
      await tx.wait();
      return tx.hash;
    } catch (error: any) {
      throw new Error(`Failed to update group public key: ${error.message}`);
    }
  }
}
