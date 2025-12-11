import {
  S3Client,
  HeadBucketCommand,
  CreateBucketCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import * as fs from "fs";
import * as path from "path";

type UploadHistory = {
  files: string[];
};

export class S3Uploader {
  private awsAccessKeyId?: string;
  private awsSecretAccessKey?: string;
  private awsSessionToken?: string;
  private awsRegion: string;
  private s3Client: S3Client;
  public uploadHistory: UploadHistory;

  constructor() {
    this.awsAccessKeyId = process.env.AWS_ACCESS_KEY_ID?.trim().replace(/^["']|["']$/g, '');
    this.awsSecretAccessKey = process.env.AWS_SECRET_ACCESS_KEY?.trim().replace(/^["']|["']$/g, '');
    this.awsSessionToken = process.env.AWS_SESSION_TOKEN?.trim().replace(/^["']|["']$/g, '');
    this.awsRegion = process.env.AWS_REGION || "us-east-1";

    if (!this.awsAccessKeyId || !this.awsSecretAccessKey) {
      console.warn("[WARN] Warning: AWS credentials are missing from environment variables");
    }

    this.s3Client = new S3Client({
      region: this.awsRegion,
      credentials: this.awsAccessKeyId && this.awsSecretAccessKey
        ? {
            accessKeyId: this.awsAccessKeyId,
            secretAccessKey: this.awsSecretAccessKey,
            sessionToken: this.awsSessionToken,
          }
        : undefined,
    });

    this.uploadHistory = {
      files: [],
    };
  }

  /**
   * Check if a bucket exists, create it if it doesn't.
   * STRICT MODE: Fails if permissions are insufficient.
   */
  public async ensureBucketExists(bucket: string): Promise<boolean> {
    try {
      await this.s3Client.send(new HeadBucketCommand({ Bucket: bucket }));
      console.log(`[OK] Bucket exists: ${bucket}`);
      return true;
    } catch (error: any) {
      const statusCode = error?.$metadata?.httpStatusCode;
      const code = error?.name || error?.Code;

      // Bucket doesn't exist -> Create it
      if (statusCode === 404 || code === "NotFound" || code === "NoSuchBucket") {
        try {
          console.log(`[INFO] Bucket ${bucket} not found. Attempting to create...`);
            const createBucketParams: any =
            this.awsRegion === "us-east-1"
              ? { Bucket: bucket }
              : {
                  Bucket: bucket,
                  CreateBucketConfiguration: { LocationConstraint: this.awsRegion as any },
                };

          await this.s3Client.send(new CreateBucketCommand(createBucketParams));
          console.log(`[OK] Created new bucket: ${bucket}`);
          return true;
        } catch (createError: any) {
          console.error(`[ERROR] Failed to create bucket ${bucket}:`, createError.message || createError);
          // In strict mode, we return false if we can't create it
          return false;
        }
      } 
      
      // Permission issues -> Fail (Strict Reliability)
      if (statusCode === 403 || code === "Forbidden" || code === "AccessDenied") {
        console.error(`[ERROR] Access Denied checking bucket ${bucket}. Check AWS IAM permissions.`);
        return false;
      }

      console.error(`[ERROR] Error checking bucket ${bucket}:`, error.message || error);
      return false;
    }
  }

  /**
   * Upload a file from local disk to S3
   */
  public async uploadFile(
    localPath: string,
    bucket: string,
    s3Key?: string
  ): Promise<boolean> {
    try {
      if (!fs.existsSync(localPath)) {
        console.error(`[ERROR] Local file not found: ${localPath}`);
        return false;
      }

      // Check bucket existence first
      const bucketOk = await this.ensureBucketExists(bucket);
      if (!bucketOk) return false;

      if (!s3Key) {
        s3Key = path.basename(localPath);
      }

      const fileContent = fs.readFileSync(localPath);

      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: s3Key,
          Body: fileContent,
        })
      );

      console.log(`[OK] Uploaded to S3: s3://${bucket}/${s3Key}`);
      this.uploadHistory.files.push(`s3://${bucket}/${s3Key}`);
      return true;
    } catch (error: any) {
      console.error(`[ERROR] S3 upload failed for ${s3Key}:`, error.message || error);
      return false;
    }
  }
}
