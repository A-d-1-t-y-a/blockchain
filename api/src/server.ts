import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import * as dotenv from "dotenv";
import { ethers } from "ethers";
import {
  FROSTCoordinator,
  AWSIAMClient,
  AzureIAMClient,
  BlockchainClient,
} from "./services";

// Load environment variables
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

// Initialize FROST coordinator
const frostCoordinator = new FROSTCoordinator(
  parseInt(process.env.FROST_THRESHOLD || "3"),
  parseInt(process.env.FROST_PARTICIPANTS || "5")
);

const defaultParticipantIds = Array.from(
  { length: parseInt(process.env.FROST_PARTICIPANTS || "5", 10) },
  (_, i) => `p${i + 1}`
);

// Initialize IAM clients
const awsRegion = process.env.AWS_REGION || "us-east-1";
const awsIAMClient = new AWSIAMClient(awsRegion);
const azureIAMClient = new AzureIAMClient();

// Initialize blockchain client if all required env vars are present
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
  } catch (e: any) {
    console.warn("⚠️ Blockchain client init failed:", e.message || e);
    blockchainClient = null;
  }
}

// Register group public key on-chain after DKG initialization
(async () => {
  try {
    const { groupPublicKey } = await frostCoordinator.initializeDKG(
      defaultParticipantIds
    );
    console.log(
      `✅ FROST DKG initialized with ${defaultParticipantIds.length} participants`
    );
    console.log(`🔑 Group Public Key: ${groupPublicKey}`);
    if (blockchainClient) {
      console.log("🔄 Registering group public key on-chain...");
      await blockchainClient.updateGroupPublicKey("0x" + groupPublicKey);
      console.log("✅ Group public key registered");
    }
  } catch (e: any) {
    console.warn("⚠️ DKG init or key registration failed:", e);
  }
})();

// Health check endpoint
app.get("/health", async (req: Request, res: Response) => {
  try {
    const health: any = {
      status: "healthy",
      timestamp: new Date().toISOString(),
      services: {
        frost: "operational",
        aws: "unknown",
        azure: "unknown",
        blockchain: blockchainClient ? "operational" : "not configured",
      },
    };
    try {
      await awsIAMClient.verifyCredentials();
      health.services.aws = "operational";
    } catch (e: any) {
      health.services.aws = "error";
      health.services.awsError = e.message;
    }
    if (process.env.AZURE_TENANT_ID) {
      health.services.azure = "operational";
    } else {
      health.services.azure = "not configured";
    }
    res.json(health);
  } catch (e: any) {
    res.status(500).json({ error: "Health check failed", message: e.message });
  }
});

// Authorization endpoint
app.post("/api/authorize", async (req: Request, res: Response) => {
  try {
    const { principal, resource, action, cloudProvider } = req.body;
    if (!principal || !resource || !action) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const requestId = `${Date.now()}-${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    // Convert principal (ARN) to a deterministic address if needed
    const principalAddress = ethers.isAddress(principal)
      ? principal
      : ethers.getAddress(
          ethers.keccak256(ethers.toUtf8Bytes(principal)).substring(0, 42)
        );

    // Build the exact tuple that the contract will verify
    const requestIdBytes32 = ethers.id(requestId);
    const resourceBytes32 = ethers.keccak256(ethers.toUtf8Bytes(resource));
    const actionBytes32 = ethers.keccak256(ethers.toUtf8Bytes(action));

    // Get the chain ID from the blockchain client
    const chainId = blockchainClient 
      ? await blockchainClient.getChainId() 
      : 31337n; // Default to Hardhat's chain ID if no blockchain client

    // Create the message that the contract expects (packed encoding)
    // Contract does: keccak256(abi.encodePacked(requestId, principal, resource, action, block.chainid))
    const message = ethers.solidityPacked(
      ["bytes32", "address", "bytes32", "bytes32", "uint256"],
      [requestIdBytes32, principalAddress, resourceBytes32, actionBytes32, chainId]
    );

    // Hash the message (this is what gets signed)
    const messageHash = ethers.keccak256(message);

    const frostResult = await frostCoordinator.generateThresholdSignature(
      messageHash
    );
    const aggregatedSignature = frostResult.signature;

    // Cloud IAM decision
    const cloudDecision =
      cloudProvider === "azure"
        ? await azureIAMClient.checkAccess({ principal, resource, action })
        : await awsIAMClient.checkAccess({ principal, resource, action });

    // Blockchain authorization
    let blockchainResult: any = null;
    if (blockchainClient) {
      try {
        blockchainResult = await blockchainClient.requestAuthorization({
          requestId,
          principal: principalAddress,
          resource,
          action,
          signature: aggregatedSignature,
        });
      } catch (e: any) {
        blockchainResult = {
          requestId,
          authorized: false,
          error: e.message,
        };
      }
    }

    const authorized =
      cloudDecision.allowed && (blockchainResult?.authorized ?? true);

    // Emit via WebSocket
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
      cloudDecision,
      blockchainResult,
      timestamp: new Date().toISOString(),
    });
  } catch (e: any) {
    console.error("Authorization error:", e);
    res.status(500).json({ error: "Authorization failed", details: e.message });
  }
});

// Retrieve blockchain authorization result by requestId
app.get("/api/authorize/:requestId", async (req: Request, res: Response) => {
  try {
    const { requestId } = req.params;
    if (blockchainClient) {
      const result = await blockchainClient.getAuthorization(requestId);
      return res.json(result);
    }
    res.status(404).json({ error: "Blockchain client not configured" });
  } catch (e: any) {
    res.status(500).json({ error: "Failed to get authorization", details: e.message });
  }
});

// FROST config endpoints
app.get("/api/frost/config", (req: Request, res: Response) => {
  res.json(frostCoordinator.getThresholdConfig());
});
app.get("/api/frost/participants", (req: Request, res: Response) => {
  res.json(frostCoordinator.getActiveParticipants());
});

// Update policy root on-chain
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
  } catch (e: any) {
    res.status(500).json({ error: "Policy update failed", details: e.message });
  }
});

// WebSocket connection handling
io.on("connection", (socket) => {
  socket.on("subscribe", (data) => {
    socket.join(`authorization:${data.requestId}`);
  });
});

// Global error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error("Error:", err);
  res.status(500).json({ error: "Internal server error", message: err.message });
});

const PORT = parseInt(process.env.API_PORT || "3000", 10);
httpServer
  .listen(PORT, () => {
    console.log(`\n✅ API Gateway server running on port ${PORT}`);
    console.log(`✅ Health check: http://localhost:${PORT}/health`);
    console.log(`✅ WebSocket server: ws://localhost:${PORT}`);
    console.log(`✅ API endpoints: http://localhost:${PORT}/api\n`);
  })
  .on("error", (e: any) => {
    if (e.code === "EADDRINUSE") {
      console.error(
        `❌ Port ${PORT} is already in use. Stop the process or change API_PORT in .env`
      );
    } else {
      console.error("❌ Server error:", e);
    }
    process.exit(1);
  });

export default app;
