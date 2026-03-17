import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { config } from "dotenv";
config({ path: ".env.local" });

const client = new DynamoDBClient({
  region: process.env.REGION || "us-east-1",
  ...(process.env.DYNAMODB_LOCAL_ENDPOINT ? {
    endpoint: process.env.DYNAMODB_LOCAL_ENDPOINT,
    credentials: { accessKeyId: process.env.ACCESS_KEY_ID || "fake", secretAccessKey: process.env.SECRET_ACCESS_KEY || "fake" }
  } : {})
});

const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || "SimpleLedger";

async function run() {
  const orgId = "0dac4053-7d2f-4508-8ef4-0a1c94ed19c3";

  console.log(`Searching for accounts in org ${orgId}...`);
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :skPrefix)",
      ExpressionAttributeValues: {
        ":pk": `ORG#${orgId}#ACCOUNT`,
        ":skPrefix": "ACC#",
      },
    })
  );

  const accounts = result.Items || [];
  console.log(`Found ${accounts.length} accounts.`);
  accounts.forEach(acc => {
    console.log(`- ${acc.name} (ID: ${acc.id}) | Status: ${acc.status}`);
  });
}

run();
