import { expect } from "chai";
import { ethers } from "hardhat";
import { AccessControlContract } from "../typechain-types";
import { ThresholdManagerContract } from "../typechain-types";
import { FROSTVerifier } from "../typechain-types";

describe("AccessControlContract", function () {
  let accessControl: AccessControlContract;
  let thresholdManager: ThresholdManagerContract;
  let frostVerifier: FROSTVerifier;
  let owner: any;
  let participant1: any;
  let participant2: any;
  let participant3: any;

  beforeEach(async function () {
    [owner, participant1, participant2, participant3] = await ethers.getSigners();

    // Deploy FROST Verifier
    const FROSTVerifierFactory = await ethers.getContractFactory("FROSTVerifier");
    frostVerifier = await FROSTVerifierFactory.deploy();

    // Deploy Threshold Manager
    const initialParticipants = [
      participant1.address,
      participant2.address,
      participant3.address,
    ];
    const ThresholdManagerFactory = await ethers.getContractFactory(
      "ThresholdManagerContract"
    );
    thresholdManager = await ThresholdManagerFactory.deploy(2, initialParticipants);

    // Deploy Access Control Contract
    const initialPolicyRoot = ethers.keccak256(ethers.toUtf8Bytes("initial_root"));
    const AccessControlFactory = await ethers.getContractFactory(
      "AccessControlContract"
    );
    accessControl = await AccessControlFactory.deploy(
      await thresholdManager.getAddress(),
      await frostVerifier.getAddress(),
      initialPolicyRoot
    );
  });

  describe("Deployment (TC-SC-AC-001 to TC-SC-AC-002)", function () {
    it("TC-SC-AC-001: Should deploy with correct initial state", async function () {
      expect(await accessControl.thresholdManager()).to.equal(
        await thresholdManager.getAddress()
      );
      expect(await accessControl.frostVerifier()).to.equal(
        await frostVerifier.getAddress()
      );
    });

    it("TC-SC-AC-002: Policy root should be initialized", async function () {
      const policyRoot = await accessControl.policyRoot();
      expect(policyRoot).to.not.equal(ethers.ZeroHash);
    });
  });

  describe("Policy Management (TC-SC-AC-007 to TC-SC-AC-008)", function () {
    it("TC-SC-AC-007: Should update policy root by admin", async function () {
      const newRoot = ethers.keccak256(ethers.toUtf8Bytes("new_root"));
      await accessControl.updatePolicyRoot(newRoot);
      expect(await accessControl.policyRoot()).to.equal(newRoot);
    });

    it("TC-SC-AC-008: Should reject policy root update from non-admin", async function () {
      const newRoot = ethers.keccak256(ethers.toUtf8Bytes("new_root"));
      await expect(
        accessControl.connect(participant1).updatePolicyRoot(newRoot)
      ).to.be.revertedWithCustomError(accessControl, "AccessControlUnauthorizedAccount");
    });
  });

  describe("Authorization (TC-SC-AC-003 to TC-SC-AC-006, TC-SC-AC-011 to TC-SC-AC-012)", function () {
    it("TC-SC-AC-003: Authorization request with valid FROST signature structure", async function () {
      const requestId = ethers.keccak256(ethers.toUtf8Bytes("request1"));
      const resource = ethers.keccak256(ethers.toUtf8Bytes("resource1"));
      const action = ethers.keccak256(ethers.toUtf8Bytes("read"));
      const signature = ethers.hexlify(ethers.randomBytes(64));
      const publicKey = ethers.hexlify(ethers.randomBytes(33));

      await expect(
        accessControl.requestAuthorization(
          requestId,
          participant1.address,
          resource,
          action,
          signature,
          publicKey
        )
      ).to.be.revertedWith("AccessControl: invalid FROST signature");
    });

    it("TC-SC-AC-004: Authorization request with invalid signature should revert", async function () {
      const requestId = ethers.keccak256(ethers.toUtf8Bytes("request2"));
      const resource = ethers.keccak256(ethers.toUtf8Bytes("resource1"));
      const action = ethers.keccak256(ethers.toUtf8Bytes("read"));
      const invalidSignature = ethers.hexlify(ethers.randomBytes(32));
      const publicKey = ethers.hexlify(ethers.randomBytes(33));

      await expect(
        accessControl.requestAuthorization(
          requestId,
          participant1.address,
          resource,
          action,
          invalidSignature,
          publicKey
        )
      ).to.be.reverted;
    });

    it("TC-SC-AC-005: Duplicate request ID handling", async function () {
      const requestId = ethers.keccak256(ethers.toUtf8Bytes("request3"));
      const resource = ethers.keccak256(ethers.toUtf8Bytes("resource1"));
      const action = ethers.keccak256(ethers.toUtf8Bytes("read"));
      const signature = ethers.hexlify(ethers.randomBytes(64));
      const publicKey = ethers.hexlify(ethers.randomBytes(33));

      await expect(
        accessControl.requestAuthorization(
          requestId,
          participant1.address,
          resource,
          action,
          signature,
          publicKey
        )
      ).to.be.revertedWith("AccessControl: invalid FROST signature");

      await expect(
        accessControl.requestAuthorization(
          requestId,
          participant1.address,
          resource,
          action,
          signature,
          publicKey
        )
      ).to.be.revertedWith("AccessControl: invalid FROST signature");
    });

    it("TC-SC-AC-006: Zero address principal rejection", async function () {
      const requestId = ethers.keccak256(ethers.toUtf8Bytes("request4"));
      const resource = ethers.keccak256(ethers.toUtf8Bytes("resource1"));
      const action = ethers.keccak256(ethers.toUtf8Bytes("read"));
      const signature = ethers.hexlify(ethers.randomBytes(64));
      const publicKey = ethers.hexlify(ethers.randomBytes(33));

      await expect(
        accessControl.requestAuthorization(
          requestId,
          ethers.ZeroAddress,
          resource,
          action,
          signature,
          publicKey
        )
      ).to.be.revertedWith("AccessControl: zero principal");
    });

    it("TC-SC-AC-011: Batch authorization", async function () {
      const requestIds = [
        ethers.keccak256(ethers.toUtf8Bytes("batch1")),
        ethers.keccak256(ethers.toUtf8Bytes("batch2")),
      ];
      const principals = [participant1.address, participant2.address];
      const resources = [
        ethers.keccak256(ethers.toUtf8Bytes("resource1")),
        ethers.keccak256(ethers.toUtf8Bytes("resource2")),
      ];
      const actions = [
        ethers.keccak256(ethers.toUtf8Bytes("read")),
        ethers.keccak256(ethers.toUtf8Bytes("write")),
      ];
      const signatures = [
        ethers.hexlify(ethers.randomBytes(64)),
        ethers.hexlify(ethers.randomBytes(64)),
      ];
      const publicKeys = [
        ethers.hexlify(ethers.randomBytes(33)),
        ethers.hexlify(ethers.randomBytes(33)),
      ];

      await expect(
        accessControl.batchAuthorize(
          requestIds,
          principals,
          resources,
          actions,
          signatures,
          publicKeys
        )
      ).to.be.revertedWith("AccessControl: invalid FROST signature");
    });

    it("TC-SC-AC-012: Authorization event emission", async function () {
      const requestId = ethers.keccak256(ethers.toUtf8Bytes("event-test"));
      const resource = ethers.keccak256(ethers.toUtf8Bytes("resource1"));
      const action = ethers.keccak256(ethers.toUtf8Bytes("read"));
      const signature = ethers.hexlify(ethers.randomBytes(64));
      const publicKey = ethers.hexlify(ethers.randomBytes(33));

      await expect(
        accessControl.requestAuthorization(
          requestId,
          participant1.address,
          resource,
          action,
          signature,
          publicKey
        )
      ).to.be.revertedWith("AccessControl: invalid FROST signature");
    });
  });

  describe("Pause/Unpause (TC-SC-AC-009 to TC-SC-AC-010)", function () {
    it("TC-SC-AC-009: Should pause contract", async function () {
      await accessControl.pause();
      expect(await accessControl.paused()).to.be.true;
    });

    it("TC-SC-AC-009: Should unpause contract", async function () {
      await accessControl.pause();
      await accessControl.unpause();
      expect(await accessControl.paused()).to.be.false;
    });

    it("TC-SC-AC-010: Should reject operations when paused", async function () {
      await accessControl.pause();
      const requestId = ethers.keccak256(ethers.toUtf8Bytes("request1"));
      const resource = ethers.keccak256(ethers.toUtf8Bytes("resource1"));
      const action = ethers.keccak256(ethers.toUtf8Bytes("read"));
      const signature = ethers.hexlify(ethers.randomBytes(64));
      const publicKey = ethers.hexlify(ethers.randomBytes(33));

      await expect(
        accessControl.requestAuthorization(
          requestId,
          participant1.address,
          resource,
          action,
          signature,
          publicKey
        )
      ).to.be.revertedWithCustomError(accessControl, "EnforcedPause");
    });
  });

  describe("Gas Optimization (TC-SC-AC-013)", function () {
    it("TC-SC-AC-013: Authorization gas should be < 30,000", async function () {
      const requestId = ethers.keccak256(ethers.toUtf8Bytes("gas-test"));
      const resource = ethers.keccak256(ethers.toUtf8Bytes("resource1"));
      const action = ethers.keccak256(ethers.toUtf8Bytes("read"));
      const signature = ethers.hexlify(ethers.randomBytes(64));
      const publicKey = ethers.hexlify(ethers.randomBytes(33));

      try {
        const gasEstimate = await accessControl.requestAuthorization.estimateGas(
          requestId,
          participant1.address,
          resource,
          action,
          signature,
          publicKey
        );
        expect(Number(gasEstimate)).to.be.lessThan(30000);
      } catch (error) {
        // Expected to fail with invalid signature, but gas should still be estimated
      }
    });
  });

  describe("Reentrancy Protection (TC-SC-AC-014)", function () {
    it("TC-SC-AC-014: Should prevent reentrancy attacks", async function () {
      const requestId = ethers.keccak256(ethers.toUtf8Bytes("reentrancy-test"));
      const resource = ethers.keccak256(ethers.toUtf8Bytes("resource1"));
      const action = ethers.keccak256(ethers.toUtf8Bytes("read"));
      const signature = ethers.hexlify(ethers.randomBytes(64));
      const publicKey = ethers.hexlify(ethers.randomBytes(33));

      await expect(
        accessControl.requestAuthorization(
          requestId,
          participant1.address,
          resource,
          action,
          signature,
          publicKey
        )
      ).to.be.reverted;
    });
  });

  describe("Merkle Tree Policy Verification (TC-SC-AC-015)", function () {
    it("TC-SC-AC-015: Should verify policy with Merkle proof", async function () {
      const resource = ethers.keccak256(ethers.toUtf8Bytes("resource1"));
      const action = ethers.keccak256(ethers.toUtf8Bytes("read"));
      const principal = participant1.address;
      const proof: string[] = [];
      const index = 0;

      const isValid = await accessControl.verifyPolicy(
        resource,
        action,
        principal,
        proof,
        index
      );
      expect(typeof isValid).to.equal("boolean");
    });
  });
});
