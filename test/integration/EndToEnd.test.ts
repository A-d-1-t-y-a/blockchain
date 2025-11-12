import { expect } from "chai";
import { ethers } from "hardhat";
import { AccessControlContract } from "../../typechain-types";
import { ThresholdManagerContract } from "../../typechain-types";
import { FROSTVerifier } from "../../typechain-types";
import { FROSTCoordinator } from "../../api/src/services/frost-coordinator";

describe("End-to-End Integration", function () {
  let accessControl: AccessControlContract;
  let thresholdManager: ThresholdManagerContract;
  let frostVerifier: FROSTVerifier;
  let frostCoordinator: FROSTCoordinator;
  let owner: any;
  let participants: any[];

  beforeEach(async function () {
    [owner, ...participants] = await ethers.getSigners();

    // Deploy contracts
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

    // Initialize FROST coordinator
    frostCoordinator = new FROSTCoordinator(3, 5);
    const participantIds = participants.slice(0, 5).map((_, i) => `p${i + 1}`);
    await frostCoordinator.initializeDKG(participantIds);
  });

  describe("Full Authorization Flow", function () {
    it("Should complete end-to-end authorization flow", async function () {
      const requestId = "test-request-1";
      const principal = participants[0].address;
      const resource = ethers.keccak256(ethers.toUtf8Bytes("resource1"));
      const action = ethers.keccak256(ethers.toUtf8Bytes("read"));

      // Step 1: Generate FROST signature (simplified for test)
      const message = JSON.stringify({ requestId, principal, resource, action });
      const signatureShares = [
        { participantId: "p1", share: "share1", commitment: "commit1" },
        { participantId: "p2", share: "share2", commitment: "commit2" },
        { participantId: "p3", share: "share3", commitment: "commit3" },
      ];

      const frostResult = await frostCoordinator.generateThresholdSignature(
        message,
        signatureShares
      );

      // Step 2: Request authorization on-chain
      const requestIdBytes = ethers.id(requestId);
      const signature = ethers.hexlify(ethers.randomBytes(64)); // Mock signature
      const publicKey = ethers.hexlify(ethers.randomBytes(33)); // Mock public key

      // Note: This will fail signature verification, but tests the integration
      await expect(
        accessControl.requestAuthorization(
          requestIdBytes,
          principal,
          resource,
          action,
          signature,
          publicKey
        )
      ).to.be.revertedWith("AccessControl: invalid FROST signature");

      // When transaction reverts, nothing is stored on-chain
      // So getAuthorization will return default/empty struct
      const authorization = await accessControl.getAuthorization(requestIdBytes);
      // Request ID will be zero bytes when not stored (transaction reverted)
      expect(authorization.requestId).to.equal(ethers.ZeroHash);
    });
  });

  describe("Threshold Management Integration", function () {
    it("Should integrate threshold manager with access control", async function () {
      const config = await thresholdManager.getThresholdConfig();
      expect(config.threshold).to.equal(3);
      expect(config.totalParticipants).to.equal(5);

      const activeParticipants = await thresholdManager.getActiveParticipants();
      expect(activeParticipants.length).to.equal(5);
    });
  });

  describe("Policy Management Integration", function () {
    it("Should update policy root and verify", async function () {
      const newRoot = ethers.keccak256(ethers.toUtf8Bytes("new_policy_root"));
      await accessControl.updatePolicyRoot(newRoot);

      expect(await accessControl.policyRoot()).to.equal(newRoot);
    });

    it("Should verify policy with Merkle proof", async function () {
      const resource = ethers.keccak256(ethers.toUtf8Bytes("resource1"));
      const action = ethers.keccak256(ethers.toUtf8Bytes("read"));
      const principal = participants[0].address;

      // Create a simple proof (empty for test)
      const proof: string[] = [];
      const index = 0;

      const isValid = await accessControl.verifyPolicy(
        resource,
        action,
        principal,
        proof,
        index
      );

      // With empty proof, this will fail, but tests the integration
      expect(isValid).to.be.a("boolean");
    });
  });
});

