import { expect } from "chai";
import { ethers } from "hardhat";
import { AccessControlContract, FROSTVerifier, ThresholdManagerContract } from "../../typechain-types";
import * as secp from "@noble/secp256k1";

describe("AccessControlContract", function () {
  let accessControl: AccessControlContract;
  let frostVerifier: FROSTVerifier;
  let thresholdManager: ThresholdManagerContract;
  let owner: any;
  let user: any;
  let groupPrivateKey: Uint8Array;
  let groupPublicKey: string; // 64 bytes hex

  beforeEach(async function () {
    [owner, user] = await ethers.getSigners();

    // Deploy Verifier
    const FROSTVerifierFactory = await ethers.getContractFactory("FROSTVerifier");
    frostVerifier = await FROSTVerifierFactory.deploy();
    await frostVerifier.waitForDeployment();

    // Deploy Threshold Manager
    const ThresholdManagerFactory = await ethers.getContractFactory("ThresholdManagerContract");
    thresholdManager = await ThresholdManagerFactory.deploy(1, [owner.address]);
    await thresholdManager.waitForDeployment();

    // Deploy Access Control
    const AccessControlFactory = await ethers.getContractFactory("AccessControlContract");
    accessControl = await AccessControlFactory.deploy(
      await thresholdManager.getAddress(),
      await frostVerifier.getAddress(),
      ethers.ZeroHash // Initial policy root
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
  });

  it("Should authorize with valid FROST signature", async function () {
    const N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n;
    const requestId = ethers.keccak256(ethers.toUtf8Bytes("req1"));
    const principal = user.address;
    const resource = ethers.keccak256(ethers.toUtf8Bytes("res1"));
    const action = ethers.keccak256(ethers.toUtf8Bytes("read"));
    const chainId = (await ethers.provider.getNetwork()).chainId;

    // Message to sign: keccak256(requestId, principal, resource, action, chainId)
    const message = ethers.solidityPackedKeccak256(
      ["bytes32", "address", "bytes32", "bytes32", "uint256"],
      [requestId, principal, resource, action, chainId]
    );

    // Sign
    const kBytes = ethers.randomBytes(32);
    const k = BigInt("0x" + Buffer.from(kBytes).toString("hex")) % N;
    const kHex = k.toString(16).padStart(64, "0");
    
    const R = secp.Point.fromHex(Buffer.from(secp.getPublicKey(Buffer.from(kHex, "hex"), false)).toString("hex"));
    // groupPrivateKey is Uint8Array, convert to hex for Point
    const groupPrivHex = Buffer.from(groupPrivateKey).toString("hex");
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
    
    const d = BigInt("0x" + groupPrivHex);
    const s = (k + e * d) % N;
    
    const signature = "0x" + 
      Rx.toString(16).padStart(64, "0") + 
      Ry.toString(16).padStart(64, "0") + 
      s.toString(16).padStart(64, "0");

    // We also need to set a policy root or mock checkPolicy to return true
    // In the contract, _checkPolicy returns true if policyRoot != 0
    await accessControl.updatePolicyRoot(ethers.keccak256(ethers.toUtf8Bytes("root")));

    const tx = await accessControl.requestAuthorization(
      requestId,
      principal,
      resource,
      action,
      signature
    );
    
    await expect(tx).to.emit(accessControl, "AuthorizationDecided")
      .withArgs(requestId, true, signature);
  });
});
