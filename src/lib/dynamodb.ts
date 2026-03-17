import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

const isLocalDb = !!process.env.DYNAMODB_LOCAL_ENDPOINT;

const client = new DynamoDBClient({
  region: process.env.REGION || "us-east-1",
  ...(isLocalDb ? {
    endpoint: process.env.DYNAMODB_LOCAL_ENDPOINT,
    credentials: { accessKeyId: process.env.ACCESS_KEY_ID || "fake", secretAccessKey: process.env.SECRET_ACCESS_KEY || "fake" }
  } : {})
});

export const db = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

export const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || "SimpleLedger";
