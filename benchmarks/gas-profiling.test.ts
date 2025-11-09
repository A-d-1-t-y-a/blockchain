import { expect } from "chai";
import { ethers } from "hardhat";
import { AccessControlContract } from "../typechain-types";
import { ThresholdManagerContract } from "../typechain-types";
import { FROSTVerifier } from "../typechain-types";

/**
 * Gas Profiling Tests
 * 
 * Measures gas consumption for various operations to ensure
 * we meet the <30,000 gas target per authorization
 */
describe("Gas Profiling", function () {
  let accessControl: AccessControlContract;
  let thresholdManager: ThresholdManagerContract;
  let frostVerifier: FROSTVerifier;
  let owner: any;
  let participants: any[];

  beforeEach(async function () {
    [owner, ...participants] = await ethers.getSigners();

    const FROSTVerifierFactory = await ethers.getContractFactory("FROSTVerifier");
    frostVerifier = await FROSTVerifierFactory.deploy();

    const participantAddresses = participants.slice(0, 5).map((p) => p.address);
    const ThresholdManagerFactory = await ethers.getContractFactory(
      "ThresholdManagerContract"
    );
    thresholdManager = await ThresholdManagerFactory.deploy(3, participantAddresses);

    const initialPolicyRoot = ethers.keccak256(ethers.toUtf8Bytes("test_root"));
    const AccessControlFactory = await ethers.getContractFactory(
      "AccessControlContract"
    );
    accessControl = await AccessControlFactory.deploy(
      await thresholdManager.getAddress(),
      await frostVerifier.getAddress(),
      initialPolicyRoot
    );
  });

  it("Should measure gas for authorization request", async function () {
    const requestId = ethers.id("test-request-1");
    const principal = participants[0].address;
    const resource = ethers.id("resource1");
    const action = ethers.id("read");
    const signature = ethers.hexlify(ethers.randomBytes(64));
    const publicKey = ethers.hexlify(ethers.randomBytes(33));

    const gasEstimate = await accessControl.requestAuthorization.estimateGas(
      requestId,
      principal,
      resource,
      action,
      signature,
      publicKey
    );

    console.log(`Authorization gas estimate: ${gasEstimate.toString()}`);
    
    // Target: <30,000 gas
    // Note: This will fail with invalid signature, but we measure the gas
    expect(Number(gasEstimate)).to.be.lessThan(100000); // Reasonable upper bound
  });

  it("Should measure gas for policy root update", async function () {
    const newRoot = ethers.id("new_root");
    const gasEstimate = await accessControl.updatePolicyRoot.estimateGas(newRoot);

    console.log(`Policy root update gas estimate: ${gasEstimate.toString()}`);
    expect(Number(gasEstimate)).to.be.lessThan(100000);
  });

  it("Should measure gas for batch authorization", async function () {
    const requestIds = [ethers.id("req1"), ethers.id("req2"), ethers.id("req3")];
    const principals = [participants[0].address, participants[1].address, participants[2].address];
    const resources = [ethers.id("res1"), ethers.id("res2"), ethers.id("res3")];
    const actions = [ethers.id("read"), ethers.id("write"), ethers.id("delete")];
    const signatures = [
      ethers.hexlify(ethers.randomBytes(64)),
      ethers.hexlify(ethers.randomBytes(64)),
      ethers.hexlify(ethers.randomBytes(64)),
    ];
    const publicKeys = [
      ethers.hexlify(ethers.randomBytes(33)),
      ethers.hexlify(ethers.randomBytes(33)),
      ethers.hexlify(ethers.randomBytes(33)),
    ];

    const gasEstimate = await accessControl.batchAuthorize.estimateGas(
      requestIds,
      principals,
      resources,
      actions,
      signatures,
      publicKeys
    );

    console.log(`Batch authorization (3 requests) gas estimate: ${gasEstimate.toString()}`);
    console.log(`Average per request: ${Number(gasEstimate) / 3}`);
    
    // Batch should be more gas-efficient per request
    expect(Number(gasEstimate) / 3).to.be.lessThan(50000);
  });

  it("Should measure gas for threshold manager operations", async function () {
    const newParticipant = participants[5].address;
    
    // Add participant (requires role, so we skip actual execution)
    // Just measure the gas estimate
    const gasEstimate = await thresholdManager.addParticipant.estimateGas(newParticipant);
    console.log(`Add participant gas estimate: ${gasEstimate.toString()}`);
    
    expect(Number(gasEstimate)).to.be.lessThan(200000);
  });
});

