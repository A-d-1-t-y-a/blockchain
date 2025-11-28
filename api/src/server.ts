/**
 * API Gateway Server
 *
 * Express.js server for decentralized cloud access control
 * Integrates FROST coordinator, blockchain, and AWS IAM
 */

import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import * as dotenv from "dotenv";
import { FROSTCoordinator } from "./services/frost-coordinator";
import { AWSIAMClient } from "./services/aws-iam-client";
import { BlockchainClient } from "./services/blockchain-client";

// Load .env file from multiple possible locations
dotenv.config({ path: "../.env" });
dotenv.config({ path: ".env" });
dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

app.use(cors());
app.use(express.json());
const frostCoordinator = new FROSTCoordinator(
  parseInt(process.env.FROST_THRESHOLD || "3"),
  parseInt(process.env.FROST_PARTICIPANTS || "5")
);

const defaultParticipantIds = Array.from(
  { length: parseInt(process.env.FROST_PARTICIPANTS || "5", 10) },
  (_, index) => `p${index + 1}`
);

(async () => {
  try {
    await frostCoordinator.initializeDKG(defaultParticipantIds);
    console.log(
      `✅ FROST DKG initialized with ${defaultParticipantIds.length} participants`
    );
  } catch (error) {
    console.warn(
      "⚠️ Unable to initialize FROST DKG automatically. Initialize manually if needed.",
      error
    );
  }
})();

const awsRegion = process.env.AWS_REGION || "us-east-1";
const awsIAMClient = new AWSIAMClient(awsRegion);

let blockchainClient: BlockchainClient | null = null;
const rpcUrl = process.env.SEPOLIA_RPC_URL || process.env.RPC_URL;
if (
  rpcUrl &&
  process.env.PRIVATE_KEY &&
  process.env.ACCESS_CONTROL_ADDRESS &&
  process.env.THRESHOLD_MANAGER_ADDRESS &&
  process.env.FROST_VERIFIER_ADDRESS
) {
  try {
    blockchainClient = new BlockchainClient(
      rpcUrl,
      process.env.PRIVATE_KEY,
      process.env.ACCESS_CONTROL_ADDRESS,
      process.env.THRESHOLD_MANAGER_ADDRESS,
      process.env.FROST_VERIFIER_ADDRESS
    );
    console.log("✅ Blockchain client initialized");
  } catch (error: any) {
    console.warn(
      "⚠️ Blockchain client initialization failed:",
      error.message || error
    );
    blockchainClient = null;
  }
}

app.get("/health", async (req: Request, res: Response) => {
  try {
    const health: any = {
      status: "healthy",
      timestamp: new Date().toISOString(),
      services: {
        frost: "operational",
        aws: "unknown",
        blockchain: blockchainClient ? "operational" : "not configured",
      },
    };

    try {
      await awsIAMClient.verifyCredentials();
      health.services.aws = "operational";
    } catch (error: any) {
      health.services.aws = "error";
      health.services.awsError = error.message;
    }

    res.json(health);
  } catch (error: any) {
    res
      .status(500)
      .json({ error: "Health check failed", message: error.message });
  }
});

app.post("/api/authorize", async (req: Request, res: Response) => {
  try {
    const { principal, resource, action, signatureShares } = req.body;

    if (!principal || !resource || !action) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const requestId = `${Date.now()}-${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    let aggregatedSignature;
    let groupPublicKey;
    try {
      const frostResult = await frostCoordinator.generateThresholdSignature(
        JSON.stringify({ requestId, principal, resource, action }),
        signatureShares || []
      );
      aggregatedSignature = frostResult.signature;
      groupPublicKey = frostResult.publicKey;
    } catch (error: any) {
      return res.status(400).json({
        error: "FROST signature generation failed",
        details: error.message,
      });
    }

    const awsDecision = await awsIAMClient.checkAccess({
      principal,
      resource,
      action,
    });

    let blockchainResult = null;
    if (blockchainClient) {
      try {
        blockchainResult = await blockchainClient.requestAuthorization({
          requestId,
          principal,
          resource,
          action,
          signature: aggregatedSignature,
          publicKey: groupPublicKey,
        });
      } catch (error: any) {
        blockchainResult = {
          requestId,
          authorized: false,
          error: error.message,
        };
      }
    }

    const authorized =
      awsDecision.allowed && (blockchainResult?.authorized ?? true);
    io.emit("authorization", {
      requestId,
      principal,
      resource,
      action,
      authorized,
      timestamp: new Date().toISOString(),
    });

    res.json({
      requestId,
      authorized,
      awsDecision,
      blockchainResult,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Authorization error:", error);
    res
      .status(500)
      .json({ error: "Authorization failed", details: error.message });
  }
});

app.get("/api/authorize/:requestId", async (req: Request, res: Response) => {
  try {
    const { requestId } = req.params;

    if (blockchainClient) {
      const result = await blockchainClient.getAuthorization(requestId);
      return res.json(result);
    }

    res.status(404).json({ error: "Blockchain client not configured" });
  } catch (error: any) {
    res
      .status(500)
      .json({ error: "Failed to get authorization", details: error.message });
  }
});

app.get("/api/frost/config", (req: Request, res: Response) => {
  const config = frostCoordinator.getThresholdConfig();
  res.json(config);
});

app.get("/api/frost/participants", (req: Request, res: Response) => {
  const participants = frostCoordinator.getActiveParticipants();
  res.json(participants);
});

app.post("/api/policy/update-root", async (req: Request, res: Response) => {
  try {
    const { newRoot } = req.body;

    if (!newRoot) {
      return res.status(400).json({ error: "Missing newRoot" });
    }

    if (!blockchainClient) {
      return res
        .status(500)
        .json({ error: "Blockchain client not configured" });
    }

    const txHash = await blockchainClient.updatePolicyRoot(newRoot);
    res.json({ success: true, transactionHash: txHash });
  } catch (error: any) {
    res
      .status(500)
      .json({ error: "Policy update failed", details: error.message });
  }
});

io.on("connection", (socket) => {
  socket.on("subscribe", (data) => {
    socket.join(`authorization:${data.requestId}`);
  });
});

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error("Error:", err);
  res
    .status(500)
    .json({ error: "Internal server error", message: err.message });
});

const PORT = parseInt(process.env.API_PORT || "3000", 10);
httpServer
  .listen(PORT, () => {
    console.log(`\n✅ API Gateway server running on port ${PORT}`);
    console.log(`✅ Health check: http://localhost:${PORT}/health`);
    console.log(`✅ WebSocket server: ws://localhost:${PORT}`);
    console.log(`✅ API endpoints: http://localhost:${PORT}/api\n`);
  })
  .on("error", (error: any) => {
    if (error.code === "EADDRINUSE") {
      console.error(
        `❌ Port ${PORT} is already in use. Please stop the process using this port or change API_PORT in .env`
      );
    } else {
      console.error(`❌ Server error:`, error);
    }
    process.exit(1);
  });

export default app;
