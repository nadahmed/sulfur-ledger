import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { v2 as cloudinary } from "cloudinary";
import { Organization, StorageSettings } from "./db/organizations";

export interface StorageConfig {
  provider: "s3" | "cloudinary";
  s3?: {
    endpoint: string,
    region: string,
    accessKeyId: string,
    secretAccessKey: string,
    bucketName: string,
  };
  cloudinary?: {
    cloudName: string,
    apiKey: string,
    apiSecret: string,
  };
  folder?: string;
}

export function getEffectiveStorageConfig(org: Organization): StorageConfig {
  const settings = org.storageSettings;

  if (!settings || settings.provider === "system") {
    const systemProvider = (process.env.SYSTEM_STORAGE_PROVIDER || "s3") as "s3" | "cloudinary";
    
    if (systemProvider === "s3") {
      return {
        provider: "s3",
        s3: {
          endpoint: process.env.SYSTEM_S3_ENDPOINT || "",
          region: process.env.SYSTEM_S3_REGION || "auto",
          accessKeyId: process.env.SYSTEM_S3_ACCESS_KEY_ID || "",
          secretAccessKey: process.env.SYSTEM_S3_SECRET_ACCESS_KEY || "",
          bucketName: process.env.SYSTEM_S3_BUCKET_NAME || "sulfurbook",
        },
        folder: `${org.id}/receipts`, // Hardcoded pattern for system
      };
    } else {
      return {
        provider: "cloudinary",
        cloudinary: {
          cloudName: process.env.SYSTEM_CLOUDINARY_CLOUD_NAME || "",
          apiKey: process.env.SYSTEM_CLOUDINARY_API_KEY || "",
          apiSecret: process.env.SYSTEM_CLOUDINARY_API_SECRET || "",
        },
        folder: `${org.id}/receipts`,
      };
    }
  }

  if (settings.provider === "s3" && settings.s3) {
    return {
      provider: "s3",
      s3: settings.s3,
      folder: settings.customFolder,
    };
  }

  if (settings.provider === "cloudinary" && settings.cloudinary) {
    return {
      provider: "cloudinary",
      cloudinary: settings.cloudinary,
      folder: settings.customFolder,
    };
  }

  throw new Error("Invalid storage configuration");
}

export async function getPresignedUploadUrl(config: StorageConfig, key: string, contentType: string) {
  if (config.provider === "s3" && config.s3) {
    const s3 = new S3Client({
      endpoint: config.s3.endpoint,
      region: config.s3.region,
      credentials: {
        accessKeyId: config.s3.accessKeyId,
        secretAccessKey: config.s3.secretAccessKey,
      },
      forcePathStyle: true,
    });

    const fullKey = config.folder ? `${config.folder}/${key}` : key;
    const command = new PutObjectCommand({
      Bucket: config.s3.bucketName,
      Key: fullKey,
      ContentType: contentType,
    });

    const url = await getSignedUrl(s3, command, { expiresIn: 3600 });
    return { url, fields: {}, fullKey, provider: "s3" };
  }

  if (config.provider === "cloudinary" && config.cloudinary) {
    cloudinary.config({
      cloud_name: config.cloudinary.cloudName,
      api_key: config.cloudinary.apiKey,
      api_secret: config.cloudinary.apiSecret,
      secure: true,
    });

    const timestamp = Math.round(new Date().getTime() / 1000);
    const folder = config.folder || "receipts";
    
    // Cloudinary uses public_id for naming. We strip extension if it's there as Cloudinary adds it.
    const publicId = key.replace(/\.[^/.]+$/, "");
    
    const signature = cloudinary.utils.api_sign_request(
      { timestamp, folder, public_id: publicId },
      config.cloudinary.apiSecret
    );

    return {
      url: `https://api.cloudinary.com/v1_1/${config.cloudinary.cloudName}/auto/upload`,
      fields: {
        api_key: config.cloudinary.apiKey,
        timestamp,
        signature,
        folder,
        public_id: publicId,
      },
      fullKey: `${folder}/${publicId}`,
      provider: "cloudinary",
    };
  }

  throw new Error("Unsupported storage provider");
}

export async function getDownloadUrl(config: StorageConfig, key: string) {
  if (config.provider === "s3" && config.s3) {
    const s3 = new S3Client({
      endpoint: config.s3.endpoint,
      region: config.s3.region,
      credentials: {
        accessKeyId: config.s3.accessKeyId,
        secretAccessKey: config.s3.secretAccessKey,
      },
      forcePathStyle: true,
    });

    const command = new GetObjectCommand({
      Bucket: config.s3.bucketName,
      Key: key,
    });

    return await getSignedUrl(s3, command, { expiresIn: 3600 });
  }

  if (config.provider === "cloudinary" && config.cloudinary) {
    cloudinary.config({
      cloud_name: config.cloudinary.cloudName,
      api_key: config.cloudinary.apiKey,
      api_secret: config.cloudinary.apiSecret,
      secure: true,
    });

    // For Cloudinary, we just return the secure URL. 
    // If the image is private, we'd need a signed URL. 
    // Assuming default is public but isolated by random IDs in key.
    return cloudinary.url(key, { secure: true });
  }

  throw new Error("Unsupported storage provider");
}
