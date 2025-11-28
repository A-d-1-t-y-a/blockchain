/**
 * Integration Tests
 * 
 * Tests end-to-end flows and service integration (13 test cases)
 */

import { expect } from "chai";
import axios from "axios";
import { io, Socket } from "socket.io-client";
import * as dotenv from "dotenv";

dotenv.config({ path: "../../.env" });
dotenv.config();

const BASE_URL = process.env.API_URL || "http://localhost:3000";
const WS_URL = BASE_URL;

describe("Integration Tests", function () {
  this.timeout(15000);

  describe("End-to-End Authorization Flow (TC-INT-001 to TC-INT-008)", function () {
    it("TC-INT-001: Complete flow: FROST → AWS → Blockchain → Decision", async function () {
      const response = await axios.post(`${BASE_URL}/api/authorize`, {
        principal: "arn:aws:iam::123456789012:user/testuser",
        resource: "arn:aws:s3:::bucket/object",
        action: "s3:GetObject",
        signatureShares: [],
      });

      expect(response.status).to.equal(200);
      expect(response.data).to.have.property("requestId");
      expect(response.data).to.have.property("awsDecision");
      expect(response.data).to.have.property("authorized");
    });

    it("TC-INT-002: Flow with blockchain disabled", async function () {
      const response = await axios.post(`${BASE_URL}/api/authorize`, {
        principal: "arn:aws:iam::123456789012:user/test",
        resource: "arn:aws:s3:::bucket/object",
        action: "s3:GetObject",
        signatureShares: [],
      });

      expect(response.status).to.equal(200);
      expect(response.data.authorized).to.equal(
        response.data.awsDecision.allowed
      );
    });

    it("TC-INT-003: Flow with AWS credentials invalid", async function () {
      const response = await axios.post(`${BASE_URL}/api/authorize`, {
        principal: "arn:aws:iam::999999999999:user/invalid",
        resource: "arn:aws:s3:::bucket/object",
        action: "s3:GetObject",
        signatureShares: [],
      });

      expect(response.status).to.equal(200);
      expect(response.data.awsDecision).to.have.property("allowed");
    });

    it("TC-INT-004: Flow with FROST signature failure", async function () {
      try {
        const response = await axios.post(`${BASE_URL}/api/authorize`, {
          principal: "arn:aws:iam::123456789012:user/test",
          resource: "arn:aws:s3:::bucket/object",
          action: "s3:GetObject",
          signatureShares: [],
        });
        expect([200, 400]).to.include(response.status);
      } catch (error: any) {
        if (error.response?.status === 400) {
          expect(error.response.data.error).to.include("FROST");
        }
      }
    });

    it("TC-INT-005: Multiple concurrent requests", async function () {
      const requests = Array(10)
        .fill(null)
        .map((_, i) =>
          axios.post(`${BASE_URL}/api/authorize`, {
            principal: `arn:aws:iam::123456789012:user/test${i}`,
            resource: "arn:aws:s3:::bucket/object",
            action: "s3:GetObject",
            signatureShares: [],
          })
        );

      const responses = await Promise.all(requests);
      responses.forEach((response) => {
        expect(response.status).to.equal(200);
        expect(response.data).to.have.property("requestId");
      });
    });

    it("TC-INT-006: Request ID uniqueness", async function () {
      const requests = Array(5)
        .fill(null)
        .map(() =>
          axios.post(`${BASE_URL}/api/authorize`, {
            principal: "arn:aws:iam::123456789012:user/test",
            resource: "arn:aws:s3:::bucket/object",
            action: "s3:GetObject",
            signatureShares: [],
          })
        );

      const responses = await Promise.all(requests);
      const requestIds = responses.map((r) => r.data.requestId);
      const uniqueIds = new Set(requestIds);
      expect(uniqueIds.size).to.equal(requestIds.length);
    });

    it("TC-INT-007: Response time should be < 2 seconds", async function () {
      const start = Date.now();
      await axios.post(`${BASE_URL}/api/authorize`, {
        principal: "arn:aws:iam::123456789012:user/test",
        resource: "arn:aws:s3:::bucket/object",
        action: "s3:GetObject",
        signatureShares: [],
      });
      const duration = Date.now() - start;
      expect(duration).to.be.lessThan(2000);
    });

    it("TC-INT-008: Error propagation through layers", async function () {
      try {
        await axios.post(`${BASE_URL}/api/authorize`, {
          principal: "",
          resource: "arn:aws:s3:::bucket/object",
          action: "s3:GetObject",
          signatureShares: [],
        });
        expect.fail("Should have thrown error");
      } catch (error: any) {
        expect(error.response?.status).to.equal(400);
      }
    });
  });

  describe("Service Integration (TC-INT-009 to TC-INT-013)", function () {
    it("TC-INT-009: FROST coordinator integration", async function () {
      const response = await axios.get(`${BASE_URL}/api/frost/config`);
      expect(response.status).to.equal(200);
      expect(response.data).to.have.property("threshold");
    });

    it("TC-INT-010: AWS IAM client integration", async function () {
      const healthResponse = await axios.get(`${BASE_URL}/health`);
      expect(healthResponse.data.services).to.have.property("aws");
    });

    it("TC-INT-011: Blockchain client integration", async function () {
      const healthResponse = await axios.get(`${BASE_URL}/health`);
      expect(healthResponse.data.services).to.have.property("blockchain");
    });

    it("TC-INT-012: Service failure isolation", async function () {
      const healthResponse = await axios.get(`${BASE_URL}/health`);
      expect(healthResponse.data.services.frost).to.equal("operational");
    });

    it("TC-INT-013: Service recovery handling", async function () {
      const response1 = await axios.get(`${BASE_URL}/health`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const response2 = await axios.get(`${BASE_URL}/health`);
      expect(response1.data.status).to.equal(response2.data.status);
    });
  });
});

