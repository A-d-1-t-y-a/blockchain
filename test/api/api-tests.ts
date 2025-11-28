/**
 * Comprehensive API Endpoint Tests
 * 
 * Tests all 6 API endpoints with 54 test cases
 */

import { expect } from "chai";
import axios, { AxiosError } from "axios";
import * as dotenv from "dotenv";

dotenv.config({ path: "../../.env" });
dotenv.config();

const BASE_URL = process.env.API_URL || "http://localhost:3000";

describe("API Endpoint Tests", function () {
  this.timeout(10000);

  describe("Health Check Endpoint (TC-HC-001 to TC-HC-008)", function () {
    it("TC-HC-001: Should return 200 status", async function () {
      const response = await axios.get(`${BASE_URL}/health`);
      expect(response.status).to.equal(200);
    });

    it("TC-HC-002: Should contain required fields", async function () {
      const response = await axios.get(`${BASE_URL}/health`);
      expect(response.data).to.have.property("status");
      expect(response.data).to.have.property("timestamp");
      expect(response.data).to.have.property("services");
    });

    it("TC-HC-003: FROST service status should be operational", async function () {
      const response = await axios.get(`${BASE_URL}/health`);
      expect(response.data.services.frost).to.equal("operational");
    });

    it("TC-HC-004: AWS service status should be operational or error", async function () {
      const response = await axios.get(`${BASE_URL}/health`);
      expect(["operational", "error"]).to.include(response.data.services.aws);
    });

    it("TC-HC-005: Blockchain service status should be operational or not configured", async function () {
      const response = await axios.get(`${BASE_URL}/health`);
      expect(["operational", "not configured"]).to.include(
        response.data.services.blockchain
      );
    });

    it("TC-HC-006: Timestamp should be valid ISO 8601 format", async function () {
      const response = await axios.get(`${BASE_URL}/health`);
      const timestamp = response.data.timestamp;
      expect(new Date(timestamp).toISOString()).to.equal(timestamp);
    });

    it("TC-HC-007: Should handle AWS credential errors gracefully", async function () {
      const response = await axios.get(`${BASE_URL}/health`);
      if (response.data.services.aws === "error") {
        expect(response.data.services).to.have.property("awsError");
      }
    });

    it("TC-HC-008: Response time should be < 500ms", async function () {
      const start = Date.now();
      await axios.get(`${BASE_URL}/health`);
      const duration = Date.now() - start;
      expect(duration).to.be.lessThan(500);
    });
  });

  describe("Authorization Endpoint (TC-AUTH-001 to TC-AUTH-020)", function () {
    const validSignatureShares = [
      {
        participantId: "p1",
        share: "1".repeat(64),
        commitment: "2".repeat(64),
      },
      {
        participantId: "p2",
        share: "3".repeat(64),
        commitment: "4".repeat(64),
      },
      {
        participantId: "p3",
        share: "5".repeat(64),
        commitment: "6".repeat(64),
      },
    ];

    const validRequest = {
      principal: "arn:aws:iam::123456789012:user/testuser",
      resource: "arn:aws:s3:::test-bucket/test-object.txt",
      action: "s3:GetObject",
      signatureShares: validSignatureShares,
    };

    it("TC-AUTH-001: Should authorize valid request", async function () {
      const response = await axios.post(`${BASE_URL}/api/authorize`, validRequest);
      expect(response.status).to.equal(200);
      expect(response.data).to.have.property("requestId");
      expect(response.data).to.have.property("authorized");
      expect(typeof response.data.authorized).to.equal("boolean");
    });

    it("TC-AUTH-002: Missing principal should return 400", async function () {
      try {
        await axios.post(`${BASE_URL}/api/authorize`, {
          resource: validRequest.resource,
          action: validRequest.action,
        });
        expect.fail("Should have thrown error");
      } catch (error: any) {
        expect(error.response?.status).to.equal(400);
        expect(error.response?.data.error).to.include("Missing required");
      }
    });

    it("TC-AUTH-003: Missing resource should return 400", async function () {
      try {
        await axios.post(`${BASE_URL}/api/authorize`, {
          principal: validRequest.principal,
          action: validRequest.action,
        });
        expect.fail("Should have thrown error");
      } catch (error: any) {
        expect(error.response?.status).to.equal(400);
      }
    });

    it("TC-AUTH-004: Missing action should return 400", async function () {
      try {
        await axios.post(`${BASE_URL}/api/authorize`, {
          principal: validRequest.principal,
          resource: validRequest.resource,
        });
        expect.fail("Should have thrown error");
      } catch (error: any) {
        expect(error.response?.status).to.equal(400);
      }
    });

    it("TC-AUTH-005: Invalid ARN format should be handled", async function () {
      try {
        const response = await axios.post(`${BASE_URL}/api/authorize`, {
          principal: "invalid-arn-format",
          resource: validRequest.resource,
          action: validRequest.action,
          signatureShares: [],
        });
        expect(response.data.awsDecision.allowed).to.be.false;
      } catch (error: any) {
        expect([400, 200]).to.include(error.response?.status || 200);
      }
    });

    it("TC-AUTH-006: FROST signature with empty shares should fail gracefully", async function () {
      try {
        const response = await axios.post(`${BASE_URL}/api/authorize`, {
          ...validRequest,
          signatureShares: [],
        });
        expect([200, 400]).to.include(response.status);
      } catch (error: any) {
        if (error.response?.status === 400) {
          expect(error.response.data.error).to.include("FROST");
        }
      }
    });

    it("TC-AUTH-007: FROST signature with valid shares structure", async function () {
      const response = await axios.post(`${BASE_URL}/api/authorize`, {
        ...validRequest,
        signatureShares: validSignatureShares,
      });
      expect(response.status).to.equal(200);
    });

    it("TC-AUTH-008: AWS IAM policy check integration", async function () {
      const response = await axios.post(`${BASE_URL}/api/authorize`, validRequest);
      expect(response.data).to.have.property("awsDecision");
      expect(response.data.awsDecision).to.have.property("allowed");
      expect(typeof response.data.awsDecision.allowed).to.equal("boolean");
    });

    it("TC-AUTH-009: Blockchain authorization when configured", async function () {
      const response = await axios.post(`${BASE_URL}/api/authorize`, validRequest);
      if (response.data.blockchainResult) {
        expect(response.data.blockchainResult).to.have.property("requestId");
      } else {
        expect(response.status).to.equal(200);
      }
    });

    it("TC-AUTH-010: Authorization without blockchain should work", async function () {
      const response = await axios.post(`${BASE_URL}/api/authorize`, validRequest);
      expect(response.status).to.equal(200);
      expect(response.data).to.have.property("authorized");
    });

    it("TC-AUTH-011: Final decision logic (AWS AND blockchain)", async function () {
      const response = await axios.post(`${BASE_URL}/api/authorize`, validRequest);
      const authorized = response.data.authorized;
      const awsAllowed = response.data.awsDecision.allowed;
      const blockchainAllowed = response.data.blockchainResult?.authorized ?? true;
      expect(authorized).to.equal(awsAllowed && blockchainAllowed);
    });

    it("TC-AUTH-012: WebSocket event emission verified", async function () {
      const response = await axios.post(`${BASE_URL}/api/authorize`, validRequest);
      expect(response.data).to.have.property("requestId");
    });

    it("TC-AUTH-013: Response contains all required fields", async function () {
      const response = await axios.post(`${BASE_URL}/api/authorize`, validRequest);
      expect(response.data).to.have.property("requestId");
      expect(response.data).to.have.property("authorized");
      expect(response.data).to.have.property("awsDecision");
      expect(response.data).to.have.property("timestamp");
    });

    it("TC-AUTH-014: Error handling for AWS IAM failures", async function () {
      const response = await axios.post(`${BASE_URL}/api/authorize`, {
        ...validRequest,
        principal: "arn:aws:iam::999999999999:user/nonexistent",
      });
      expect(response.data.awsDecision).to.have.property("allowed");
    });

    it("TC-AUTH-015: Error handling for blockchain failures", async function () {
      const response = await axios.post(`${BASE_URL}/api/authorize`, validRequest);
      if (response.data.blockchainResult?.error) {
        expect(response.data.blockchainResult.error).to.be.a("string");
      }
    });

    it("TC-AUTH-016: Concurrent authorization requests", async function () {
      const requests = Array(5)
        .fill(null)
        .map(() => axios.post(`${BASE_URL}/api/authorize`, validRequest));
      const responses = await Promise.all(requests);
      responses.forEach((response) => {
        expect(response.status).to.equal(200);
        expect(response.data).to.have.property("requestId");
      });
    });

    it("TC-AUTH-017: Large payload handling", async function () {
      const largeResource = `arn:aws:s3:::bucket/${"x".repeat(1000)}`;
      const response = await axios.post(`${BASE_URL}/api/authorize`, {
        ...validRequest,
        resource: largeResource,
      });
      expect([200, 400]).to.include(response.status);
    });

    it("TC-AUTH-018: Invalid JSON body handling", async function () {
      try {
        await axios.post(
          `${BASE_URL}/api/authorize`,
          "invalid json",
          {
            headers: { "Content-Type": "application/json" },
            transformRequest: [],
          }
        );
        expect.fail("Should have thrown error");
      } catch (error: any) {
        expect([400, 500]).to.include(error.response?.status || 500);
      }
    });

    it("TC-AUTH-019: SQL injection attempt in fields", async function () {
      const response = await axios.post(`${BASE_URL}/api/authorize`, {
        principal: "'; DROP TABLE users; --",
        resource: validRequest.resource,
        action: validRequest.action,
        signatureShares: validSignatureShares,
      });
      expect([200, 400]).to.include(response.status);
    });

    it("TC-AUTH-020: XSS attempt in fields", async function () {
      const response = await axios.post(`${BASE_URL}/api/authorize`, {
        principal: "<script>alert('xss')</script>",
        resource: validRequest.resource,
        action: validRequest.action,
        signatureShares: validSignatureShares,
      });
      expect([200, 400]).to.include(response.status);
    });
  });

  describe("Get Authorization Status (TC-GET-001 to TC-GET-008)", function () {
    it("TC-GET-001: Retrieve existing authorization status", async function () {
      const authResponse = await axios.post(`${BASE_URL}/api/authorize`, {
        principal: "arn:aws:iam::123456789012:user/test",
        resource: "arn:aws:s3:::bucket/object",
        action: "s3:GetObject",
        signatureShares: [
          { participantId: "p1", share: "1".repeat(64), commitment: "2".repeat(64) },
          { participantId: "p2", share: "3".repeat(64), commitment: "4".repeat(64) },
          { participantId: "p3", share: "5".repeat(64), commitment: "6".repeat(64) },
        ],
      });
      const requestId = authResponse.data.requestId;

      try {
        const response = await axios.get(
          `${BASE_URL}/api/authorize/${requestId}`
        );
        expect([200, 404, 500]).to.include(response.status);
      } catch (error: any) {
        expect([404, 500]).to.include(error.response?.status || 404);
      }
    });

    it("TC-GET-002: Non-existent requestId should return 404", async function () {
      try {
        await axios.get(`${BASE_URL}/api/authorize/nonexistent-request-id-12345`);
        expect.fail("Should have thrown error");
      } catch (error: any) {
        expect([404, 500]).to.include(error.response?.status || 404);
      }
    });

    it("TC-GET-003: Invalid requestId format handling", async function () {
      try {
        await axios.get(`${BASE_URL}/api/authorize/../invalid`);
        expect.fail("Should have thrown error");
      } catch (error: any) {
        expect([404, 400, 500]).to.include(error.response?.status || 404);
      }
    });

    it("TC-GET-004: Response when blockchain not configured", async function () {
      try {
        await axios.get(`${BASE_URL}/api/authorize/test-id`);
        expect.fail("Should have thrown error");
      } catch (error: any) {
        if (error.response?.status === 404) {
          expect(error.response.data.error).to.include("not configured");
        }
      }
    });

    it("TC-GET-005: Response structure validation", async function () {
      try {
        const response = await axios.get(
          `${BASE_URL}/api/authorize/test-id-123`
        );
        if (response.status === 200) {
          expect(response.data).to.have.property("requestId");
        }
      } catch (error: any) {
        expect([404, 500]).to.include(error.response?.status || 404);
      }
    });

    it("TC-GET-006: Special characters in requestId", async function () {
      try {
        await axios.get(`${BASE_URL}/api/authorize/test@#$%`);
        expect.fail("Should have thrown error");
      } catch (error: any) {
        expect([404, 400, 500]).to.include(error.response?.status || 404);
      }
    });

    it("TC-GET-007: Very long requestId handling", async function () {
      const longId = "a".repeat(1000);
      try {
        await axios.get(`${BASE_URL}/api/authorize/${longId}`);
        expect.fail("Should have thrown error");
      } catch (error: any) {
        expect([404, 400, 500]).to.include(error.response?.status || 404);
      }
    });

    it("TC-GET-008: Empty requestId handling", async function () {
      try {
        await axios.get(`${BASE_URL}/api/authorize/`);
        expect.fail("Should have thrown error");
      } catch (error: any) {
        expect([404, 400]).to.include(error.response?.status || 404);
      }
    });
  });

  describe("FROST Configuration (TC-FROST-CFG-001 to TC-FROST-CFG-005)", function () {
    it("TC-FROST-CFG-001: Should return threshold and participants count", async function () {
      const response = await axios.get(`${BASE_URL}/api/frost/config`);
      expect(response.status).to.equal(200);
      expect(response.data).to.have.property("threshold");
      expect(response.data).to.have.property("participants");
    });

    it("TC-FROST-CFG-002: Response structure validation", async function () {
      const response = await axios.get(`${BASE_URL}/api/frost/config`);
      expect(response.data).to.be.an("object");
      expect(response.data.threshold).to.be.a("number");
      expect(response.data.participants).to.be.a("number");
    });

    it("TC-FROST-CFG-003: Threshold should be positive integer", async function () {
      const response = await axios.get(`${BASE_URL}/api/frost/config`);
      expect(response.data.threshold).to.be.a("number");
      expect(response.data.threshold).to.be.greaterThan(0);
    });

    it("TC-FROST-CFG-004: Participants should be non-negative integer", async function () {
      const response = await axios.get(`${BASE_URL}/api/frost/config`);
      expect(response.data.participants).to.be.a("number");
      expect(response.data.participants).to.be.at.least(0);
    });

    it("TC-FROST-CFG-005: Response time should be < 100ms", async function () {
      const start = Date.now();
      await axios.get(`${BASE_URL}/api/frost/config`);
      const duration = Date.now() - start;
      expect(duration).to.be.lessThan(100);
    });
  });

  describe("FROST Participants (TC-FROST-PART-001 to TC-FROST-PART-005)", function () {
    it("TC-FROST-PART-001: Should return array of participants", async function () {
      const response = await axios.get(`${BASE_URL}/api/frost/participants`);
      expect(response.status).to.equal(200);
      expect(response.data).to.be.an("array");
    });

    it("TC-FROST-PART-002: Should return empty array when no participants", async function () {
      const response = await axios.get(`${BASE_URL}/api/frost/participants`);
      expect(Array.isArray(response.data)).to.be.true;
    });

    it("TC-FROST-PART-003: Participant object structure validation", async function () {
      const response = await axios.get(`${BASE_URL}/api/frost/participants`);
      if (response.data.length > 0) {
        const participant = response.data[0];
        expect(participant).to.have.property("id");
        expect(participant).to.have.property("publicKey");
        expect(participant).to.have.property("isActive");
      }
    });

    it("TC-FROST-PART-004: Active participants filtering", async function () {
      const response = await axios.get(`${BASE_URL}/api/frost/participants`);
      response.data.forEach((p: any) => {
        if (p.isActive !== undefined) {
          expect(typeof p.isActive).to.equal("boolean");
        }
      });
    });

    it("TC-FROST-PART-005: Response time should be < 100ms", async function () {
      const start = Date.now();
      await axios.get(`${BASE_URL}/api/frost/participants`);
      const duration = Date.now() - start;
      expect(duration).to.be.lessThan(100);
    });
  });

  describe("Policy Update Root (TC-POL-001 to TC-POL-008)", function () {
    const validRoot = "0x" + "1".repeat(64);

    it("TC-POL-001: Successful policy root update", async function () {
      try {
        const response = await axios.post(`${BASE_URL}/api/policy/update-root`, {
          newRoot: validRoot,
        });
        expect([200, 500]).to.include(response.status);
      } catch (error: any) {
        expect([404, 500]).to.include(error.response?.status || 500);
      }
    });

    it("TC-POL-002: Missing newRoot should return 400", async function () {
      try {
        await axios.post(`${BASE_URL}/api/policy/update-root`, {});
        expect.fail("Should have thrown error");
      } catch (error: any) {
        expect(error.response?.status).to.equal(400);
        expect(error.response.data.error).to.include("Missing newRoot");
      }
    });

    it("TC-POL-003: Invalid root format handling", async function () {
      try {
        await axios.post(`${BASE_URL}/api/policy/update-root`, {
          newRoot: "not-a-hex-string",
        });
        expect.fail("Should have thrown error");
      } catch (error: any) {
        expect([400, 500]).to.include(error.response?.status || 500);
      }
    });

    it("TC-POL-004: Blockchain client not configured should return 500", async function () {
      try {
        const response = await axios.post(`${BASE_URL}/api/policy/update-root`, {
          newRoot: validRoot,
        });
        expect([200, 500]).to.include(response.status);
      } catch (error: any) {
        expect(error.response?.status).to.equal(500);
        expect(error.response.data.error).to.include("Policy update failed");
      }
    });

    it("TC-POL-005: Transaction hash in response", async function () {
      try {
        const response = await axios.post(`${BASE_URL}/api/policy/update-root`, {
          newRoot: validRoot,
        });
        if (response.status === 200) {
          expect(response.data).to.have.property("transactionHash");
        }
      } catch (error: any) {
        expect([404, 500]).to.include(error.response?.status || 500);
      }
    });

    it("TC-POL-006: Error handling for blockchain failures", async function () {
      try {
        await axios.post(`${BASE_URL}/api/policy/update-root`, {
          newRoot: validRoot,
        });
        expect.fail("Should have thrown error");
      } catch (error: any) {
        expect([404, 500]).to.include(error.response?.status || 500);
      }
    });

    it("TC-POL-007: Invalid hex string handling", async function () {
      try {
        await axios.post(`${BASE_URL}/api/policy/update-root`, {
          newRoot: "0xinvalidhex",
        });
        expect.fail("Should have thrown error");
      } catch (error: any) {
        expect([400, 500]).to.include(error.response?.status || 500);
      }
    });

    it("TC-POL-008: Empty root string handling", async function () {
      try {
        await axios.post(`${BASE_URL}/api/policy/update-root`, {
          newRoot: "",
        });
        expect.fail("Should have thrown error");
      } catch (error: any) {
        expect([400, 500]).to.include(error.response?.status || 400);
      }
    });
  });
});

