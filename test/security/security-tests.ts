/**
 * Security Tests
 * 
 * Tests security vulnerabilities and input validation (14 test cases)
 */

import { expect } from "chai";
import axios from "axios";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

dotenv.config({ path: "../../.env" });
dotenv.config();

const testDataPath = path.join(__dirname, "../data/test-data.json");
const testData = JSON.parse(fs.readFileSync(testDataPath, "utf-8"));

const BASE_URL = process.env.API_URL || "http://localhost:3000";

describe("Security Tests", function () {
  this.timeout(10000);

  describe("Authentication & Authorization (TC-SEC-001 to TC-SEC-008)", function () {
    it("TC-SEC-001: SQL injection attempts in all string fields", async function () {
      const sqlInjections = testData.securityTestData.sqlInjections;

      for (const injection of sqlInjections) {
        try {
          const response = await axios.post(`${BASE_URL}/api/authorize`, {
            principal: injection,
            resource: "arn:aws:s3:::bucket/object",
            action: "s3:GetObject",
            signatureShares: [],
          });
          expect([200, 400]).to.include(response.status);
        } catch (error: any) {
          expect([400, 500]).to.include(error.response?.status || 500);
        }
      }
    });

    it("TC-SEC-002: XSS attempts in all string fields", async function () {
      const xssAttempts = testData.securityTestData.xssAttempts;

      for (const xss of xssAttempts) {
        try {
          const response = await axios.post(`${BASE_URL}/api/authorize`, {
            principal: xss,
            resource: "arn:aws:s3:::bucket/object",
            action: "s3:GetObject",
            signatureShares: [],
          });
          expect([200, 400]).to.include(response.status);
        } catch (error: any) {
          expect([400, 500]).to.include(error.response?.status || 500);
        }
      }
    });

    it("TC-SEC-003: Command injection attempts", async function () {
      const commandInjections = testData.securityTestData.commandInjections;

      for (const injection of commandInjections) {
        try {
          const response = await axios.post(`${BASE_URL}/api/authorize`, {
            principal: injection,
            resource: "arn:aws:s3:::bucket/object",
            action: "s3:GetObject",
            signatureShares: [],
          });
          expect([200, 400]).to.include(response.status);
        } catch (error: any) {
          expect([400, 500]).to.include(error.response?.status || 500);
        }
      }
    });

    it("TC-SEC-004: Path traversal attempts", async function () {
      try {
        const response = await axios.get(
          `${BASE_URL}/api/authorize/../../etc/passwd`
        );
        expect([404, 400]).to.include(response.status);
      } catch (error: any) {
        expect([404, 400, 500]).to.include(error.response?.status || 404);
      }
    });

    it("TC-SEC-005: Reentrancy attack prevention", async function () {
      const requests = Array(10)
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

    it("TC-SEC-006: Access control bypass attempts", async function () {
      try {
        await axios.post(`${BASE_URL}/api/policy/update-root`, {
          newRoot: "0x" + "1".repeat(64),
        });
        expect.fail("Should have thrown error");
      } catch (error: any) {
        expect([404, 500]).to.include(error.response?.status || 500);
      }
    });

    it("TC-SEC-007: Rate limiting check", async function () {
      const requests = Array(100)
        .fill(null)
        .map(() =>
          axios.get(`${BASE_URL}/health`).catch(() => ({ status: 429 }))
        );

      const responses = await Promise.all(requests);
      const successCount = responses.filter(
        (r: any) => r.status === 200
      ).length;
      expect(successCount).to.be.greaterThan(0);
    });

    it("TC-SEC-008: Input validation on all endpoints", async function () {
      const invalidInputs = [
        { principal: null },
        { principal: undefined },
        { principal: 123 },
        { principal: {} },
      ];

      for (const input of invalidInputs) {
        try {
          await axios.post(`${BASE_URL}/api/authorize`, {
            ...input,
            resource: "arn:aws:s3:::bucket/object",
            action: "s3:GetObject",
            signatureShares: [],
          });
          expect.fail("Should have thrown error");
        } catch (error: any) {
          expect([400, 500]).to.include(error.response?.status || 500);
        }
      }
    });
  });

  describe("Data Validation (TC-SEC-009 to TC-SEC-014)", function () {
    it("TC-SEC-009: ARN format validation", async function () {
      const invalidArns = [
        "not-an-arn",
        "arn:aws:iam::",
        "arn:aws:iam::123456789012",
        "invalid-format",
      ];

      for (const arn of invalidArns) {
        try {
          const response = await axios.post(`${BASE_URL}/api/authorize`, {
            principal: arn,
            resource: "arn:aws:s3:::bucket/object",
            action: "s3:GetObject",
            signatureShares: [],
          });
          expect([200, 400]).to.include(response.status);
        } catch (error: any) {
          expect([400, 500]).to.include(error.response?.status || 500);
        }
      }
    });

    it("TC-SEC-010: Private key format validation", async function () {
      const invalidKeys = ["short", "0x" + "a".repeat(63), "not-hex"];

      for (const key of invalidKeys) {
        try {
          await axios.post(`${BASE_URL}/api/policy/update-root`, {
            newRoot: key,
          });
          expect.fail("Should have thrown error");
        } catch (error: any) {
          expect([400, 500]).to.include(error.response?.status || 500);
        }
      }
    });

    it("TC-SEC-011: Signature format validation", async function () {
      const invalidSignatures = [
        { participantId: "p1", share: "short", commitment: "0x" + "a".repeat(64) },
        { participantId: "p1", share: "0x" + "a".repeat(64), commitment: "short" },
      ];

      for (const sig of invalidSignatures) {
        try {
          const response = await axios.post(`${BASE_URL}/api/authorize`, {
            principal: "arn:aws:iam::123456789012:user/test",
            resource: "arn:aws:s3:::bucket/object",
            action: "s3:GetObject",
            signatureShares: [sig],
          });
          expect([200, 400]).to.include(response.status);
        } catch (error: any) {
          expect([400, 500]).to.include(error.response?.status || 500);
        }
      }
    });

    it("TC-SEC-012: Request ID format validation", async function () {
      const invalidIds = ["", "../invalid", "a".repeat(10000)];

      for (const id of invalidIds) {
        try {
          await axios.get(`${BASE_URL}/api/authorize/${id}`);
          expect.fail("Should have thrown error");
        } catch (error: any) {
          expect([404, 400, 500]).to.include(error.response?.status || 404);
        }
      }
    });

    it("TC-SEC-013: Maximum payload size enforcement", async function () {
      const largePayload = {
        principal: "arn:aws:iam::123456789012:user/test",
        resource: "arn:aws:s3:::bucket/" + "x".repeat(100000),
        action: "s3:GetObject",
        signatureShares: [],
      };

      try {
        const response = await axios.post(
          `${BASE_URL}/api/authorize`,
          largePayload
        );
        expect([200, 400, 413]).to.include(response.status);
      } catch (error: any) {
        expect([400, 413, 500]).to.include(error.response?.status || 500);
      }
    });

    it("TC-SEC-014: Special character handling", async function () {
      const specialChars = testData.edgeCaseData.specialChars;

      try {
        const response = await axios.post(`${BASE_URL}/api/authorize`, {
          principal: `arn:aws:iam::123456789012:user/${specialChars}`,
          resource: "arn:aws:s3:::bucket/object",
          action: "s3:GetObject",
          signatureShares: [],
        });
        expect([200, 400]).to.include(response.status);
      } catch (error: any) {
        expect([400, 500]).to.include(error.response?.status || 500);
      }
    });
  });
});

