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
import { PolicyTreeBuilder, Policy } from "./services/policy-tree-builder";

dotenv.config({ path: "../.env" });
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

// Initialize policy tree builder
const policyTreeBuilder = new PolicyTreeBuilder();

// Add some default policies for testing
policyTreeBuilder.addPolicies([
  { resource: "arn:aws:s3:::my-bucket", action: "s3:GetObject", principal: "arn:aws:iam::123456789012:user/testuser", granted: true },
  { resource: "arn:aws:s3:::my-bucket", action: "s3:PutObject", principal: "arn:aws:iam::123456789012:user/testuser", granted: true },
  { resource: "arn:aws:ec2:*:*:instance/*", action: "ec2:StartInstances", principal: "arn:aws:iam::123456789012:user/testuser", granted: true },
]);

// Build initial tree
try {
  const root = policyTreeBuilder.buildTree();
  console.log(`✅ Policy tree initialized with root: ${root.slice(0, 20)}...`);
} catch (error) {
  console.warn("⚠️ Policy tree initialization skipped:", error);
}

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
    // Only initialize if RPC URL is not localhost (unless explicitly configured)
    if (!rpcUrl.includes('localhost:8545') || process.env.ENABLE_LOCAL_BLOCKCHAIN === 'true') {
      blockchainClient = new BlockchainClient(
        rpcUrl,
        process.env.PRIVATE_KEY,
        process.env.ACCESS_CONTROL_ADDRESS,
        process.env.THRESHOLD_MANAGER_ADDRESS,
        process.env.FROST_VERIFIER_ADDRESS
      );
      console.log("✅ Blockchain client initialized");
    } else {
      console.log("ℹ️  Blockchain client skipped (localhost:8545 not available)");
    }
  } catch (error: any) {
    console.warn(
      "⚠️ Blockchain client initialization failed:",
      error.message || error
    );
    blockchainClient = null;
  }
} else {
  console.log("ℹ️  Blockchain client not configured (optional)");
}

app.get("/health", async (req: Request, res: Response) => {
  try {
    const health: any = {
      status: "healthy",
      timestamp: new Date().toISOString(),
      services: {
        frost: "operational",
        aws: "unknown",
        blockchain: "not configured",
      },
    };

    // Check AWS
    try {
      await awsIAMClient.verifyCredentials();
      health.services.aws = "operational";
    } catch (error: any) {
      health.services.aws = "error";
      health.services.awsError = error.message;
    }

    // Check Blockchain connection
    if (blockchainClient) {
      try {
        const isAvailable = await blockchainClient.isAvailable();
        health.services.blockchain = isAvailable ? "operational" : "connection failed";
        if (!isAvailable) {
          health.services.blockchainError = "Cannot connect to blockchain RPC endpoint";
        }
      } catch (error: any) {
        health.services.blockchain = "error";
        health.services.blockchainError = error.message;
      }
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

    // Generate Merkle proof for policy verification
    let policyProof = null;
    try {
      policyProof = policyTreeBuilder.getProof(resource, action, principal, true);
    } catch (error) {
      console.warn("Policy proof generation failed:", error);
    }

    let blockchainResult = null;
    if (blockchainClient) {
      try {
        // Only pass proof if it exists, otherwise pass undefined (will use empty array)
        blockchainResult = await blockchainClient.requestAuthorization({
          requestId,
          principal,
          resource,
          action,
          signature: aggregatedSignature,
          publicKey: groupPublicKey,
          proof: policyProof?.proof || undefined, // Explicitly undefined if no proof
          index: policyProof?.index || undefined, // Explicitly undefined if no proof
        });
      } catch (error: any) {
        // Silently handle blockchain errors - system works without blockchain
        // Only log if it's not a connection error (which is expected if no blockchain)
        if (!error.message?.includes('ECONNREFUSED') && !error.message?.includes('network')) {
          console.warn("Blockchain authorization error:", error.message);
        }
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

// Policy management endpoints
app.post("/api/policy/add", async (req: Request, res: Response) => {
  try {
    const { resource, action, principal, granted } = req.body;

    if (!resource || !action || !principal) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const policy: Policy = {
      resource,
      action,
      principal,
      granted: granted !== undefined ? granted : true,
    };

    policyTreeBuilder.addPolicy(policy);
    const root = policyTreeBuilder.buildTree();

    // Update on-chain if blockchain client is configured
    if (blockchainClient) {
      try {
        await blockchainClient.updatePolicyRoot(root);
      } catch (error: any) {
        // Silently handle blockchain errors - system works without blockchain
        // Only log if it's not a connection error (which is expected if no blockchain)
        if (!error.message?.includes('ECONNREFUSED') && !error.message?.includes('network')) {
          console.warn("Failed to update policy root on-chain:", error.message);
        }
      }
    }

    res.json({
      success: true,
      policy,
      root,
      message: "Policy added successfully",
    });
  } catch (error: any) {
    res.status(500).json({ error: "Failed to add policy", details: error.message });
  }
});

app.get("/api/policy/proof", async (req: Request, res: Response) => {
  try {
    const { resource, action, principal, granted } = req.query;

    if (!resource || !action || !principal) {
      return res.status(400).json({ error: "Missing required parameters" });
    }

    const proof = policyTreeBuilder.getProof(
      resource as string,
      action as string,
      principal as string,
      granted === "true" || granted === undefined
    );

    if (!proof) {
      return res.status(404).json({ error: "Policy not found" });
    }

    res.json({
      proof: proof.proof,
      index: proof.index,
      leaf: proof.leaf,
      resource,
      action,
      principal,
    });
  } catch (error: any) {
    res.status(500).json({ error: "Failed to generate proof", details: error.message });
  }
});

app.get("/api/aws/identity", async (req: Request, res: Response) => {
  try {
    const identity = await awsIAMClient.verifyCredentials();
    res.json({
      accountId: identity.accountId,
      arn: identity.arn,
      region: awsRegion,
    });
  } catch (error: any) {
    res.status(500).json({
      error: "Failed to get AWS identity",
      details: error.message,
    });
  }
});

app.get("/api/policy/root", (req: Request, res: Response) => {
  try {
    const root = policyTreeBuilder.getRoot();
    const policies = policyTreeBuilder.getPolicies();

    res.json({
      root,
      policyCount: policies.length,
      policies: policies.map((p) => ({
        resource: p.resource,
        action: p.action,
        principal: p.principal,
        granted: p.granted,
      })),
    });
  } catch (error: any) {
    res.status(500).json({ error: "Failed to get policy root", details: error.message });
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
