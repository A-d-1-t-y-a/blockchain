// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title MerkleTree
 * @dev Gas-optimized Merkle tree implementation for policy storage
 * Uses packed storage and efficient hashing to minimize gas costs
 */
library MerkleTree {
    /**
     * @dev Calculate Merkle root from leaves
     * @param leaves Array of leaf hashes
     * @return root Merkle root hash
     */
    function calculateRoot(bytes32[] memory leaves) internal pure returns (bytes32 root) {
        require(leaves.length > 0, "MerkleTree: empty leaves array");
        
        if (leaves.length == 1) {
            return leaves[0];
        }

        // Gas-optimized iterative Merkle root calculation
        uint256 length = leaves.length;
        bytes32[] memory currentLevel = new bytes32[](length);
        
        // Copy leaves to current level
        for (uint256 i = 0; i < length; i++) {
            currentLevel[i] = leaves[i];
        }
        
        // Build tree level by level
        while (length > 1) {
            uint256 newLength = (length + 1) / 2;
            bytes32[] memory nextLevel = new bytes32[](newLength);
            
            for (uint256 i = 0; i < newLength; i++) {
                uint256 leftIndex = i * 2;
                uint256 rightIndex = leftIndex + 1;
                
                bytes32 left = currentLevel[leftIndex];
                bytes32 right = rightIndex < length ? currentLevel[rightIndex] : left;
                
                nextLevel[i] = keccak256(abi.encodePacked(left, right));
            }
            
            currentLevel = nextLevel;
            length = newLength;
        }
        
        return currentLevel[0];
    }

    /**
     * @dev Verify Merkle proof
     * @param leaf Leaf hash to verify
     * @param proof Array of sibling hashes in the proof path
     * @param root Merkle root to verify against
     * @param index Index of the leaf in the tree
     * @return valid True if proof is valid
     */
    function verifyProof(
        bytes32 leaf,
        bytes32[] memory proof,
        bytes32 root,
        uint256 index
    ) internal pure returns (bool valid) {
        bytes32 computedHash = leaf;
        
        for (uint256 i = 0; i < proof.length; i++) {
            bytes32 proofElement = proof[i];
            
            if (index % 2 == 0) {
                computedHash = keccak256(abi.encodePacked(computedHash, proofElement));
            } else {
                computedHash = keccak256(abi.encodePacked(proofElement, computedHash));
            }
            
            index = index / 2;
        }
        
        return computedHash == root;
    }

    /**
     * @dev Hash a policy entry
     * @param resource Resource identifier
     * @param action Action (read, write, delete, etc.)
     * @param principal Principal (user/role identifier)
     * @return hash Hash of the policy entry
     */
    function hashPolicy(
        bytes32 resource,
        bytes32 action,
        address principal
    ) internal pure returns (bytes32 hash) {
        return keccak256(abi.encodePacked(resource, action, principal));
    }
}

