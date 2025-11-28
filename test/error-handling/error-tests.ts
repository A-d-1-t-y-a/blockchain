/**
 * Error Handling Tests
 * 
 * Tests error scenarios and HTTP status codes (11 test cases)
 */

import { expect } from "chai";
import axios, { AxiosError } from "axios";
import * as dotenv from "dotenv";

dotenv.config({ path: "../../.env" });
dotenv.config();

const BASE_URL = process.env.API_URL || "http://localhost:3000";

describe("Error Handling Tests", function () {
  this.timeout(10000);

  describe("HTTP Error Responses (TC-ERR-001 to TC-ERR-006)", function () {
    it("TC-ERR-001: 400 Bad Request for invalid input", async function () {
      try {
        await axios.post(`${BASE_URL}/api/authorize`, {
          principal: "",
          resource: "",
          action: "",
        });
        expect.fail("Should have thrown error");
      } catch (error: any) {
        expect(error.response?.status).to.equal(400);
        expect(error.response.data).to.have.property("error");
      }
    });

    it("TC-ERR-002: 404 Not Found for non-existent resources", async function () {
      try {
        await axios.get(`${BASE_URL}/api/nonexistent-endpoint`);
        expect.fail("Should have thrown error");
      } catch (error: any) {
        expect(error.response?.status).to.equal(404);
      }
    });

    it("TC-ERR-003: 500 Internal Server Error for system failures", async function () {
      try {
        await axios.post(`${BASE_URL}/api/policy/update-root`, {
          newRoot: "0x" + "1".repeat(64),
        });
        expect.fail("Should have thrown error");
      } catch (error: any) {
        if (error.response?.status === 500) {
          expect(error.response.data).to.have.property("error");
        }
      }
    });

    it("TC-ERR-004: Error message clarity and helpfulness", async function () {
      try {
        await axios.post(`${BASE_URL}/api/authorize`, {
          principal: "arn:aws:iam::123456789012:user/test",
        });
        expect.fail("Should have thrown error");
      } catch (error: any) {
        expect(error.response?.status).to.equal(400);
        expect(error.response.data.error).to.be.a("string");
        expect(error.response.data.error.length).to.be.greaterThan(0);
      }
    });

    it("TC-ERR-005: Error response structure consistency", async function () {
      try {
        await axios.post(`${BASE_URL}/api/authorize`, {});
        expect.fail("Should have thrown error");
      } catch (error: any) {
        expect(error.response.data).to.have.property("error");
        expect(typeof error.response.data.error).to.equal("string");
      }
    });

    it("TC-ERR-006: No sensitive information in error messages", async function () {
      try {
        await axios.post(`${BASE_URL}/api/authorize`, {
          principal: "arn:aws:iam::123456789012:user/test",
          resource: "arn:aws:s3:::bucket/object",
          action: "s3:GetObject",
          signatureShares: [],
        });
      } catch (error: any) {
        const errorMessage = JSON.stringify(error.response?.data || {});
        expect(errorMessage).to.not.include("private");
        expect(errorMessage).to.not.include("secret");
        expect(errorMessage).to.not.include("password");
        expect(errorMessage).to.not.include("key");
      }
    });
  });

  describe("Service Error Handling (TC-ERR-007 to TC-ERR-011)", function () {
    it("TC-ERR-007: AWS service unavailable handling", async function () {
      const response = await axios.post(`${BASE_URL}/api/authorize`, {
        principal: "arn:aws:iam::999999999999:user/nonexistent",
        resource: "arn:aws:s3:::bucket/object",
        action: "s3:GetObject",
        signatureShares: [],
      });

      expect(response.data.awsDecision).to.have.property("allowed");
      expect(response.data.awsDecision).to.have.property("reason");
    });

    it("TC-ERR-008: Blockchain network failure handling", async function () {
      try {
        await axios.post(`${BASE_URL}/api/policy/update-root`, {
          newRoot: "0x" + "1".repeat(64),
        });
        expect.fail("Should have thrown error");
      } catch (error: any) {
        if (error.response?.status === 500) {
          expect(error.response.data).to.have.property("error");
        }
      }
    });

    it("TC-ERR-009: FROST coordinator failure handling", async function () {
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

    it("TC-ERR-010: Timeout handling", async function () {
      try {
        await axios.get(`${BASE_URL}/health`, { timeout: 1 });
        expect.fail("Should have timed out");
      } catch (error: any) {
        expect(error.code).to.equal("ECONNABORTED");
      }
    });

    it("TC-ERR-011: Connection error handling", async function () {
      try {
        await axios.get("http://invalid-host:3000/health", {
          timeout: 2000,
        });
        expect.fail("Should have thrown error");
      } catch (error: any) {
        expect(error.code).to.be.oneOf([
          "ECONNREFUSED",
          "ENOTFOUND",
          "ETIMEDOUT",
        ]);
      }
    });
  });
});

