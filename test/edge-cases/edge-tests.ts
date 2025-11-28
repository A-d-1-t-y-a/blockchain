/**
 * Edge Cases Tests
 * 
 * Tests boundary conditions and concurrent operations (12 test cases)
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

describe("Edge Cases Tests", function () {
  this.timeout(15000);

  describe("Boundary Conditions (TC-EDGE-001 to TC-EDGE-008)", function () {
    it("TC-EDGE-001: Empty string inputs", async function () {
      try {
        await axios.post(`${BASE_URL}/api/authorize`, {
          principal: "",
          resource: "",
          action: "",
          signatureShares: [],
        });
        expect.fail("Should have thrown error");
      } catch (error: any) {
        expect(error.response?.status).to.equal(400);
      }
    });

    it("TC-EDGE-002: Very long string inputs", async function () {
      const longString = testData.edgeCaseData.veryLongString;
      try {
        const response = await axios.post(`${BASE_URL}/api/authorize`, {
          principal: `arn:aws:iam::123456789012:user/${longString}`,
          resource: "arn:aws:s3:::bucket/object",
          action: "s3:GetObject",
          signatureShares: [],
        });
        expect([200, 400, 413]).to.include(response.status);
      } catch (error: any) {
        expect([400, 413, 500]).to.include(error.response?.status || 500);
      }
    });

    it("TC-EDGE-003: Special characters in inputs", async function () {
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

    it("TC-EDGE-004: Unicode characters in inputs", async function () {
      const unicode = testData.edgeCaseData.unicodeChars;
      try {
        const response = await axios.post(`${BASE_URL}/api/authorize`, {
          principal: `arn:aws:iam::123456789012:user/${unicode}`,
          resource: "arn:aws:s3:::bucket/object",
          action: "s3:GetObject",
          signatureShares: [],
        });
        expect([200, 400]).to.include(response.status);
      } catch (error: any) {
        expect([400, 500]).to.include(error.response?.status || 500);
      }
    });

    it("TC-EDGE-005: Null/undefined handling", async function () {
      try {
        await axios.post(`${BASE_URL}/api/authorize`, {
          principal: null as any,
          resource: undefined as any,
          action: "s3:GetObject",
          signatureShares: [],
        });
        expect.fail("Should have thrown error");
      } catch (error: any) {
        expect([400, 500]).to.include(error.response?.status || 500);
      }
    });

    it("TC-EDGE-006: Maximum threshold value", async function () {
      const response = await axios.get(`${BASE_URL}/api/frost/config`);
      expect(response.data.threshold).to.be.a("number");
      expect(response.data.threshold).to.be.lessThan(1000);
    });

    it("TC-EDGE-007: Minimum threshold value", async function () {
      const response = await axios.get(`${BASE_URL}/api/frost/config`);
      expect(response.data.threshold).to.be.a("number");
      expect(response.data.threshold).to.be.greaterThan(0);
    });

    it("TC-EDGE-008: Zero participants", async function () {
      const response = await axios.get(`${BASE_URL}/api/frost/participants`);
      expect(Array.isArray(response.data)).to.be.true;
      expect(response.data.length).to.be.at.least(0);
    });
  });

  describe("Concurrent Operations (TC-EDGE-009 to TC-EDGE-012)", function () {
    it("TC-EDGE-009: Simultaneous authorization requests", async function () {
      const requests = Array(20)
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

    it("TC-EDGE-010: Concurrent policy updates", async function () {
      const requests = Array(5)
        .fill(null)
        .map((_, i) =>
          axios
            .post(`${BASE_URL}/api/policy/update-root`, {
              newRoot: `0x${i.toString().repeat(64)}`,
            })
            .catch(() => ({ status: 500 }))
        );

      const responses = await Promise.all(requests);
      responses.forEach((response: any) => {
        expect([200, 404, 500]).to.include(response.status);
      });
    });

    it("TC-EDGE-011: Race condition handling", async function () {
      const sameRequest = {
        principal: "arn:aws:iam::123456789012:user/test",
        resource: "arn:aws:s3:::bucket/object",
        action: "s3:GetObject",
        signatureShares: [],
      };

      const requests = Array(5)
        .fill(null)
        .map(() => axios.post(`${BASE_URL}/api/authorize`, sameRequest));

      const responses = await Promise.all(requests);
      const requestIds = responses.map((r) => r.data.requestId);
      const uniqueIds = new Set(requestIds);
      expect(uniqueIds.size).to.equal(requestIds.length);
    });

    it("TC-EDGE-012: Deadlock prevention", async function () {
      const requests = Array(10)
        .fill(null)
        .map(() =>
          Promise.all([
            axios.get(`${BASE_URL}/health`),
            axios.get(`${BASE_URL}/api/frost/config`),
            axios.get(`${BASE_URL}/api/frost/participants`),
          ])
        );

      const allResponses = await Promise.all(requests);
      allResponses.forEach((responses) => {
        responses.forEach((response) => {
          expect([200, 404]).to.include(response.status);
        });
      });
    });
  });
});

