import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";


export const dynamoDBClient = new DynamoDBClient({
  region: process.env.REGION || process.env.AWS_REGION || "us-east-1",
  ...(process.env.DYNAMODB_LOCAL_ENDPOINT ? { endpoint: process.env.DYNAMODB_LOCAL_ENDPOINT } : {}),
  ...(process.env.DYNAMODB_ACCESS_KEY_ID ? {
    credentials: {
      accessKeyId: process.env.DYNAMODB_ACCESS_KEY_ID,
      secretAccessKey: process.env.DYNAMODB_SECRET_ACCESS_KEY || "fake"
    }
  } : {})
});

export const db = DynamoDBDocumentClient.from(dynamoDBClient, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

export const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || "SimpleLedger";
