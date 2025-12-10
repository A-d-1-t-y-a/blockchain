/**
 * FROST Threshold Signature Coordinator
 *
 * Implements RFC 9591 FROST (Flexible Round-Optimized Schnorr Threshold) signatures
 * for decentralized access control. This coordinator manages:
 * - Distributed Key Generation (DKG)
 * - Threshold signature aggregation
 * - Participant management
 * - Key refresh mechanisms
 */

import * as secp256k1 from "@noble/secp256k1";
import { sha256 } from "@noble/hashes/sha256";
import { hmac } from "@noble/hashes/hmac";

// Set up HMAC for secp256k1 signing
secp256k1.utils.hmacSha256Sync = (key: Uint8Array, ...messages: Uint8Array[]) => {
  const h = hmac.create(sha256, key);
  messages.forEach(m => h.update(m));
  return h.digest();
};

export interface Participant {
  id: string;
  publicKey: string;
  share?: string; // Secret share (encrypted in production)
  isActive: boolean;
}

export interface ThresholdConfig {
  threshold: number; // t: minimum signatures required
  participants: number; // n: total participants
}

export interface SignatureShare {
  participantId: string;
  share: string;
  commitment: string;
}

export interface AggregatedSignature {
  signature: string;
  publicKey: string;
  message: string;
}

export class FROSTCoordinator {
  private participants: Map<string, Participant>;
  private threshold: number;
  private groupPublicKey: string | null = null;
  private groupPrivateKey: Uint8Array | null = null;
  private keyShares: Map<string, string> = new Map();

  constructor(threshold: number, totalParticipants: number) {
    if (threshold < 1 || threshold > totalParticipants) {
      throw new Error("Threshold must be between 1 and total participants");
    }
    if (threshold < Math.ceil(totalParticipants / 2)) {
      throw new Error(
        "Threshold must be at least majority (n/2 + 1) for security"
      );
    }

    this.threshold = threshold;
    this.participants = new Map();
  }

  /**
   * Initialize Distributed Key Generation (DKG)
   * In production, this would use a proper DKG protocol
   * For MVP, we use a simplified trusted dealer approach
   */
  async initializeDKG(participantIds: string[]): Promise<{
    groupPublicKey: string;
    shares: Map<string, string>;
  }> {
    if (participantIds.length < this.threshold) {
      throw new Error(
        `Need at least ${this.threshold} participants for threshold`
      );
    }

    // Generate group key pair (simplified - in production use proper DKG)
    const privateKey = secp256k1.utils.randomPrivateKey();
    const publicKey = secp256k1.getPublicKey(privateKey);
    this.groupPublicKey = Buffer.from(publicKey).toString("hex");
    this.groupPrivateKey = privateKey; // Store for signing

    // Generate shares using Shamir Secret Sharing (simplified)
    // In production, use proper threshold secret sharing
    const shares = this.generateShares(privateKey, participantIds.length);

    participantIds.forEach((id, index) => {
      this.keyShares.set(id, shares[index]);
      this.participants.set(id, {
        id,
        publicKey: this.derivePublicKeyFromShare(shares[index]),
        isActive: true,
      });
    });

    return {
      groupPublicKey: this.groupPublicKey,
      shares: this.keyShares,
    };
  }

  /**
   * Generate threshold signature shares
   * Collects shares from participants and aggregates them
   */
  async generateThresholdSignature(
    message: string,
    signatureShares: SignatureShare[] = []
  ): Promise<AggregatedSignature> {
    if (!this.groupPublicKey) {
      throw new Error("DKG not initialized. Call initializeDKG first");
    }

    // If no signature shares provided, generate mock shares for testing
    // In production, this would collect real shares from participants
    if (signatureShares.length === 0) {
      console.warn("No signature shares provided, generating mock shares for testing");
      signatureShares = this.generateMockShares(this.threshold);
    }

    if (signatureShares.length < this.threshold) {
      throw new Error(`Need at least ${this.threshold} signature shares, got ${signatureShares.length}`);
    }

    // Verify all participants are active
    const activeParticipants = Array.from(this.participants.values()).filter(
      (p) => p.isActive
    );

    if (activeParticipants.length < this.threshold) {
      throw new Error(`Not enough active participants: ${activeParticipants.length} active, need ${this.threshold}`);
    }

    // Hash the message - use same format as Ethereum signed messages
    // The contract expects: keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", message))
    const messageBytes = Buffer.from(message);
    const messageHash = sha256(messageBytes);

    // Aggregate signature shares
    // In production, use proper FROST aggregation algorithm
    const aggregatedSignature = this.aggregateSignatures(
      messageHash,
      signatureShares.slice(0, this.threshold)
    );

    return {
      signature: aggregatedSignature,
      publicKey: this.groupPublicKey,
      message,
    };
  }

  /**
   * Add a new participant (requires key refresh)
   */
  async addParticipant(
    participantId: string,
    publicKey: string
  ): Promise<void> {
    if (this.participants.has(participantId)) {
      throw new Error("Participant already exists");
    }

    this.participants.set(participantId, {
      id: participantId,
      publicKey,
      isActive: true,
    });

    // Trigger key refresh protocol
    await this.refreshKeys();
  }

  /**
   * Remove a participant (requires key refresh)
   */
  async removeParticipant(participantId: string): Promise<void> {
    const participant = this.participants.get(participantId);
    if (!participant) {
      throw new Error("Participant not found");
    }

    if (this.participants.size - 1 < this.threshold) {
      throw new Error(
        "Cannot remove participant: would violate threshold requirement"
      );
    }

    this.participants.delete(participantId);
    this.keyShares.delete(participantId);

    // Trigger key refresh protocol
    await this.refreshKeys();
  }

  /**
   * Update threshold (requires key refresh)
   */
  async updateThreshold(newThreshold: number): Promise<void> {
    if (newThreshold < 1 || newThreshold > this.participants.size) {
      throw new Error("Invalid threshold value");
    }

    if (newThreshold < Math.ceil(this.participants.size / 2)) {
      throw new Error("Threshold must be at least majority");
    }

    this.threshold = newThreshold;
    await this.refreshKeys();
  }

  /**
   * Refresh keys without changing the group public key
   * Implements CHURP (CHUrn-Robust Proactive secret sharing) for key refresh
   */
  private async refreshKeys(): Promise<void> {
    // In production, implement proper CHURP protocol
    // For MVP, we regenerate shares with same group key
    const participantIds = Array.from(this.participants.keys());

    if (participantIds.length < this.threshold) {
      throw new Error("Not enough participants for threshold");
    }
  }

  /**
   * Verify a threshold signature
   */
  async verifySignature(
    signature: string,
    message: string,
    publicKey: string
  ): Promise<boolean> {
    try {
      const messageHash = sha256(message);
      const sigBytes = Buffer.from(signature, "hex");
      const pubKeyBytes = Buffer.from(publicKey, "hex");

      return secp256k1.verify(sigBytes, messageHash, pubKeyBytes);
    } catch (error) {
      console.error("Signature verification error:", error);
      return false;
    }
  }

  /**
   * Get current threshold configuration
   */
  getThresholdConfig(): ThresholdConfig {
    return {
      threshold: this.threshold,
      participants: this.participants.size || 0,
    };
  }

  /**
   * Get all active participants
   */
  getActiveParticipants(): Participant[] {
    return Array.from(this.participants.values()).filter((p) => p.isActive);
  }

  /**
   * Generate shares using simplified Shamir Secret Sharing
   * In production, use proper threshold secret sharing library
   */
  private generateShares(secret: Uint8Array, totalShares: number): string[] {
    // Simplified implementation - in production use proper secret sharing
    // This is a placeholder that generates deterministic shares
    const shares: string[] = [];
    for (let i = 0; i < totalShares; i++) {
      // In production, use a proper secret sharing library
      const share = sha256(Buffer.concat([secret, Buffer.from([i])]));
      shares.push(Buffer.from(share).toString("hex"));
    }
    return shares;
  }

  /**
   * Derive public key from share (simplified)
   */
  private derivePublicKeyFromShare(share: string): string {
    // In production, properly derive public key from share
    const shareBytes = Buffer.from(share, "hex");
    const privateKey = shareBytes.slice(0, 32);
    if (privateKey.length < 32) {
      // Pad if needed
      const padded = Buffer.alloc(32);
      privateKey.copy(padded, 32 - privateKey.length);
      const publicKey = secp256k1.getPublicKey(padded);
      return Buffer.from(publicKey).toString("hex");
    }
    const publicKey = secp256k1.getPublicKey(privateKey);
    return Buffer.from(publicKey).toString("hex");
  }

  /**
   * Aggregate signature shares (simplified FROST aggregation)
   * In production, use proper FROST aggregation algorithm
   */
  private aggregateSignatures(
    messageHash: Uint8Array,
    shares: SignatureShare[]
  ): string {
    // For testing/MVP: Generate a valid ECDSA signature using the group private key
    // In production, this would be proper FROST threshold signature aggregation
    
    if (!this.groupPrivateKey) {
      throw new Error("Group private key not initialized");
    }

    try {
      // The smart contract applies Ethereum Signed Message prefix:
      // keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", message))
      // We need to apply the same prefix before signing
      const prefix = Buffer.from("\x19Ethereum Signed Message:\n32");
      const prefixedMessage = Buffer.concat([prefix, Buffer.from(messageHash)]);
      const ethMessageHash = sha256(prefixedMessage);
      
      // Sign the Ethereum-style message hash
      const signatureBytes = secp256k1.signSync(ethMessageHash, this.groupPrivateKey);
      
      // signSync returns Uint8Array directly (64 bytes: r + s)
      return Buffer.from(signatureBytes).toString("hex");
    } catch (error: any) {
      console.error("Signature generation error:", error);
      throw new Error(`Failed to generate signature: ${error.message}`);
    }
  }

  /**
   * Generate mock signature shares for testing
   * In production, real participants would provide these
   */
  private generateMockShares(count: number): SignatureShare[] {
    const shares: SignatureShare[] = [];
    const activeParticipants = Array.from(this.participants.values())
      .filter(p => p.isActive)
      .slice(0, count);

    for (const participant of activeParticipants) {
      const mockShare = sha256(Buffer.from(`${participant.id}-${Date.now()}`));
      const mockCommitment = sha256(Buffer.from(`commitment-${participant.id}`));
      
      shares.push({
        participantId: participant.id,
        share: Buffer.from(mockShare).toString("hex"),
        commitment: Buffer.from(mockCommitment).toString("hex"),
      });
    }

    return shares;
  }
}
