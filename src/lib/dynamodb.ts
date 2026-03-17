import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";


const client = new DynamoDBClient({
  region: process.env.REGION || "us-east-1",
  ...(process.env.DYNAMODB_LOCAL_ENDPOINT ? { endpoint: process.env.DYNAMODB_LOCAL_ENDPOINT } : {}),
  ...(process.env.ACCESS_KEY_ID ? {
    credentials: {
      accessKeyId: process.env.ACCESS_KEY_ID,
      secretAccessKey: process.env.SECRET_ACCESS_KEY || "fake"
    }
  } : {})
});

export const db = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

export const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || "SimpleLedger";
