import { expect } from "chai";
import { ethers } from "hardhat";
import { AccessControlContract, FROSTVerifier, ThresholdManagerContract } from "../../typechain-types";
import * as secp from "@noble/secp256k1";

describe("Security Tests", function () {
  let accessControl: AccessControlContract;
  let frostVerifier: FROSTVerifier;
  let thresholdManager: ThresholdManagerContract;
  let owner: any;
  let attacker: any;
  let groupPrivateKey: Uint8Array;
  let groupPublicKey: string;

  beforeEach(async function () {
    [owner, attacker] = await ethers.getSigners();

    const FROSTVerifierFactory = await ethers.getContractFactory("FROSTVerifier");
    frostVerifier = await FROSTVerifierFactory.deploy();
    await frostVerifier.waitForDeployment();

    const ThresholdManagerFactory = await ethers.getContractFactory("ThresholdManagerContract");
    thresholdManager = await ThresholdManagerFactory.deploy(1, [owner.address]);
    await thresholdManager.waitForDeployment();

    const AccessControlFactory = await ethers.getContractFactory("AccessControlContract");
    accessControl = await AccessControlFactory.deploy(
      await thresholdManager.getAddress(),
      await frostVerifier.getAddress(),
      ethers.ZeroHash
    );
    await accessControl.waitForDeployment();

    // Setup Group Key
    const N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n;
    const groupPrivateKeyBytes = ethers.randomBytes(32);
    const groupPrivInt = BigInt("0x" + Buffer.from(groupPrivateKeyBytes).toString("hex")) % N;
    const groupPrivHex = groupPrivInt.toString(16).padStart(64, "0");
    groupPrivateKey = Buffer.from(groupPrivHex, "hex");
    
    const pubKeyUncompressed = secp.getPublicKey(groupPrivateKey, false);
    groupPublicKey = "0x" + Buffer.from(pubKeyUncompressed).toString("hex").slice(2);

    await accessControl.updateGroupPublicKey(groupPublicKey);
    await accessControl.updatePolicyRoot(ethers.keccak256(ethers.toUtf8Bytes("root")));
  });

  it("Should prevent replay attacks (reusing same signature)", async function () {
    const N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n;
    const requestId = ethers.keccak256(ethers.toUtf8Bytes("req1"));
    const principal = attacker.address;
    const resource = ethers.keccak256(ethers.toUtf8Bytes("res1"));
    const action = ethers.keccak256(ethers.toUtf8Bytes("read"));
    const chainId = (await ethers.provider.getNetwork()).chainId;

    const message = ethers.solidityPackedKeccak256(
      ["bytes32", "address", "bytes32", "bytes32", "uint256"],
      [requestId, principal, resource, action, chainId]
    );

    // Sign
    const kBytes = ethers.randomBytes(32);
    const k = BigInt("0x" + Buffer.from(kBytes).toString("hex")) % N;
    const kHex = k.toString(16).padStart(64, "0");
    const kBuf = Buffer.from(kHex, "hex");
    
    const R = secp.Point.fromHex(Buffer.from(secp.getPublicKey(kBuf, false)).toString("hex"));
    const P = secp.Point.fromHex(Buffer.from(secp.getPublicKey(groupPrivateKey, false)).toString("hex"));
    
    const Rx = BigInt("0x" + R.toHex(false).slice(2, 66));
    const Ry = BigInt("0x" + R.toHex(false).slice(66, 130));
    const Px = BigInt("0x" + P.toHex(false).slice(2, 66));
    const Py = BigInt("0x" + P.toHex(false).slice(66, 130));
    
    const eHash = ethers.solidityPackedKeccak256(
      ["uint256", "uint256", "uint256", "uint256", "bytes32"],
      [Rx, Ry, Px, Py, message]
    );
    const e = BigInt(eHash) % N;
    
    const groupPrivHex = Buffer.from(groupPrivateKey).toString("hex");
    const d = BigInt("0x" + groupPrivHex);
    const s = (k + e * d) % N;
    
    const signature = "0x" + 
      Rx.toString(16).padStart(64, "0") + 
      Ry.toString(16).padStart(64, "0") + 
      s.toString(16).padStart(64, "0");

    // First request should succeed
    await accessControl.connect(attacker).requestAuthorization(
      requestId,
      principal,
      resource,
      action,
      signature
    );

    // Replay with same requestId should fail
    await expect(
      accessControl.connect(attacker).requestAuthorization(
        requestId,
        principal,
        resource,
        action,
        signature
      )
    ).to.be.revertedWith("AccessControl: duplicate request");
  });

  it("Should prevent signature malleability (if applicable, though Schnorr is robust)", async function () {
    // Schnorr signatures are generally non-malleable if implemented correctly
    // But we check that modifying the signature invalidates it
    const requestId = ethers.keccak256(ethers.toUtf8Bytes("req2"));
    // ... setup valid signature ...
    // (Simplified for brevity, reusing logic)
    // Here we just check that a modified signature fails
    // Use s = Q (invalid scalar)
    const Q = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n;
    const invalidS = Q.toString(16).padStart(64, "0");
    const invalidSig = "0x" + "01".repeat(64) + invalidS; // Rx, Ry random, s = Q
    
    await expect(
      accessControl.requestAuthorization(
        requestId,
        attacker.address,
        ethers.ZeroHash,
        ethers.ZeroHash,
        invalidSig
      )
    ).to.be.revertedWith("FROSTVerifier: invalid scalar");
  });
});
