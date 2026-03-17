import { dynamoDBClient } from "@/lib/dynamodb";
import { CreateTableCommand, DeleteTableCommand } from "@aws-sdk/client-dynamodb";

const TABLE_NAME = "SimpleLedger";

async function provisionDB() {
  try {
    // Attempt to delete it first if it exists (for local dev resets)
    await dynamoDBClient.send(new DeleteTableCommand({ TableName: TABLE_NAME }));
    console.log("Deleted existing table");
  } catch (e: any) {
    if (e.name !== "ResourceNotFoundException") {
      console.error("Error deleting table:", e);
    }
  }

  try {
    const data = await dynamoDBClient.send(
      new CreateTableCommand({
        TableName: TABLE_NAME,
        KeySchema: [
          { AttributeName: "PK", KeyType: "HASH" }, // Partition key
          { AttributeName: "SK", KeyType: "RANGE" }, // Sort key
        ],
        AttributeDefinitions: [
          { AttributeName: "PK", AttributeType: "S" },
          { AttributeName: "SK", AttributeType: "S" },
          { AttributeName: "GSI1PK", AttributeType: "S" },
          { AttributeName: "GSI1SK", AttributeType: "S" },
        ],
        GlobalSecondaryIndexes: [
          {
            IndexName: "GSI1",
            KeySchema: [
              { AttributeName: "GSI1PK", KeyType: "HASH" },
              { AttributeName: "GSI1SK", KeyType: "RANGE" },
            ],
            Projection: {
              ProjectionType: "ALL",
            },
            ProvisionedThroughput: {
              ReadCapacityUnits: 5,
              WriteCapacityUnits: 5,
            },
          },
        ],
        ProvisionedThroughput: {
          ReadCapacityUnits: 5,
          WriteCapacityUnits: 5,
        },
      })
    );
    console.log("Table created:", data.TableDescription?.TableName);
  } catch (err) {
    console.error("Error creating table:", err);
  }
}

provisionDB();
