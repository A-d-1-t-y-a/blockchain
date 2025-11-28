/**
 * ThresholdManagerContract Smart Contract Tests
 * 
 * Tests threshold management (8 test cases)
 */

import { expect } from "chai";
import { ethers } from "hardhat";
import { ThresholdManagerContract } from "../../typechain-types";

describe("ThresholdManagerContract Tests", function () {
  let thresholdManager: ThresholdManagerContract;
  let owner: any;
  let participant1: any;
  let participant2: any;
  let participant3: any;
  let participant4: any;
  let participant5: any;

  beforeEach(async function () {
    [owner, participant1, participant2, participant3, participant4, participant5] =
      await ethers.getSigners();

    const initialParticipants = [
      participant1.address,
      participant2.address,
      participant3.address,
    ];

    const ThresholdManagerFactory = await ethers.getContractFactory(
      "ThresholdManagerContract"
    );
    thresholdManager = await ThresholdManagerFactory.deploy(
      2,
      initialParticipants
    );
  });

  describe("Threshold Management (TC-SC-TM-001 to TC-SC-TM-008)", function () {
    it("TC-SC-TM-001: Should deploy with correct threshold and participants", async function () {
      const config = await thresholdManager.getThresholdConfig();
      expect(config.threshold).to.equal(2);
      expect(config.totalParticipants).to.equal(3);
    });

    it("TC-SC-TM-002: Should update threshold by authorized role", async function () {
      await thresholdManager.updateThreshold(3);
      const config = await thresholdManager.getThresholdConfig();
      expect(config.threshold).to.equal(3);
    });

    it("TC-SC-TM-003: Should reject invalid threshold (below majority)", async function () {
      await expect(thresholdManager.updateThreshold(1)).to.be.revertedWith(
        "ThresholdManager: threshold must be majority"
      );
    });

    it("TC-SC-TM-004: Should add participant", async function () {
      await thresholdManager.addParticipant(participant4.address);
      const participants = await thresholdManager.getActiveParticipants();
      expect(participants.length).to.equal(4);
    });

    it("TC-SC-TM-005: Should remove participant", async function () {
      await thresholdManager.removeParticipant(participant1.address);
      const participants = await thresholdManager.getActiveParticipants();
      expect(participants.length).to.equal(2);
    });

    it("TC-SC-TM-006: Should not remove if violates threshold", async function () {
      await thresholdManager.removeParticipant(participant1.address);
      await expect(
        thresholdManager.removeParticipant(participant2.address)
      ).to.be.revertedWith("ThresholdManager: removal would violate threshold");
    });

    it("TC-SC-TM-007: Should get threshold configuration", async function () {
      const config = await thresholdManager.getThresholdConfig();
      expect(config.threshold).to.be.a("bigint");
      expect(config.totalParticipants).to.be.a("bigint");
    });

    it("TC-SC-TM-008: Should get active participants list", async function () {
      const participants = await thresholdManager.getActiveParticipants();
      expect(Array.isArray(participants)).to.be.true;
      expect(participants.length).to.equal(3);
    });
  });
});

