import { DynamoDBDocumentClient, ScanCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { config } from "dotenv";
import { dynamoDBClient } from "@/lib/dynamodb";
config({ path: ".env.local" });


const docClient = DynamoDBDocumentClient.from(dynamoDBClient, {
  marshallOptions: { removeUndefinedValues: true },
});

const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || "SimpleLedger";

async function run() {
  console.log("Searching for oldschoolritual@gmail.com as Owner in 'Personal' org...");

  const result = await docClient.send(new ScanCommand({
    TableName: TABLE_NAME,
    FilterExpression: "#type = :type AND userEmail = :email AND isOwner = :isOwner",
    ExpressionAttributeNames: { "#type": "Type" },
    ExpressionAttributeValues: { ":type": "OrgUser", ":email": "oldschoolritual@gmail.com", ":isOwner": true }
  }));

  const items = result.Items || [];
  console.log(`Found ${items.length} records.`);

  for (const item of items) {
    if (item.orgName === "Personal") {
      console.log(`Fixing record in org ${item.orgId}...`);
      const updatedItem = {
        ...item,
        isOwner: false,
        role: "admin"
      };

      await docClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: updatedItem
      }));
      console.log("Fixed!");
    } else {
      console.log(`Skipping record in org ${item.orgId} (OrgName: ${item.orgName})`);
    }
  }

  console.log("Done.");
}

run();
