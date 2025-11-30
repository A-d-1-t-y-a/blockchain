import { expect } from "chai";
import { ethers } from "hardhat";
import { FROSTVerifier } from "../../typechain-types";
import * as secp from "@noble/secp256k1";

describe("FROSTVerifier", function () {
  let frostVerifier: FROSTVerifier;

  beforeEach(async function () {
    const FROSTVerifierFactory = await ethers.getContractFactory("FROSTVerifier");
    frostVerifier = await FROSTVerifierFactory.deploy();
    await frostVerifier.waitForDeployment();
  });

  it("Should verify a valid Schnorr signature", async function () {
    // Curve order n
    const N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n;

    // Generate random key pair
    const privateKeyBytes = ethers.randomBytes(32);
    const privateKey = BigInt("0x" + Buffer.from(privateKeyBytes).toString("hex")) % N;
    
    // Convert to hex for secp functions
    const privKeyHex = privateKey.toString(16).padStart(64, "0");

    // Contract expects 64 bytes (uncompressed without prefix)
    const pubKeyUncompressed = secp.getPublicKey(Buffer.from(privKeyHex, "hex"), false);
    const pubKey64 = "0x" + Buffer.from(pubKeyUncompressed).toString("hex").slice(2);

    // Message to sign
    const message = "Hello FROST";
    const messageHash = ethers.keccak256(ethers.toUtf8Bytes(message));
    
    // Sign using Schnorr
    // Generate nonce k
    const kBytes = ethers.randomBytes(32);
    const k = BigInt("0x" + Buffer.from(kBytes).toString("hex")) % N;
    const kHex = k.toString(16).padStart(64, "0");
    
    const R = secp.Point.fromHex(Buffer.from(secp.getPublicKey(Buffer.from(kHex, "hex"), false)).toString("hex"));
    const P = secp.Point.fromHex(Buffer.from(secp.getPublicKey(Buffer.from(privKeyHex, "hex"), false)).toString("hex"));
    
    const Rx = BigInt("0x" + R.toHex(false).slice(2, 66));
    const Ry = BigInt("0x" + R.toHex(false).slice(66, 130));
    const Px = BigInt("0x" + P.toHex(false).slice(2, 66));
    const Py = BigInt("0x" + P.toHex(false).slice(66, 130));
    
    // Calculate e matching contract
    const eHash = ethers.solidityPackedKeccak256(
      ["uint256", "uint256", "uint256", "uint256", "bytes32"],
      [Rx, Ry, Px, Py, messageHash]
    );
    const e = BigInt(eHash) % N;
    
    // Calculate s = k + e * d
    const s = (k + e * privateKey) % N;
    
    // Construct signature 96 bytes
    const signature = "0x" + 
      Rx.toString(16).padStart(64, "0") + 
      Ry.toString(16).padStart(64, "0") + 
      s.toString(16).padStart(64, "0");

    const valid = await frostVerifier.verifyFROSTSignature(
      messageHash,
      signature,
      pubKey64
    );

    expect(valid).to.be.true;
  });

  it("Should reject invalid signature", async function () {
    const N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n;
    const privateKeyBytes = ethers.randomBytes(32);
    const privKeyInt = BigInt("0x" + Buffer.from(privateKeyBytes).toString("hex")) % N;
    const privKeyHex = privKeyInt.toString(16).padStart(64, "0");
    const privateKey = Buffer.from(privKeyHex, "hex");
    
    const pubKeyUncompressed = secp.getPublicKey(privateKey, false);
    const pubKey64 = "0x" + Buffer.from(pubKeyUncompressed).toString("hex").slice(2);
    
    const message = "Hello FROST";
    const messageHash = ethers.keccak256(ethers.toUtf8Bytes(message));
    
    // Generate valid signature components
    const kBytes = ethers.randomBytes(32);
    const k = BigInt("0x" + Buffer.from(kBytes).toString("hex")) % N;
    const kHex = k.toString(16).padStart(64, "0");
    const R = secp.Point.fromHex(Buffer.from(secp.getPublicKey(Buffer.from(kHex, "hex"), false)).toString("hex"));
    
    const Rx = BigInt("0x" + R.toHex(false).slice(2, 66));
    const Ry = BigInt("0x" + R.toHex(false).slice(66, 130));
    const P = secp.Point.fromHex(Buffer.from(pubKeyUncompressed).toString("hex"));
    const Px = BigInt("0x" + P.toHex(false).slice(2, 66));
    const Py = BigInt("0x" + P.toHex(false).slice(66, 130));
    
    const eHash = ethers.solidityPackedKeccak256(
      ["uint256", "uint256", "uint256", "uint256", "bytes32"],
      [Rx, Ry, Px, Py, messageHash]
    );
    const e = BigInt(eHash) % N;
    const s = (k + e * privKeyInt) % N;
    
    // Modify s to be invalid (s + 1)
    const invalidS = (s + 1n) % N;
    
    const invalidSig = "0x" + 
      Rx.toString(16).padStart(64, "0") + 
      Ry.toString(16).padStart(64, "0") + 
      invalidS.toString(16).padStart(64, "0");

    const valid = await frostVerifier.verifyFROSTSignature(
      messageHash,
      invalidSig,
      pubKey64
    );

    expect(valid).to.be.false;
  });
});
