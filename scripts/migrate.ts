import "./load-env";
import { dynamoDBClient } from "@/lib/dynamodb";
import { CreateTableCommand, DescribeTableCommand } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";


const docClient = DynamoDBDocumentClient.from(dynamoDBClient, {
  marshallOptions: { removeUndefinedValues: true },
});

const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || "SimpleLedger";

// --- Migration Logic ---

type MigrationFn = (db: DynamoDBDocumentClient) => Promise<void>;

interface Migration {
  id: number;
  name: string;
  up: MigrationFn;
}

const migrations: Migration[] = [
  {
    id: 1,
    name: "Initialize migrations tracking",
    up: async () => {
      console.log("Migration system initialized.");
    }
  },
  {
    id: 2,
    name: "Migrate user roles and owner flags",
    up: async (db: any) => {
      const { ScanCommand, PutCommand, GetCommand } = require("@aws-sdk/lib-dynamodb");

      console.log("Scanning for OrgUser items...");
      const result = await db.send(new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: "#type = :type",
        ExpressionAttributeNames: { "#type": "Type" },
        ExpressionAttributeValues: { ":type": "OrgUser" }
      }));

      const items = result.Items || [];
      console.log(`Found ${items.length} OrgUser items to check.`);

      for (const item of items) {
        // Fetch organization metadata to check owner
        const orgRes = await db.send(new GetCommand({
          TableName: TABLE_NAME,
          Key: { PK: `ORG#${item.orgId}`, SK: "METADATA" }
        }));
        const org = orgRes.Item;

        let needsUpdate = false;

        // Ensure role exists
        if (!item.role) {
          item.role = "member";
          needsUpdate = true;
        }

        // Ensure isOwner and Admin role for org owners
        if (org && org.ownerId === item.userId) {
          if (!item.isOwner) {
            item.isOwner = true;
            needsUpdate = true;
          }
          if (item.role !== "admin") {
            item.role = "admin";
            needsUpdate = true;
          }
        }

        if (needsUpdate) {
          await db.send(new PutCommand({
            TableName: TABLE_NAME,
            Item: item
          }));
          console.log(`- Updated user ${item.userId} in org ${item.orgId} (Role: ${item.role}, Owner: ${!!item.isOwner})`);
        }
      }
    }
  },
  {
    id: 3,
    name: "Normalize journal dates to YYYY-MM-DD",
    up: async (db: any) => {
      const { ScanCommand, PutCommand, DeleteCommand } = require("@aws-sdk/lib-dynamodb");

      console.log("Scanning for JournalEntry and JournalLine items...");
      const result = await db.send(new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: "#type IN (:t1, :t2)",
        ExpressionAttributeNames: { "#type": "Type" },
        ExpressionAttributeValues: { ":t1": "JournalEntry", ":t2": "JournalLine" }
      }));

      const items = result.Items || [];
      console.log(`Found ${items.length} journal items to check.`);

      for (const item of items) {
        if (!item.date || item.date.length <= 10) continue;

        const oldDate = item.date;
        const newDate = oldDate.slice(0, 10);
        const oldSk = item.SK;
        let newSk = oldSk;

        if (item.Type === "JournalEntry") {
          newSk = `JNL#${newDate}#${item.id}`;
        } else if (item.Type === "JournalLine") {
          // SK for LINE is LINE#journalId#accountId, which DOES NOT contain the date.
          // However, GSI1SK for LINE contains the date.
          if (item.GSI1SK) {
            item.GSI1SK = `JNL#${newDate}#${item.journalId}`;
          }
        }

        item.date = newDate;

        // For JournalEntry, the SK changed, so we must Delete old and Put new.
        if (item.Type === "JournalEntry" && newSk !== oldSk) {
          await db.send(new DeleteCommand({
            TableName: TABLE_NAME,
            Key: { PK: item.PK, SK: oldSk }
          }));
          item.SK = newSk;
        }

        await db.send(new PutCommand({
          TableName: TABLE_NAME,
          Item: item
        }));
        console.log(`- Normalized ${item.Type} ${item.id || item.journalId} from ${oldDate} to ${newDate}`);
      }
    }
  }
];

async function ensureTableExists() {
  try {
    await dynamoDBClient.send(new DescribeTableCommand({ TableName: TABLE_NAME }));
    console.log(`Table "${TABLE_NAME}" already exists.`);
  } catch (e: any) {
    if (e.name === "ResourceNotFoundException") {
      console.log(`Table "${TABLE_NAME}" does not exist. Creating...`);
      await dynamoDBClient.send(
        new CreateTableCommand({
          TableName: TABLE_NAME,
          KeySchema: [
            { AttributeName: "PK", KeyType: "HASH" },
            { AttributeName: "SK", KeyType: "RANGE" },
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
              Projection: { ProjectionType: "ALL" },
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
      console.log("Table created.");
    } else {
      throw e;
    }
  }
}

async function getLastMigrationId(): Promise<number> {
  const res = await docClient.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: "METADATA#MIGRATIONS",
        SK: "CURRENT",
      },
    })
  );
  return res.Item?.lastId || 0;
}

async function updateLastMigrationId(id: number) {
  await docClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: "METADATA#MIGRATIONS",
        SK: "CURRENT",
        lastId: id,
        updatedAt: new Date().toISOString(),
      },
    })
  );
}

async function run() {
  try {
    await ensureTableExists();

    const lastId = await getLastMigrationId();
    console.log(`Current migration level: ${lastId}`);

    const pending = migrations.filter((m) => m.id > lastId).sort((a, b) => a.id - b.id);

    if (pending.length === 0) {
      console.log("No pending migrations.");
      return;
    }

    for (const migration of pending) {
      console.log(`Running migration ${migration.id}: ${migration.name}...`);
      await migration.up(docClient);
      await updateLastMigrationId(migration.id);
      console.log(`Migration ${migration.id} completed.`);
    }

    console.log("All migrations applied successfully!");
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  }
}

run();
