// s3Uploader.ts
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
  dataframes: string[];
  plots: string[];
  models: string[];
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
      console.warn("⚠️ Warning: AWS credentials are missing from environment variables");
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
      dataframes: [],
      plots: [],
      models: [],
    };
  }

  /**
   * Check if a bucket exists, create it if it doesn't
   */
  public async ensureBucketExists(bucket: string): Promise<boolean> {
    try {
      await this.s3Client.send(new HeadBucketCommand({ Bucket: bucket }));
      console.log(`✅ Bucket exists: ${bucket}`);
      return true;
    } catch (error: any) {
      const statusCode = error?.$metadata?.httpStatusCode;
      const code = error?.name || error?.Code;

      // Bucket doesn't exist
      if (statusCode === 404 || code === "NotFound" || code === "NoSuchBucket") {
        try {
          // For us-east-1 you typically MUST NOT set LocationConstraint
          const createBucketParams =
            this.awsRegion === "us-east-1"
              ? { Bucket: bucket }
              : {
                  Bucket: bucket,
                  CreateBucketConfiguration: { LocationConstraint: this.awsRegion },
                };

          await this.s3Client.send(new CreateBucketCommand(createBucketParams));
          console.log(`✅ Created new bucket: ${bucket}`);
          return true;
        } catch (createError: any) {
          console.error(`❌ Failed to create bucket ${bucket}:`, createError.message || createError);
          return false;
        }
      } else if (statusCode === 403 || code === "Forbidden") {
        console.error(`❌ No permission to access bucket: ${bucket}`);
        return false;
      } else {
        console.error(`❌ Error checking bucket ${bucket}:`, error.message || error);
        return false;
      }
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
      // Check if file exists
      if (!fs.existsSync(localPath)) {
        console.error(`❌ Local file not found: ${localPath}`);
        return false;
      }

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

      console.log(`✅ Uploaded to S3: s3://${bucket}/${s3Key}`);
      this.uploadHistory.files.push(`s3://${bucket}/${s3Key}`);
      return true;
    } catch (error: any) {
      console.error(`❌ S3 upload failed for ${s3Key}:`, error.message || error);
      return false;
    }
  }

  /**
   * Upload a "DataFrame" as CSV
   * Equivalent of pandas DataFrame: an array of objects
   */
  public async uploadDataframe(
    rows: Array<Record<string, any>>,
    bucket: string,
    s3Key: string
  ): Promise<boolean> {
    try {
      const bucketOk = await this.ensureBucketExists(bucket);
      if (!bucketOk) return false;

      if (!rows || rows.length === 0) {
        console.warn("⚠️ No rows provided for DataFrame upload.");
        return false;
      }

      // Build CSV
      const headers = Object.keys(rows[0]);
      const csvLines = [
        headers.join(","), // header row
        ...rows.map((row) =>
          headers
            .map((h) => {
              const value = row[h];
              // Basic CSV escaping
              if (value === null || value === undefined) return "";
              const str = String(value);
              if (str.includes(",") || str.includes('"') || str.includes("\n")) {
                return `"${str.replace(/"/g, '""')}"`;
              }
              return str;
            })
            .join(",")
        ),
      ];

      const csvString = csvLines.join("\n");

      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: s3Key,
          Body: csvString,
          ContentType: "text/csv",
        })
      );

      console.log(`✅ Uploaded DataFrame to S3: s3://${bucket}/${s3Key}`);
      this.uploadHistory.dataframes.push(`s3://${bucket}/${s3Key}`);
      return true;
    } catch (error: any) {
      console.error(`❌ S3 DataFrame upload failed for ${s3Key}:`, error.message || error);
      return false;
    }
  }

  /**
   * Upload a plot/image file to S3
   */
  public async uploadPlot(
    localImagePath: string,
    bucket: string,
    s3Key?: string
  ): Promise<boolean> {
    try {
      const bucketOk = await this.ensureBucketExists(bucket);
      if (!bucketOk) return false;

      if (!s3Key) {
        s3Key = path.basename(localImagePath);
      }

      const success = await this.uploadFile(localImagePath, bucket, s3Key);

      if (success) {
        this.uploadHistory.plots.push(`s3://${bucket}/${s3Key}`);
      }

      return success;
    } catch (error: any) {
      console.error("❌ Plot upload failed:", error.message || error);
      return false;
    }
  }

  /**
   * Serialize a model and upload to S3
   */
  public async uploadModel(
    model: any,
    modelName: string,
    bucket: string,
    s3Key: string
  ): Promise<boolean> {
    const localFilename = `${modelName}_model.json`;

    try {
      const bucketOk = await this.ensureBucketExists(bucket);
      if (!bucketOk) return false;

      // Serialize model as JSON
      fs.writeFileSync(localFilename, JSON.stringify(model, null, 2), "utf-8");
      console.log(`📦 Model serialized: ${localFilename}`);

      const success = await this.uploadFile(localFilename, bucket, s3Key);

      if (success) {
        this.uploadHistory.models.push(`s3://${bucket}/${s3Key}`);
      }

      return success;
    } catch (error: any) {
      console.error("❌ Model serialization/upload failed:", error.message || error);
      return false;
    } finally {
      // Clean up local file
      if (fs.existsSync(localFilename)) {
        fs.unlinkSync(localFilename);
      }
    }
  }
}

// Create a global instance (similar to your Python code)
export const s3Uploader = new S3Uploader();
