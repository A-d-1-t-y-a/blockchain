// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./libraries/EllipticCurve.sol";

/**
 * @title FROSTVerifier
 * @dev On-chain FROST threshold signature verification
 * Implements Schnorr signature verification over secp256k1
 */
contract FROSTVerifier {
    // secp256k1 group order
    uint256 constant public Q = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141;

    /**
     * @dev Verify a FROST aggregated signature (Schnorr)
     * Signature format: (R_x, R_y, s) where R is the commitment and s is the scalar response
     * @param message Message that was signed
     * @param signature Aggregated signature (96 bytes: R_x || R_y || s)
     * @param publicKey Group public key (64 bytes: P_x || P_y) - uncompressed
     * @return valid True if signature is valid
     */
    function verifyFROSTSignature(
        bytes32 message,
        bytes calldata signature,
        bytes calldata publicKey
    ) external view returns (bool valid) {
        require(signature.length == 96, "FROSTVerifier: invalid signature length");
        require(publicKey.length == 64, "FROSTVerifier: invalid public key length");
        
        // Extract R_x, R_y, s from signature
        uint256 Rx;
        uint256 Ry;
        uint256 s;
        
        assembly {
            Rx := calldataload(signature.offset)
            Ry := calldataload(add(signature.offset, 0x20))
            s := calldataload(add(signature.offset, 0x40))
        }
        
        // Extract P_x, P_y from public key
        uint256 Px;
        uint256 Py;
        
        assembly {
            Px := calldataload(publicKey.offset)
            Py := calldataload(add(publicKey.offset, 0x20))
        }

        // Validate s is within curve order
        require(s < Q, "FROSTVerifier: invalid scalar");
        
        // Validate coordinates are field elements
        require(Rx < EllipticCurve.PP && Ry < EllipticCurve.PP, "FROSTVerifier: invalid coordinates");
        require(Px < EllipticCurve.PP && Py < EllipticCurve.PP, "FROSTVerifier: invalid public key");

        // Schnorr verification:
        // e = H(R || P || m)
        // s * G = R + e * P
        
        // 1. Calculate challenge e
        // We use a specific encoding for the hash: R_x (32) || R_y (32) || P_x (32) || P_y (32) || m (32)
        bytes32 eHash = keccak256(abi.encodePacked(Rx, Ry, Px, Py, message));
        uint256 e = uint256(eHash) % Q;
        
        // 2. Calculate s * G
        (uint256 sGx, uint256 sGy) = EllipticCurve.ecMul(s, EllipticCurve.GX, EllipticCurve.GY);
        
        // 3. Calculate e * P
        (uint256 ePx, uint256 ePy) = EllipticCurve.ecMul(e, Px, Py);
        
        // 4. Calculate R + e * P
        (uint256 RHSx, uint256 RHSy) = EllipticCurve.ecAdd(Rx, Ry, ePx, ePy);
        
        // 5. Check if s * G == R + e * P
        return (sGx == RHSx) && (sGy == RHSy);
    }

    /**
     * @dev Verify multiple FROST signatures in batch
     */
    function verifyBatch(
        bytes32[] calldata messages,
        bytes[] calldata signatures,
        bytes[] calldata publicKeys
    ) external view returns (bool[] memory results) {
        require(
            messages.length == signatures.length && signatures.length == publicKeys.length,
            "FROSTVerifier: array length mismatch"
        );
        
        results = new bool[](messages.length);
        
        for (uint256 i = 0; i < messages.length; i++) {
            results[i] = this.verifyFROSTSignature(messages[i], signatures[i], publicKeys[i]);
        }
    }

    /**
     * @dev Hash message for FROST signing
     */
    function hashMessage(bytes calldata data) external pure returns (bytes32 hash) {
        return keccak256(data);
    }
}
