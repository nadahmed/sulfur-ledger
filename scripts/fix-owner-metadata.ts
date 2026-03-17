import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { config } from "dotenv";
import { dynamoDBClient } from "@/lib/dynamodb";
config({ path: ".env.local" });


const docClient = DynamoDBDocumentClient.from(dynamoDBClient, {
  marshallOptions: { removeUndefinedValues: true },
});

const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || "SimpleLedger";

async function run() {
  const orgId = "0dac4053-7d2f-4508-8ef4-0a1c94ed19c3";
  const newOwnerId = "google-oauth2|111255427906830971623"; // nooraldinahmed@gmail.com

  console.log(`Updating OwnerId for Org ${orgId} to ${newOwnerId}...`);

  await docClient.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: {
      PK: `ORG#${orgId}`,
      SK: `METADATA`,
    },
    UpdateExpression: "SET ownerId = :ownerId",
    ExpressionAttributeValues: { ":ownerId": newOwnerId }
  }));

  console.log("Metadata updated.");
  console.log("Done.");
}

run();
