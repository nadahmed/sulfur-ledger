import { dynamoDBClient } from "@/lib/dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { config } from "dotenv";
config({ path: ".env.local" });


const docClient = DynamoDBDocumentClient.from(dynamoDBClient, {
  marshallOptions: { removeUndefinedValues: true },
});

const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || "SimpleLedger";

async function run() {
  console.log("Searching for organization named 'Personal'...");

  const result = await docClient.send(new ScanCommand({
    TableName: TABLE_NAME,
    FilterExpression: "SK = :sk AND #name = :name",
    ExpressionAttributeNames: { "#name": "name" },
    ExpressionAttributeValues: { ":sk": "METADATA", ":name": "Personal" }
  }));

  const items = result.Items || [];
  console.log(`Found ${items.length} 'Personal' organizations.`);

  for (const item of items) {
    const orgId = item.PK.replace("ORG#", "");
    console.log(`--- ORG: ${orgId} ---`);
    console.log(`OwnerId: ${item.ownerId}`);

    // Find all users in this org
    const userResult = await docClient.send(new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: "PK = :pk AND begins_with(SK, :skPrefix)",
      ExpressionAttributeValues: { ":pk": `ORG#${orgId}`, ":skPrefix": "USER#" }
    }));

    console.log("Members:");
    userResult.Items?.forEach(u => {
      console.log(`- ${u.userEmail} (ID: ${u.userId}) | Role: ${u.role} | isOwner: ${u.isOwner}`);
    });
  }

  console.log("Done.");
}

run();
