import { ethers } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  // Check environment variables
  if (!process.env.SEPOLIA_RPC_URL || process.env.SEPOLIA_RPC_URL.includes("YOUR_PROJECT_ID")) {
    console.error("ERROR: SEPOLIA_RPC_URL not set or invalid in .env file");
    console.error("Please set SEPOLIA_RPC_URL in your .env file");
    process.exit(1);
  }

  if (!process.env.PRIVATE_KEY || process.env.PRIVATE_KEY === "0x0000000000000000000000000000000000000000000000000000000000000000") {
    console.error("ERROR: PRIVATE_KEY not set or invalid in .env file");
    console.error("Please set PRIVATE_KEY in your .env file");
    process.exit(1);
  }

  try {
    const [deployer] = await ethers.getSigners();
    console.log("Deploying contracts with account:", deployer.address);
    
    const balance = await ethers.provider.getBalance(deployer.address);
    console.log("Account balance:", ethers.formatEther(balance), "ETH");
    
    if (balance === 0n) {
      console.error("ERROR: Account has zero balance. Please fund your account with Sepolia ETH");
      console.error("Get testnet ETH from: https://sepoliafaucet.com/");
      process.exit(1);
    }
  } catch (error: any) {
    console.error("ERROR: Failed to connect to network");
    console.error("Error:", error.message);
    console.error("\nPlease check:");
    console.error("1. SEPOLIA_RPC_URL is correct in .env");
    console.error("2. Your internet connection");
    console.error("3. The RPC endpoint is accessible");
    process.exit(1);
  }

  const [deployer] = await ethers.getSigners();

  // Deploy FROST Verifier
  console.log("\n1. Deploying FROSTVerifier...");
  const FROSTVerifierFactory = await ethers.getContractFactory("FROSTVerifier");
  const frostVerifier = await FROSTVerifierFactory.deploy();
  await frostVerifier.waitForDeployment();
  const frostVerifierAddress = await frostVerifier.getAddress();
  console.log("FROSTVerifier deployed to:", frostVerifierAddress);

  // Deploy Threshold Manager
  console.log("\n2. Deploying ThresholdManagerContract...");
  const threshold = 3; // t-of-n threshold
  const initialParticipants = [
    process.env.PARTICIPANT1 || deployer.address,
    process.env.PARTICIPANT2,
    process.env.PARTICIPANT3,
    process.env.PARTICIPANT4,
    process.env.PARTICIPANT5,
  ].filter((addr) => addr !== undefined && addr !== "") as string[];

  // Ensure we have at least 5 participants for the threshold of 3
  // If deploying with a single account, generate random addresses for the rest
  while (initialParticipants.length < 5) {
    const randomWallet = ethers.Wallet.createRandom();
    initialParticipants.push(randomWallet.address);
  }

  // Remove duplicates just in case
  const uniqueParticipants = [...new Set(initialParticipants)];

  const ThresholdManagerFactory = await ethers.getContractFactory("ThresholdManagerContract");
  const thresholdManager = await ThresholdManagerFactory.deploy(threshold, uniqueParticipants);
  await thresholdManager.waitForDeployment();
  const thresholdManagerAddress = await thresholdManager.getAddress();
  console.log("ThresholdManagerContract deployed to:", thresholdManagerAddress);
  console.log("Initial threshold:", threshold);
  console.log("Initial participants:", initialParticipants.length);

  // Deploy Access Control Contract
  console.log("\n3. Deploying AccessControlContract...");
  const initialPolicyRoot = ethers.keccak256(ethers.toUtf8Bytes("initial_policy_root"));
  const AccessControlFactory = await ethers.getContractFactory("AccessControlContract");
  const accessControl = await AccessControlFactory.deploy(
    thresholdManagerAddress,
    frostVerifierAddress,
    initialPolicyRoot
  );
  await accessControl.waitForDeployment();
  const accessControlAddress = await accessControl.getAddress();
  console.log("AccessControlContract deployed to:", accessControlAddress);

  // Optional: Deploy Proxy
  if (process.env.DEPLOY_PROXY === "true") {
    console.log("\n4. Deploying Proxy...");
    const ProxyAdminFactory = await ethers.getContractFactory("ProxyAdmin");
    const proxyAdmin = await ProxyAdminFactory.deploy();
    await proxyAdmin.waitForDeployment();
    const proxyAdminAddress = await proxyAdmin.getAddress();
    console.log("ProxyAdmin deployed to:", proxyAdminAddress);

    const initData = AccessControlFactory.interface.encodeFunctionData("initialize", []);
    const ProxyFactory = await ethers.getContractFactory("AccessControlProxy");
    const proxy = await ProxyFactory.deploy(accessControlAddress, proxyAdminAddress, initData);
    await proxy.waitForDeployment();
    const proxyAddress = await proxy.getAddress();
    console.log("AccessControlProxy deployed to:", proxyAddress);
  }

  // Summary
  console.log("\n=== Deployment Summary ===");
  console.log("FROSTVerifier:", frostVerifierAddress);
  console.log("ThresholdManagerContract:", thresholdManagerAddress);
  console.log("AccessControlContract:", accessControlAddress);
  console.log("\nTo verify contracts on Etherscan, run:");
  console.log(`npx hardhat verify --network sepolia ${frostVerifierAddress}`);
  console.log(`npx hardhat verify --network sepolia ${thresholdManagerAddress} ${threshold} "[${uniqueParticipants.join(',')}]"`);
  console.log(`npx hardhat verify --network sepolia ${accessControlAddress} ${thresholdManagerAddress} ${frostVerifierAddress} ${initialPolicyRoot}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

