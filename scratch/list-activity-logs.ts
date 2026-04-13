const dotenv = require("dotenv");
const path = require("path");
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const { dynamoDBClient } = require("../src/lib/dynamodb");
const { DynamoDBDocumentClient, QueryCommand } = require("@aws-sdk/lib-dynamodb");

const docClient = DynamoDBDocumentClient.from(dynamoDBClient);
const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || "SimpleLedger";

const orgId = "a607d6bc-e555-4640-bd08-75c64c3f21c7";

async function listLogs() {
  const res = await docClient.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: "PK = :pk",
    ExpressionAttributeValues: {
      ":pk": `ORG#${orgId}#ACTIVITY`
    },
    Limit: 5,
    ScanIndexForward: false
  }));

  console.log("Latest Activity Logs:");
  console.log(JSON.stringify(res.Items, null, 2));
}

listLogs().catch(console.error);
