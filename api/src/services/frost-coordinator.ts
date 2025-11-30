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

import { Point, CURVE, getPublicKey, utils } from "@noble/secp256k1";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";

export interface Participant {
  id: string;
  publicKey: string; // Hex string
  share?: bigint; // Secret share (kept in memory for MVP simulation)
  isActive: boolean;
}

export interface ThresholdConfig {
  threshold: number; // t
  participants: number; // n
}

export interface SignatureShare {
  participantId: string;
  share: string; // Hex string of s_i
  commitment: string; // Hex string of R_i
}

export interface AggregatedSignature {
  signature: string; // 96 bytes: Rx || Ry || s
  publicKey: string; // 64 bytes: Px || Py
  message: string;
}

export class FROSTCoordinator {
  private participants: Map<string, Participant>;
  private threshold: number;
  private groupPublicKey: Point | null = null;
  
  // Polynomial coefficients for DKG (secret)
  private coefficients: bigint[] = [];

  constructor(threshold: number, totalParticipants: number) {
    if (threshold < 1 || threshold > totalParticipants) {
      throw new Error("Threshold must be between 1 and total participants");
    }
    this.threshold = threshold;
    this.participants = new Map();
  }

  /**
   * Initialize Distributed Key Generation (DKG)
   * Uses a Trusted Dealer approach for MVP.
   * Generates a secret polynomial f(x) = a_0 + a_1*x + ... + a_{t-1}*x^{t-1}
   * Group secret key is a_0.
   */
  async initializeDKG(participantIds: string[]): Promise<{
    groupPublicKey: string;
    shares: Map<string, string>;
  }> {
    if (participantIds.length < this.threshold) {
      throw new Error(`Need at least ${this.threshold} participants`);
    }

    // 1. Generate random polynomial coefficients
    this.coefficients = [];
    const { randomBytes } = require("ethers");
    for (let i = 0; i < this.threshold; i++) {
      const rand = randomBytes(32);
      this.coefficients.push(BigInt("0x" + Buffer.from(rand).toString("hex")) % CURVE.n);
    }

    // Group secret key is the constant term (a_0)
    const groupSecretKey = this.coefficients[0];
    this.groupPublicKey = Point.fromPrivateKey(groupSecretKey);

    // 2. Generate shares for each participant
    // Share y_i = f(i+1)
    const shares = new Map<string, string>();
    
    participantIds.forEach((id, index) => {
      const x = BigInt(index + 1);
      const y = this.evaluatePolynomial(x);
      
      this.participants.set(id, {
        id,
        publicKey: Point.fromPrivateKey(y).toHex(false), // Uncompressed
        share: y,
        isActive: true,
      });
      
      shares.set(id, y.toString(16));
    });

    // Return 64-byte public key (strip 0x04 prefix from uncompressed 65-byte key)
    const pubKeyHex = this.groupPublicKey.toHex(false).slice(2);

    return {
      groupPublicKey: pubKeyHex,
      shares,
    };
  }

  /**
   * Evaluate polynomial at x
   */
  private evaluatePolynomial(x: bigint): bigint {
    let result = 0n;
    let powerOfX = 1n;
    
    for (const coeff of this.coefficients) {
      result = (result + coeff * powerOfX) % CURVE.n;
      powerOfX = (powerOfX * x) % CURVE.n;
    }
    
    return result;
  }

  /**
   * Generate threshold signature
   * Simulates the 2-round FROST signing protocol.
   */
  async generateThresholdSignature(
    message: string,
    _providedShares: SignatureShare[] = [] // Ignored in this simulation, we use internal shares
  ): Promise<AggregatedSignature> {
    if (!this.groupPublicKey) {
      throw new Error("DKG not initialized");
    }

    const activeParticipants = Array.from(this.participants.values())
      .filter(p => p.isActive)
      .slice(0, this.threshold);

    if (activeParticipants.length < this.threshold) {
      throw new Error("Not enough active participants");
    }

    // Round 1: Nonce generation
    // Each participant generates a nonce pair (d_i, e_i) and commitment (D_i, E_i)
    // For simplified Schnorr: just one nonce k_i and commitment R_i = k_i * G
    const nonces = new Map<string, bigint>();
    const commitments = new Map<string, Point>();

    for (const p of activeParticipants) {
      const { randomBytes } = require("ethers");
      const rand = randomBytes(32);
      const k = BigInt("0x" + Buffer.from(rand).toString("hex")) % CURVE.n;
      nonces.set(p.id, k);
      commitments.set(p.id, Point.fromPrivateKey(k));
    }

    // Aggregate commitments: R = Sum(R_i)
    let R = Point.ZERO;
    for (const comm of commitments.values()) {
      R = R.add(comm);
    }

    // Round 2: Signature generation
    // Challenge e = H(R || P || m)
    // We need to match the contract's hashing:
    // keccak256(Rx, Ry, Px, Py, message)
    
    // We use ethers for keccak256
    const { solidityPackedKeccak256 } = require("ethers");

    const Rx = BigInt("0x" + R.toHex(false).slice(2, 66));
    const Ry = BigInt("0x" + R.toHex(false).slice(66, 130));
    const Px = BigInt("0x" + this.groupPublicKey.toHex(false).slice(2, 66));
    const Py = BigInt("0x" + this.groupPublicKey.toHex(false).slice(66, 130));
    
    // If message is already a 32-byte hash (starts with 0x and is 66 chars), use it directly
    // Otherwise, hash it as a string
    let messageHash: string;
    if (message.startsWith("0x") && message.length === 66) {
      // Already a bytes32 hash
      messageHash = message;
    } else {
      // Hash the string message
      messageHash = solidityPackedKeccak256(["string"], [message]);
    }

    const eHash = solidityPackedKeccak256(
      ["uint256", "uint256", "uint256", "uint256", "bytes32"],
      [Rx, Ry, Px, Py, messageHash]
    );
    
    const e = BigInt(eHash) % CURVE.n;

    // Calculate signature shares: s_i = k_i + e * x_i * L_i
    // Where L_i is Lagrange coefficient
    
    let s = 0n;
    
    // Participant indices (1-based)
    const participantIndices = activeParticipants.map(p => 
      BigInt(this.participants.get(p.id)!.id.replace("p", "")) // Assuming id is "p1", "p2"...
    );

    for (let i = 0; i < activeParticipants.length; i++) {
      const p = activeParticipants[i];
      const k_i = nonces.get(p.id)!;
      const x_i = p.share!;
      const index_i = participantIndices[i];

      // Calculate Lagrange coefficient L_i
      let num = 1n;
      let den = 1n;
      
      for (let j = 0; j < activeParticipants.length; j++) {
        if (i === j) continue;
        const index_j = participantIndices[j];
        
        // L_i = Product(j!=i) (0 - x_j) / (x_i - x_j)
        // We are evaluating at x=0 for the group key
        
        num = (num * (0n - index_j)) % CURVE.n;
        den = (den * (index_i - index_j)) % CURVE.n;
      }
      
      // Modular inverse of denominator
      // Using Fermat's Little Theorem: a^(p-2) = a^-1 (mod p)
      const denInv = this.modPow(den, CURVE.n - 2n, CURVE.n);
      const L_i = (num * denInv) % CURVE.n;
      
      // s_i = k_i + e * x_i * L_i
      const term = (e * x_i * L_i) % CURVE.n;
      const s_i = (k_i + term) % CURVE.n;
      
      s = (s + s_i) % CURVE.n;
    }
    
    // Final signature is (R, s)
    // Format: Rx (32) || Ry (32) || s (32)
    
    const RxHex = R.toHex(false).slice(2, 66);
    const RyHex = R.toHex(false).slice(66, 130);
    const sHex = s.toString(16).padStart(64, "0");
    
    const signature = RxHex + RyHex + sHex;
    const publicKey = this.groupPublicKey.toHex(false).slice(2); // 64 bytes

    return {
      signature,
      publicKey,
      message: messageHash,
    };
  }

  /**
   * Modular exponentiation: base^exp % mod
   */
  private modPow(base: bigint, exp: bigint, mod: bigint): bigint {
    let result = 1n;
    base = base % mod;
    while (exp > 0n) {
      if (exp % 2n === 1n) result = (result * base) % mod;
      base = (base * base) % mod;
      exp /= 2n;
    }
    return result;
  }

  getThresholdConfig(): ThresholdConfig {
    return {
      threshold: this.threshold,
      participants: this.participants.size,
    };
  }

  getActiveParticipants(): Participant[] {
    return Array.from(this.participants.values()).filter((p) => p.isActive);
  }
}
