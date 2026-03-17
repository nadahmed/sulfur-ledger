import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
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
  const orgsRes = await docClient.send(new ScanCommand({
    TableName: TABLE_NAME,
    FilterExpression: "#type = :type AND #name = :name",
    ExpressionAttributeNames: { "#type": "Type", "#name": "name" },
    ExpressionAttributeValues: { ":type": "Organization", ":name": "Personal" }
  }));

  const orgs = orgsRes.Items || [];
  for (const org of orgs) {
    console.log(`ORG_ID: ${org.id}`);
    console.log(`METADATA_OWNER: ${org.ownerId}`);
    
    const usersRes = await docClient.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
      ExpressionAttributeValues: { ":pk": `ORG#${org.id}`, ":sk": "USER#" }
    }));

    const users = usersRes.Items || [];
    for (const u of users) {
      console.log(`USER: ${u.userId} | EMAIL: ${u.userEmail} | ROLE: ${u.role} | IS_OWNER: ${u.isOwner}`);
    }
  }
}

run();
