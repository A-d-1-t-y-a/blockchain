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
// Import S3Uploader for file operations
import { S3Uploader } from './s3Uploader';
import { ListObjectsV2Command, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Load environment variables
dotenv.config({ path: "../.env" });
dotenv.config({ path: ".env" });
dotenv.config();

// Authorization modes for research comparison
// - blockchain-primary: Decentralized (blockchain is authority, cloud is advisory)
// - hybrid: Both cloud AND blockchain must approve (traditional multi-factor)
// - cloud-only: Centralized (cloud IAM only, for baseline comparison)
type AuthMode = 'blockchain-primary' | 'hybrid' | 'cloud-only';
const AUTHORIZATION_MODE: AuthMode = (process.env.AUTHORIZATION_MODE as AuthMode) || 'blockchain-primary';

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
    console.log("[OK] Blockchain client initialized");
  } catch (e: any) {
    console.warn("[WARN] Blockchain client init failed:", e.message || e);
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
      `[OK] FROST DKG initialized with ${defaultParticipantIds.length} participants`
    );
    console.log(`[KEY] Group Public Key: ${groupPublicKey}`);
    // Note: Group public key registration on-chain is optional for demo
    // In production, this would be stored on-chain for verification
    if (blockchainClient) {
      try {
        console.log("[SYNC] Registering group public key on-chain...");
        await blockchainClient.updateGroupPublicKey("0x" + groupPublicKey);
        console.log("[OK] Group public key registered");
      } catch (e: any) {
        console.log("[INFO] Group public key registration skipped (function not available in contract)");
      }
    }
  } catch (e: any) {
    console.warn("[WARN] DKG init or key registration failed:", e);
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
    const groupPublicKey = frostResult.publicKey;

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
          publicKey: groupPublicKey,
        });
      } catch (e: any) {
        blockchainResult = {
          requestId,
          authorized: false,
          error: e.message,
        };
      }
    }

    // Determine authorization based on configured mode
    let finalAuthorized: boolean;
    let authorizationReason: string;

    switch (AUTHORIZATION_MODE) {
      case 'blockchain-primary':
        // Decentralized mode: Blockchain is the primary authority
        finalAuthorized = blockchainResult?.authorized ?? false;
        authorizationReason = blockchainResult?.authorized 
          ? 'Blockchain authorized (decentralized mode)'
          : 'Blockchain denied access';
        
        // Log when cloud denies but blockchain approves
        if (!cloudDecision.allowed && blockchainResult?.authorized) {
          console.log(`[WARN] [DECENTRALIZED] Cloud denied but blockchain approved - granting access`);
        }
        break;

      case 'hybrid':
        // Hybrid mode: Both cloud AND blockchain must approve
        finalAuthorized = cloudDecision.allowed && (blockchainResult?.authorized ?? true);
        authorizationReason = finalAuthorized
          ? 'Both cloud and blockchain authorized'
          : !cloudDecision.allowed ? 'Cloud IAM denied' : 'Blockchain denied';
        break;

      case 'cloud-only':
        // Centralized mode: Cloud IAM only
        finalAuthorized = cloudDecision.allowed;
        authorizationReason = cloudDecision.allowed
          ? 'Cloud IAM authorized (centralized mode)'
          : 'Cloud IAM denied access';
        break;

      default:
        finalAuthorized = false;
        authorizationReason = 'Unknown authorization mode';
    }

    // Emit via WebSocket
    io.emit("authorization", {
      requestId,
      principal,
      resource,
      action,
      authorized: finalAuthorized,
      authorizationMode: AUTHORIZATION_MODE,
      authorizationReason,
      timestamp: new Date().toISOString(),
    });

    res.json({
      requestId,
      authorized: finalAuthorized,
      authorizationMode: AUTHORIZATION_MODE,
      authorizationReason,
      cloudDecision,
      awsDecision: cloudDecision, // Alias
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

// ========================================
// S3 Upload Endpoints (Using S3Uploader)
// ========================================

// Method 1: Direct SDK Upload (Standard)
app.post("/api/s3/upload", async (req: Request, res: Response) => {
  try {
    console.log("\n[INFO] [Endpoint] Testing Direct SDK Upload...");
    const { key, content } = req.body;
    
    if (!key || !content) {
      return res.status(400).json({ error: "key & content required" });
    }

    const bucket = req.body.bucket || process.env.S3_BUCKET || `ravitejs-demo-${Date.now()}`;
    const buffer = Buffer.from(content, 'base64');
    
    // Use the robust S3Uploader
    const uploader = new S3Uploader();
    
    const success = await uploader.uploadFile(
      // Create temp file
      (() => {
        const fs = require('fs');
        const os = require('os');
        const path = require('path');
        const tmpDir = os.tmpdir();
        const tmpFile = path.join(tmpDir, `${Date.now()}_${key.replace(/\//g, '_')}`);
        fs.writeFileSync(tmpFile, buffer);
        return tmpFile;
      })(),
      bucket,
      key
    );

    if (success) {
      console.log(`[OK] Success! Uploaded to s3://${bucket}/${key}`);
      return res.json({ success: true, method: 'direct-sdk', bucket, key });
    } else {
      console.log(`[ERROR] Failed to upload`);
      return res.status(500).json({ error: "Upload failed" });
    }
  } catch (e: any) {
    console.error(`[ERROR] Error:`, e.message);
    res.status(500).json({ 
      error: "S3 upload failed", 
      details: e.message
    });
  }
});

// Method 2: Presigned URL Upload
app.post("/api/s3/presign", async (req: Request, res: Response) => {
  try {
    console.log("\n[INFO] [Endpoint] Generating Presigned URL...");
    const { key, expiresIn } = req.body;
    
    if (!key) {
      return res.status(400).json({ error: "key required" });
    }

    const bucket = process.env.S3_BUCKET || "my-student-bucket";
    const uploader = new S3Uploader();
    
    // Check bucket using robust check
    const bucketExists = await uploader.ensureBucketExists(bucket);
    if (!bucketExists) {
      return res.status(500).json({ 
        error: "Bucket access denied", 
        details: "Cannot access or create bucket." 
      });
    }

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    const url = await getSignedUrl(
      (uploader as any).s3Client, 
      command, 
      { expiresIn: expiresIn || 900 }
    );

    console.log(`[OK] Presigned URL generated`);
    res.json({ url, key, bucket, method: 'presigned-url', expiresIn: expiresIn || 900 });
  } catch (e: any) {
    console.error(`[ERROR] Presign Error:`, e.message);
    res.status(500).json({ 
      error: "Presign failed", 
      details: e.message 
    });
  }
});

// AWS Identity endpoint
app.get("/api/aws/identity", async (req: Request, res: Response) => {
  try {
    const identity = await awsIAMClient.verifyCredentials();
    res.json(identity);
  } catch (e: any) {
    console.error("❌ AWS identity check failed:", e.message);
    res.status(500).json({ 
      error: "AWS identity check failed", 
      details: e.message 
    });
  }
});

// List S3 objects
app.get("/api/s3/list", async (req: Request, res: Response) => {
  try {
    console.log("\n[INFO] Listing S3 bucket contents...");
    const bucket = process.env.S3_BUCKET || "my-student-bucket";
    const uploader = new S3Uploader();
    
    // We access s3Client directly for listing as S3Uploader doesn't expose it wrapper yet
    // but the client is public/accessible or we cast as any
    const command = new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 50 });
    const response = await (uploader as any).s3Client.send(command);
    
    const objects = response.Contents?.map(obj => ({
      key: obj.Key,
      size: obj.Size,
      lastModified: obj.LastModified
    })) || [];

    console.log(`[OK] Found ${objects.length} objects in bucket`);
    res.json({ bucket, objects, count: objects.length });
  } catch (e: any) {
    console.error(`[ERROR] List failed:`, e.message);
    res.status(500).json({ error: "List failed", details: e.message });
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
    console.log(`\n[OK] API Gateway server running on port ${PORT}`);
    console.log(`[SECURE] Authorization Mode: ${AUTHORIZATION_MODE.toUpperCase()}`);
    console.log(`[OK] Health check: http://localhost:${PORT}/health`);
    console.log(`[OK] WebSocket server: ws://localhost:${PORT}`);
    console.log(`[OK] API endpoints: http://localhost:${PORT}/api\n`);
  })
  .on("error", (e: any) => {
    if (e.code === "EADDRINUSE") {
      console.error(`[ERROR] Port ${PORT} is already in use.`);
    } else {
      console.error("[ERROR] Server error:", e);
    }
    process.exit(1);
  });

export default app;
