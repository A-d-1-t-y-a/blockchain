/**
 * Policy Tree Builder Service
 * 
 * Builds Merkle trees from policies and generates proofs for verification
 */

import { keccak256, toUtf8Bytes, hexlify } from "ethers";

export interface Policy {
  resource: string;
  action: string;
  principal: string;
  granted: boolean;
}

export interface PolicyProof {
  proof: string[];
  index: number;
  leaf: string;
}

export class PolicyTreeBuilder {
  private policies: Policy[] = [];
  private tree: { root: string; leaves: string[] } | null = null;

  /**
   * Add a policy to the tree
   */
  addPolicy(policy: Policy): void {
    this.policies.push(policy);
    this.tree = null; // Invalidate tree
  }

  /**
   * Add multiple policies at once
   */
  addPolicies(policies: Policy[]): void {
    this.policies.push(...policies);
    this.tree = null;
  }

  /**
   * Build Merkle tree from current policies
   * @returns Merkle root
   */
  buildTree(): string {
    if (this.policies.length === 0) {
      throw new Error("No policies to build tree from");
    }

    const leaves = this.policies.map((p, index) => 
      this.hashPolicy(p.resource, p.action, p.principal, p.granted)
    );

    // Calculate root using iterative approach (similar to Solidity)
    const root = this.calculateRoot(leaves);
    
    this.tree = {
      root,
      leaves
    };

    return root;
  }

  /**
   * Get Merkle proof for a specific policy
   */
  getProof(
    resource: string,
    action: string,
    principal: string,
    granted: boolean = true
  ): PolicyProof | null {
    if (!this.tree) {
      this.buildTree();
    }

    const leaf = this.hashPolicy(resource, action, principal, granted);
    const leafIndex = this.tree!.leaves.findIndex(l => l === leaf);

    if (leafIndex === -1) {
      return null; // Policy not found
    }

    const proof = this.generateProof(leafIndex, this.tree!.leaves);

    return {
      proof,
      index: leafIndex,
      leaf
    };
  }

  /**
   * Get current Merkle root
   */
  getRoot(): string {
    if (!this.tree) {
      this.buildTree();
    }
    return this.tree!.root;
  }

  /**
   * Clear all policies
   */
  clear(): void {
    this.policies = [];
    this.tree = null;
  }

  /**
   * Get all policies
   */
  getPolicies(): Policy[] {
    return [...this.policies];
  }

  /**
   * Hash a policy entry (matches Solidity MerkleTree.hashPolicy)
   */
  private hashPolicy(
    resource: string,
    action: string,
    principal: string,
    granted: boolean
  ): string {
    // Convert to bytes32 (keccak256 hash of strings, matching Solidity)
    const resourceBytes = keccak256(toUtf8Bytes(resource));
    const actionBytes = keccak256(toUtf8Bytes(action));
    
    // Principal is an address, convert to bytes32
    // Remove 0x prefix and pad to 32 bytes
    let principalBytes: string;
    if (principal.startsWith("0x")) {
      principalBytes = hexlify(principal).padEnd(66, "0");
    } else if (principal.startsWith("arn:")) {
      // For ARN format, hash it
      principalBytes = keccak256(toUtf8Bytes(principal));
    } else {
      principalBytes = keccak256(toUtf8Bytes(principal));
    }
    
    // Hash the policy (matching Solidity: keccak256(abi.encodePacked(resource, action, principal)))
    // Convert to bytes and concatenate
    const resourceHex = resourceBytes.slice(2);
    const actionHex = actionBytes.slice(2);
    const principalHex = principalBytes.slice(2);
    
    // Concatenate and hash (matching Solidity abi.encodePacked)
    const concatenated = resourceHex + actionHex + principalHex;
    return keccak256("0x" + concatenated);
  }

  /**
   * Calculate Merkle root from leaves (matches Solidity implementation)
   */
  private calculateRoot(leaves: string[]): string {
    if (leaves.length === 1) {
      return leaves[0];
    }

    let currentLevel = [...leaves];
    let length = currentLevel.length;

    while (length > 1) {
      const newLength = Math.ceil(length / 2);
      const nextLevel: string[] = [];

      for (let i = 0; i < newLength; i++) {
        const leftIndex = i * 2;
        const rightIndex = leftIndex + 1;

        const left = currentLevel[leftIndex];
        const right = rightIndex < length ? currentLevel[rightIndex] : left;

        // Hash pair (matching Solidity keccak256(abi.encodePacked(left, right)))
        const leftHex = left.slice(2);
        const rightHex = right.slice(2);
        const concatenated = leftHex + rightHex;
        nextLevel.push(keccak256("0x" + concatenated));
      }

      currentLevel = nextLevel;
      length = newLength;
    }

    return currentLevel[0];
  }

  /**
   * Generate Merkle proof for a leaf at given index
   */
  private generateProof(leafIndex: number, leaves: string[]): string[] {
    const proof: string[] = [];
    let index = leafIndex;
    let currentLevel = [...leaves];
    let length = currentLevel.length;

    while (length > 1) {
      const siblingIndex = index % 2 === 0 ? index + 1 : index - 1;
      
      if (siblingIndex < length) {
        proof.push(currentLevel[siblingIndex]);
      } else {
        // If no sibling, use the node itself (for odd number of nodes)
        proof.push(currentLevel[index]);
      }

      // Move to next level
      const newLength = Math.ceil(length / 2);
      const nextLevel: string[] = [];

      for (let i = 0; i < newLength; i++) {
        const leftIndex = i * 2;
        const rightIndex = leftIndex + 1;

        const left = currentLevel[leftIndex];
        const right = rightIndex < length ? currentLevel[rightIndex] : left;

        const leftHex = left.slice(2);
        const rightHex = right.slice(2);
        const concatenated = leftHex + rightHex;
        nextLevel.push(keccak256("0x" + concatenated));
      }

      currentLevel = nextLevel;
      index = Math.floor(index / 2);
      length = newLength;
    }

    return proof;
  }
}

