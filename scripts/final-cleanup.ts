import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand, PutCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { config } from "dotenv";
config({ path: ".env.local" });

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || "us-east-1",
  ...(process.env.DYNAMODB_LOCAL_ENDPOINT ? { 
    endpoint: process.env.DYNAMODB_LOCAL_ENDPOINT,
    credentials: { accessKeyId: "fake", secretAccessKey: "fake" }
  } : {})
});

const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || "SimpleLedger";

async function run() {
  const orgId = "0dac4053-7d2f-4508-8ef4-0a1c94ed19c3";
  const realOwnerId = "google-oauth2|111255427906830971623"; // nooraldinahmed@gmail.com
  const viewerId = "google-oauth2|112625869036611439656"; // oldschoolritual@gmail.com
  
  console.log(`Step 1: Fixing Metadata OwnerId to ${realOwnerId}...`);
  await docClient.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { PK: `ORG#${orgId}`, SK: `METADATA` },
    UpdateExpression: "SET ownerId = :ownerId",
    ExpressionAttributeValues: { ":ownerId": realOwnerId }
  }));

  console.log(`Step 2: Ensuring real owner record is correct...`);
  // Fetch their record first to keep other fields
  const resOwner = await docClient.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { PK: `ORG#${orgId}`, SK: `USER#${realOwnerId}` }
  }));
  if (resOwner.Item) {
    await docClient.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: `ORG#${orgId}`, SK: `USER#${realOwnerId}` },
      UpdateExpression: "SET isOwner = :true, #role = :admin",
      ExpressionAttributeNames: { "#role": "role" },
      ExpressionAttributeValues: { ":true": true, ":admin": "admin" }
    }));
  }

  console.log(`Step 3: Downgrading oldschoolritual to Viewer...`);
  await docClient.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { PK: `ORG#${orgId}`, SK: `USER#${viewerId}` },
    UpdateExpression: "SET isOwner = :false, #role = :viewer",
    ExpressionAttributeNames: { "#role": "role" },
    ExpressionAttributeValues: { ":false": false, ":viewer": "viewer" }
  }));

  console.log("Cleanup complete.");
}

run();
