// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title EllipticCurve
 * @dev Library for Elliptic Curve operations on secp256k1
 * Based on Witnet's elliptic-curve-solidity
 */
library EllipticCurve {
    // secp256k1 parameters
    uint256 constant public GX = 0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798;
    uint256 constant public GY = 0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8;
    uint256 constant public AA = 0;
    uint256 constant public BB = 7;
    uint256 constant public PP = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2F;
    uint256 constant public NN = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141;

    /**
     * @dev Modular euclidean inverse of a number (mod p).
     * @param _x The number
     * @param _pp The modulus
     * @return q such that x*q = 1 (mod pp)
     */
    function invMod(uint256 _x, uint256 _pp) internal view returns (uint256) {
        require(_x != 0 && _x != _pp && _pp != 0, "Invalid number");
        return expMod(_x, _pp - 2, _pp);
    }

    /**
     * @dev Modular exponentiation, b^e % m
     * @param _base Base
     * @param _exp Exponent
     * @param _mod Modulus
     * @return res The result
     */
    function expMod(uint256 _base, uint256 _exp, uint256 _mod) internal view returns (uint256 res) {
        if (_base == 0) return 0;
        if (_exp == 0) return 1;
        (bool success, bytes memory data) = address(0x05).staticcall(abi.encode(32, 32, 32, _base, _exp, _mod));
        require(success, "expMod failed");
        res = abi.decode(data, (uint256));
    }

    /**
     * @dev Elliptic curve point addition
     * @param _x1 The X coordinate of the first point
     * @param _y1 The Y coordinate of the first point
     * @param _x2 The X coordinate of the second point
     * @param _y2 The Y coordinate of the second point
     * @return x The X coordinate of the result
     * @return y The Y coordinate of the result
     */
    function ecAdd(
        uint256 _x1,
        uint256 _y1,
        uint256 _x2,
        uint256 _y2
    ) internal view returns (uint256 x, uint256 y) {
        uint256 x1 = _x1;
        uint256 y1 = _y1;
        uint256 x2 = _x2;
        uint256 y2 = _y2;

        if (x1 == 0 && y1 == 0) return (x2, y2);
        if (x2 == 0 && y2 == 0) return (x1, y1);

        if (x1 == x2) {
            if (y1 == y2) {
                return ecDouble(x1, y1);
            } else {
                return (0, 0);
            }
        }

        uint256 s = mulmod(submod(y2, y1, PP), invMod(submod(x2, x1, PP), PP), PP);
        x = submod(submod(mulmod(s, s, PP), x1, PP), x2, PP);
        y = submod(mulmod(s, submod(x1, x, PP), PP), y1, PP);
    }

    /**
     * @dev Elliptic curve point doubling
     * @param _x The X coordinate of the point
     * @param _y The Y coordinate of the point
     * @return x The X coordinate of the result
     * @return y The Y coordinate of the result
     */
    function ecDouble(uint256 _x, uint256 _y) internal view returns (uint256 x, uint256 y) {
        if (_x == 0 && _y == 0) return (0, 0);

        uint256 s = mulmod(mulmod(3, mulmod(_x, _x, PP), PP), invMod(mulmod(2, _y, PP), PP), PP);
        x = submod(mulmod(s, s, PP), mulmod(2, _x, PP), PP);
        y = submod(mulmod(s, submod(_x, x, PP), PP), _y, PP);
    }

    /**
     * @dev Elliptic curve point multiplication
     * @param _k The scalar
     * @param _x The X coordinate of the point
     * @param _y The Y coordinate of the point
     * @return x The X coordinate of the result
     * @return y The Y coordinate of the result
     */
    function ecMul(
        uint256 _k,
        uint256 _x,
        uint256 _y
    ) internal view returns (uint256 x, uint256 y) {
        uint256 k = _k;
        uint256 x1 = _x;
        uint256 y1 = _y;

        x = 0;
        y = 0;

        while (k > 0) {
            if (k % 2 == 1) {
                (x, y) = ecAdd(x, y, x1, y1);
            }
            (x1, y1) = ecDouble(x1, y1);
            k /= 2;
        }
    }

    /**
     * @dev Subtraction modulo p
     */
    /**
     * @dev Subtraction modulo p
     */
    function submod(uint256 _a, uint256 _b, uint256 _pp) internal pure returns (uint256) {
        if (_a >= _b) {
            return _a - _b;
        }
        return _pp - (_b - _a);
    }
}
