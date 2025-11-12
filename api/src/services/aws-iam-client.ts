/**
 * AWS IAM Client Service
 * 
 * Handles integration with AWS IAM for access control decisions
 * and policy enforcement
 */

import {
  IAMClient,
  GetUserCommand,
  ListAttachedUserPoliciesCommand,
  SimulatePrincipalPolicyCommand,
  AttachUserPolicyCommand,
  DetachUserPolicyCommand,
} from "@aws-sdk/client-iam";
import { STSClient, GetCallerIdentityCommand } from "@aws-sdk/client-sts";

export interface AccessRequest {
  principal: string; // IAM user/role ARN
  resource: string; // AWS resource ARN
  action: string; // IAM action (e.g., "s3:GetObject")
}

export interface PolicyDecision {
  allowed: boolean;
  reason?: string;
  policies?: string[];
}

export class AWSIAMClient {
  private iamClient: IAMClient;
  private stsClient: STSClient;
  private region: string;

  constructor(region: string = "us-east-1") {
    this.region = region || process.env.AWS_REGION || "us-east-1";
    
    // Use environment variables if available
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    
    const clientConfig: any = { 
      region: this.region,
    };

    // Only set credentials if both are provided
    if (accessKeyId && secretAccessKey) {
      const trimmedKeyId = accessKeyId.trim();
      const trimmedSecret = secretAccessKey.trim();
      
      // Validate they're not empty after trimming
      if (trimmedKeyId.length > 0 && trimmedSecret.length > 0) {
        clientConfig.credentials = {
          accessKeyId: trimmedKeyId,
          secretAccessKey: trimmedSecret,
        };
        console.log("✅ AWS credentials loaded from environment variables");
        console.log(`   Access Key ID: ${trimmedKeyId.substring(0, 8)}...${trimmedKeyId.substring(trimmedKeyId.length - 4)}`);
      } else {
        console.warn("⚠️ AWS credentials found but are empty after trimming");
        console.warn("⚠️ Please check AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in .env");
      }
    } else {
      console.warn("⚠️ AWS credentials not found in environment variables");
      console.warn("⚠️ Looking for: AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY");
      console.warn("⚠️ Current values:", { 
        hasKeyId: !!accessKeyId, 
        hasSecret: !!secretAccessKey,
        keyIdLength: accessKeyId?.length || 0,
        secretLength: secretAccessKey?.length || 0
      });
      // AWS SDK will try to load from default credential chain
    }

    this.iamClient = new IAMClient(clientConfig);
    this.stsClient = new STSClient(clientConfig);
  }

  /**
   * Verify AWS credentials and get caller identity
   */
  async verifyCredentials(): Promise<{ accountId: string; arn: string }> {
    try {
      const command = new GetCallerIdentityCommand({});
      const response = await this.stsClient.send(command);
      console.log("✅ AWS credentials verified successfully");
      return {
        accountId: response.Account || "",
        arn: response.Arn || "",
      };
    } catch (error: any) {
      const errorMessage = error.message || String(error);
      console.error("❌ AWS credential verification failed:", errorMessage);
      
      // Provide helpful error message
      if (errorMessage.includes("Could not load credentials")) {
        throw new Error(`AWS credential verification failed: ${errorMessage}. Please check AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in .env file`);
      }
      throw new Error(`AWS credential verification failed: ${errorMessage}`);
    }
  }

  /**
   * Check if a principal has access to a resource
   * @param request Access request
   * @returns Policy decision
   */
  async checkAccess(request: AccessRequest): Promise<PolicyDecision> {
    try {
      // Extract user name from ARN
      const userName = this.extractUserName(request.principal);
      if (!userName) {
        return {
          allowed: false,
          reason: "Invalid principal ARN",
        };
      }

      // Get user's attached policies
      const listPoliciesCommand = new ListAttachedUserPoliciesCommand({
        UserName: userName,
      });
      const policiesResponse = await this.iamClient.send(listPoliciesCommand);
      const policyArns = policiesResponse.AttachedPolicies?.map((p) => p.PolicyArn || "") || [];

      // Simulate policy to check access
      const simulateCommand = new SimulatePrincipalPolicyCommand({
        PolicySourceArn: request.principal,
        ActionNames: [request.action],
        ResourceArns: [request.resource],
      });

      try {
        const simulateResponse = await this.iamClient.send(simulateCommand);
        const evaluationResults = simulateResponse.EvaluationResults || [];
        
        if (evaluationResults.length > 0) {
          const result = evaluationResults[0];
          const allowed = result.EvalDecision === "allowed";
          
          return {
            allowed,
            reason: result.EvalDecision === "allowed" ? "Policy allows access" : "Policy denies access",
            policies: policyArns,
          };
        }
      } catch (simulateError) {
        // If simulation fails, fall back to basic policy check
        console.warn("Policy simulation failed, using basic check:", simulateError);
      }

      // Basic check: if user has policies attached, assume allowed (simplified)
      // In production, implement proper policy evaluation
      return {
        allowed: policyArns.length > 0,
        reason: policyArns.length > 0 ? "Policy attached" : "No policies attached",
        policies: policyArns,
      };
    } catch (error) {
      console.error("AWS IAM access check error:", error);
      return {
        allowed: false,
        reason: `IAM check failed: ${error}`,
      };
    }
  }

  /**
   * Attach a policy to a user
   * @param userName IAM user name
   * @param policyArn Policy ARN to attach
   */
  async attachPolicy(userName: string, policyArn: string): Promise<void> {
    try {
      const command = new AttachUserPolicyCommand({
        UserName: userName,
        PolicyArn: policyArn,
      });
      await this.iamClient.send(command);
    } catch (error) {
      throw new Error(`Failed to attach policy: ${error}`);
    }
  }

  /**
   * Detach a policy from a user
   * @param userName IAM user name
   * @param policyArn Policy ARN to detach
   */
  async detachPolicy(userName: string, policyArn: string): Promise<void> {
    try {
      const command = new DetachUserPolicyCommand({
        UserName: userName,
        PolicyArn: policyArn,
      });
      await this.iamClient.send(command);
    } catch (error) {
      throw new Error(`Failed to detach policy: ${error}`);
    }
  }

  /**
   * Extract user name from IAM ARN
   * @param arn IAM ARN
   * @returns User name or null
   */
  private extractUserName(arn: string): string | null {
    // ARN format: arn:aws:iam::account-id:user/username
    const match = arn.match(/arn:aws:iam::\d+:user\/(.+)/);
    return match ? match[1] : null;
  }

  /**
   * Convert resource identifier to AWS ARN format
   * @param resource Resource identifier
   * @param service AWS service (e.g., "s3", "ec2")
   * @param accountId AWS account ID
   * @returns ARN string
   */
  static resourceToARN(resource: string, service: string, accountId: string): string {
    // Simplified ARN construction
    // In production, handle different resource types properly
    if (resource.startsWith("arn:aws:")) {
      return resource; // Already an ARN
    }
    return `arn:aws:${service}:${process.env.AWS_REGION || "us-east-1"}:${accountId}:${resource}`;
  }
}

