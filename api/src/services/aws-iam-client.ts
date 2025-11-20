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

      if (trimmedKeyId.length > 0 && trimmedSecret.length > 0) {
        clientConfig.credentials = {
          accessKeyId: trimmedKeyId,
          secretAccessKey: trimmedSecret,
        };
      }
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
      return {
        accountId: response.Account || "",
        arn: response.Arn || "",
      };
    } catch (error: any) {
      const errorMessage = error.message || String(error);
      
      // Provide helpful error messages based on error type
      if (errorMessage.includes("Could not load credentials") || 
          errorMessage.includes("Missing credentials")) {
        throw new Error(
          `AWS credential verification failed: Credentials not found. Please set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in .env file`
        );
      }
      
      if (errorMessage.includes("InvalidClientTokenId") || 
          errorMessage.includes("invalid") ||
          errorMessage.includes("The security token included in the request is invalid")) {
        throw new Error(
          `AWS credential verification failed: Invalid or expired credentials. Please check AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in .env file and ensure they are valid and not expired`
        );
      }
      
      if (errorMessage.includes("SignatureDoesNotMatch")) {
        throw new Error(
          `AWS credential verification failed: Signature mismatch. Please verify AWS_SECRET_ACCESS_KEY is correct`
        );
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
      // Check if principal is an STS assumed role
      const isAssumedRole = request.principal.includes(":sts::") && 
                           request.principal.includes(":assumed-role/");
      
      // For STS assumed roles, use the principal ARN directly for simulation
      // For IAM users/roles, extract the name
      const principalName = this.extractUserName(request.principal);
      
      if (!isAssumedRole && !principalName) {
        return {
          allowed: false,
          reason: "Invalid principal ARN format",
        };
      }

      // Try to simulate policy using the principal ARN directly
      // This works for both IAM users/roles and STS assumed roles
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
            reason:
              result.EvalDecision === "allowed"
                ? "Policy allows access"
                : "Policy denies access",
            policies: [],
          };
        }
      } catch (simulateError: any) {
        // If simulation fails, check if it's a permission issue or invalid principal
        const errorMessage = simulateError.message || String(simulateError);
        
        // For assumed roles, we might not have permission to list policies
        // but we can still return a decision based on the simulation error
        if (errorMessage.includes("AccessDenied") || 
            errorMessage.includes("NoSuchEntity") ||
            errorMessage.includes("InvalidInput")) {
          return {
            allowed: false,
            reason: `Access denied: ${errorMessage}`,
          };
        }
        
        // For other errors, fall through to basic check
      }

      // Fallback: For IAM users (not assumed roles), try to list attached policies
      if (!isAssumedRole && principalName) {
        try {
          const listPoliciesCommand = new ListAttachedUserPoliciesCommand({
            UserName: principalName,
          });
          const policiesResponse = await this.iamClient.send(listPoliciesCommand);
          const policyArns =
            policiesResponse.AttachedPolicies?.map((p) => p.PolicyArn || "") || [];

          return {
            allowed: policyArns.length > 0,
            reason:
              policyArns.length > 0 
                ? "Policy attached (simulation unavailable)" 
                : "No policies attached",
            policies: policyArns,
          };
        } catch (listError) {
          // If listing policies fails, return denied
          return {
            allowed: false,
            reason: "Unable to verify access: policy check failed",
          };
        }
      }

      // For assumed roles without simulation results, return denied
      return {
        allowed: false,
        reason: "Unable to verify access for assumed role",
      };
    } catch (error: any) {
      const errorMessage = error.message || String(error);
      console.error("AWS IAM access check error:", errorMessage);
      
      // Provide more specific error messages
      if (errorMessage.includes("InvalidClientTokenId") || 
          errorMessage.includes("invalid") ||
          errorMessage.includes("expired")) {
        return {
          allowed: false,
          reason: "AWS credentials invalid or expired. Please check AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in .env file",
        };
      }
      
      return {
        allowed: false,
        reason: `IAM check failed: ${errorMessage}`,
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
   * Extract user name or role name from IAM/STS ARN
   * @param arn IAM/STS ARN
   * @returns User name, role name, or null
   */
  private extractUserName(arn: string): string | null {
    // Handle IAM user ARN: arn:aws:iam::account-id:user/username
    const userMatch = arn.match(/arn:aws:iam::\d+:user\/(.+)/);
    if (userMatch) {
      return userMatch[1];
    }

    // Handle STS assumed role ARN: arn:aws:sts::account-id:assumed-role/role-name/session-name
    const roleMatch = arn.match(/arn:aws:sts::\d+:assumed-role\/([^\/]+)\/(.+)/);
    if (roleMatch) {
      return roleMatch[1]; // Return role name
    }

    // Handle IAM role ARN: arn:aws:iam::account-id:role/role-name
    const iamRoleMatch = arn.match(/arn:aws:iam::\d+:role\/(.+)/);
    if (iamRoleMatch) {
      return iamRoleMatch[1];
    }

    return null;
  }

  /**
   * Convert resource identifier to AWS ARN format
   * @param resource Resource identifier
   * @param service AWS service (e.g., "s3", "ec2")
   * @param accountId AWS account ID
   * @returns ARN string
   */
  static resourceToARN(
    resource: string,
    service: string,
    accountId: string
  ): string {
    // Simplified ARN construction
    // In production, handle different resource types properly
    if (resource.startsWith("arn:aws:")) {
      return resource; // Already an ARN
    }
    return `arn:aws:${service}:${
      process.env.AWS_REGION || "us-east-1"
    }:${accountId}:${resource}`;
  }
}
