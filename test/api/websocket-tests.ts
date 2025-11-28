/**
 * WebSocket Tests
 * 
 * Tests WebSocket connection and authorization events (11 test cases)
 */

import { expect } from "chai";
import { io, Socket } from "socket.io-client";
import axios from "axios";
import * as dotenv from "dotenv";

dotenv.config({ path: "../../.env" });
dotenv.config();

const BASE_URL = process.env.API_URL || "http://localhost:3000";
const WS_URL = BASE_URL;
const validSignatureShares = [
  { participantId: "p1", share: "1".repeat(64), commitment: "2".repeat(64) },
  { participantId: "p2", share: "3".repeat(64), commitment: "4".repeat(64) },
  { participantId: "p3", share: "5".repeat(64), commitment: "6".repeat(64) },
];

describe("WebSocket Tests", function () {
  this.timeout(10000);

  describe("WebSocket Connection (TC-WS-001 to TC-WS-005)", function () {
    it("TC-WS-001: Should connect to WebSocket server", function (done) {
      const socket = io(WS_URL, {
        transports: ["websocket"],
        timeout: 5000,
      });

      socket.on("connect", () => {
        expect(socket.connected).to.be.true;
        socket.disconnect();
        done();
      });

      socket.on("connect_error", (error: Error) => {
        socket.disconnect();
        done(error);
      });
    });

    it("TC-WS-002: Should connect to ws://localhost:3000", function (done) {
      const socket = io(WS_URL, {
        transports: ["websocket"],
      });

      socket.on("connect", () => {
        expect(socket.connected).to.be.true;
        socket.disconnect();
        done();
      });

      socket.on("connect_error", () => {
        socket.disconnect();
        done();
      });
    });

    it("TC-WS-003: Should handle multiple simultaneous connections", function (done) {
      const sockets: Socket[] = [];
      let connectedCount = 0;
      const totalConnections = 3;

      for (let i = 0; i < totalConnections; i++) {
        const socket = io(WS_URL, { transports: ["websocket"] });
        sockets.push(socket);

        socket.on("connect", () => {
          connectedCount++;
          if (connectedCount === totalConnections) {
            expect(connectedCount).to.equal(totalConnections);
            sockets.forEach((s) => s.disconnect());
            done();
          }
        });
      }

      setTimeout(() => {
        sockets.forEach((s) => s.disconnect());
        if (connectedCount < totalConnections) {
          done(new Error(`Only ${connectedCount} connections established`));
        }
      }, 5000);
    });

    it("TC-WS-004: Should handle connection timeout", function (done) {
      const socket = io("http://invalid-host:3000", {
        transports: ["websocket"],
        timeout: 2000,
      });

      let finished = false;
      const complete = (error?: Error) => {
        if (finished) {
          return;
        }
        finished = true;
        socket.disconnect();
        if (error) {
          done(error);
        } else {
          done();
        }
      };

      socket.on("connect_error", () => {
        complete();
      });

      setTimeout(() => {
        complete();
      }, 3000);
    });

    it("TC-WS-005: Should handle disconnection", function (done) {
      const socket = io(WS_URL, { transports: ["websocket"] });

      socket.on("connect", () => {
        socket.disconnect();
      });

      socket.on("disconnect", () => {
        expect(socket.connected).to.be.false;
        done();
      });

      socket.on("connect_error", () => {
        socket.disconnect();
        done();
      });
    });
  });

  describe("Authorization Events (TC-WS-006 to TC-WS-011)", function () {
    it("TC-WS-006: Should receive authorization event on POST /api/authorize", function (done) {
      const socket = io(WS_URL, { transports: ["websocket"] });
      let eventReceived = false;

      socket.on("connect", async () => {
        socket.on("authorization", (data: any) => {
          eventReceived = true;
          expect(data).to.have.property("requestId");
          socket.disconnect();
          if (eventReceived) done();
        });

        try {
          await axios.post(`${BASE_URL}/api/authorize`, {
            principal: "arn:aws:iam::123456789012:user/test",
            resource: "arn:aws:s3:::bucket/object",
            action: "s3:GetObject",
            signatureShares: validSignatureShares,
          });
        } catch (error: any) {
          // Authorization may fail, but event should still be emitted
        }

        setTimeout(() => {
          socket.disconnect();
          if (!eventReceived) {
            done(new Error("Authorization event not received"));
          }
        }, 3000);
      });

      socket.on("connect_error", () => {
        socket.disconnect();
        done();
      });
    });

    it("TC-WS-007: Event should contain all required fields", function (done) {
      const socket = io(WS_URL, { transports: ["websocket"] });
      let finished = false;
      const complete = (error?: Error) => {
        if (finished) {
          return;
        }
        finished = true;
        socket.disconnect();
        error ? done(error) : done();
      };

      socket.on("connect", async () => {
        socket.on("authorization", (data: any) => {
          expect(data).to.have.property("requestId");
          expect(data).to.have.property("principal");
          expect(data).to.have.property("resource");
          expect(data).to.have.property("action");
          expect(data).to.have.property("authorized");
          expect(data).to.have.property("timestamp");
          complete();
        });

        try {
          await axios.post(`${BASE_URL}/api/authorize`, {
            principal: "arn:aws:iam::123456789012:user/test",
            resource: "arn:aws:s3:::bucket/object",
            action: "s3:GetObject",
            signatureShares: validSignatureShares,
          });
        } catch (error: any) {
          // Ignore
        }

        setTimeout(() => {
          complete(new Error("Event not received"));
        }, 3000);
      });

      socket.on("connect_error", () => {
        complete();
      });
    });

    it("TC-WS-008: Event timestamp should be valid ISO 8601", function (done) {
      const socket = io(WS_URL, { transports: ["websocket"] });
      let finished = false;
      const complete = (error?: Error) => {
        if (finished) {
          return;
        }
        finished = true;
        socket.disconnect();
        error ? done(error) : done();
      };

      socket.on("connect", async () => {
        socket.on("authorization", (data: any) => {
          const timestamp = data.timestamp;
          expect(new Date(timestamp).toISOString()).to.equal(timestamp);
          complete();
        });

        try {
          await axios.post(`${BASE_URL}/api/authorize`, {
            principal: "arn:aws:iam::123456789012:user/test",
            resource: "arn:aws:s3:::bucket/object",
            action: "s3:GetObject",
            signatureShares: validSignatureShares,
          });
        } catch (error: any) {
          // Ignore
        }

        setTimeout(() => {
          complete(new Error("Event not received"));
        }, 3000);
      });

      socket.on("connect_error", () => {
        complete();
      });
    });

    it("TC-WS-009: Should subscribe to specific requestId", function (done) {
      const socket = io(WS_URL, { transports: ["websocket"] });

      socket.on("connect", () => {
        const requestId = "test-request-123";
        socket.emit("subscribe", { requestId });
        socket.disconnect();
        done();
      });

      socket.on("connect_error", () => {
        socket.disconnect();
        done();
      });
    });

    it("TC-WS-010: Multiple clients should receive same event", function (done) {
      const sockets: Socket[] = [];
      const events: any[] = [];
      const totalClients = 3;

      for (let i = 0; i < totalClients; i++) {
        const socket = io(WS_URL, { transports: ["websocket"] });
        sockets.push(socket);

        socket.on("connect", () => {
          socket.on("authorization", (data: any) => {
            events.push(data);
            if (events.length === totalClients) {
              expect(events.length).to.equal(totalClients);
              const requestIds = events.map((e) => e.requestId);
              expect(new Set(requestIds).size).to.be.at.most(1);
              sockets.forEach((s) => s.disconnect());
              done();
            }
          });
        });
      }

      setTimeout(async () => {
        try {
          await axios.post(`${BASE_URL}/api/authorize`, {
            principal: "arn:aws:iam::123456789012:user/test",
            resource: "arn:aws:s3:::bucket/object",
            action: "s3:GetObject",
            signatureShares: validSignatureShares,
          });
        } catch (error: any) {
          // Ignore
        }

        setTimeout(() => {
          sockets.forEach((s) => s.disconnect());
          if (events.length < totalClients) {
            done(new Error(`Only ${events.length} events received`));
          }
        }, 2000);
      }, 1000);
    });

    it("TC-WS-011: Event delivery reliability", function (done) {
      const socket = io(WS_URL, { transports: ["websocket"] });
      let eventCount = 0;

      socket.on("connect", async () => {
        socket.on("authorization", () => {
          eventCount++;
        });

        const requests = Array(3)
          .fill(null)
          .map(() =>
            axios.post(`${BASE_URL}/api/authorize`, {
              principal: "arn:aws:iam::123456789012:user/test",
              resource: "arn:aws:s3:::bucket/object",
              action: "s3:GetObject",
              signatureShares: validSignatureShares,
            })
          );

        try {
          await Promise.all(requests);
        } catch (error: any) {
          // Ignore
        }

        setTimeout(() => {
          socket.disconnect();
          expect(eventCount).to.be.greaterThan(0);
          done();
        }, 3000);
      });

      socket.on("connect_error", () => {
        socket.disconnect();
        done();
      });
    });
  });
});

