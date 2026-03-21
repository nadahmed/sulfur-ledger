import { PutCommand, QueryCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { db, TABLE_NAME } from "../dynamodb";
import { createAuditLog } from "./audit";
import { uuidv7 } from "uuidv7";

export type AccountCategory = "asset" | "liability" | "equity" | "income" | "expense";

export interface Account {
  orgId: string;
  id: string; // e.g. "checking", "salary-expense"
  name: string;
  category: AccountCategory;
  status: "active" | "archived";
  createdAt: string;
}

export async function createAccount(account: Account, userId?: string, userName?: string) {
  await db.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `ORG#${account.orgId}#ACCOUNT`,
        SK: `ACC#${account.id}`,
        Type: "Account",
        ...account,
      },
      // Prevent overwriting an existing account
      ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)",
    })
  );

  if (userId) {
    await createAuditLog({
      orgId: account.orgId,
      id: uuidv7(),
      userId,
      userName,
      action: "create",
      entityType: "Account",
      entityId: account.id,
      details: JSON.stringify({ name: account.name, category: account.category }),
      timestamp: new Date().toISOString(),
    });
  }

  return account;
}

export async function getAccounts(orgId: string): Promise<Account[]> {
  const result = await db.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :skPrefix)",
      ExpressionAttributeValues: {
        ":pk": `ORG#${orgId}#ACCOUNT`,
        ":skPrefix": "ACC#",
      },
    })
  );
  return (result.Items as Account[]) || [];
}

export async function getAccount(orgId: string, accountId: string): Promise<Account | null> {
  const result = await db.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `ORG#${orgId}#ACCOUNT`,
        SK: `ACC#${accountId}`,
      },
    })
  );
  return (result.Item as Account) || null;
}

export async function deleteAccount(orgId: string, accountId: string, userId?: string, userName?: string) {
  const { DeleteCommand } = require("@aws-sdk/lib-dynamodb");
  await db.send(
    new DeleteCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `ORG#${orgId}#ACCOUNT`,
        SK: `ACC#${accountId}`,
      },
    })
  );

  if (userId) {
    await createAuditLog({
      orgId,
      id: uuidv7(),
      userId,
      userName,
      action: "delete",
      entityType: "Account",
      entityId: accountId,
      details: "Deleted account",
      timestamp: new Date().toISOString(),
    });
  }
}


export async function archiveAccount(orgId: string, accountId: string, userId?: string, userName?: string) {
  const { UpdateCommand } = require("@aws-sdk/lib-dynamodb");
  await db.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `ORG#${orgId}#ACCOUNT`,
        SK: `ACC#${accountId}`,
      },
      UpdateExpression: "SET #status = :archived",
      ExpressionAttributeNames: {
        "#status": "status",
      },
      ExpressionAttributeValues: {
        ":archived": "archived",
      },
    })
  );

  if (userId) {
    await createAuditLog({
      orgId,
      id: uuidv7(),
      userId,
      userName,
      action: "update",
      entityType: "Account",
      entityId: accountId,
      details: "Archived account",
      timestamp: new Date().toISOString(),
    });
  }
}

export async function unarchiveAccount(orgId: string, accountId: string, userId?: string, userName?: string) {
  const { UpdateCommand } = require("@aws-sdk/lib-dynamodb");
  await db.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `ORG#${orgId}#ACCOUNT`,
        SK: `ACC#${accountId}`,
      },
      UpdateExpression: "SET #status = :active",
      ExpressionAttributeNames: {
        "#status": "status",
      },
      ExpressionAttributeValues: {
        ":active": "active",
      },
    })
  );

  if (userId) {
    await createAuditLog({
      orgId,
      id: uuidv7(),
      userId,
      userName,
      action: "update",
      entityType: "Account",
      entityId: accountId,
      details: "Unarchived account",
      timestamp: new Date().toISOString(),
    });
  }
}

export async function updateAccountName(orgId: string, accountId: string, name: string, userId?: string, userName?: string) {
  const { UpdateCommand } = require("@aws-sdk/lib-dynamodb");
  await db.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `ORG#${orgId}#ACCOUNT`,
        SK: `ACC#${accountId}`,
      },
      UpdateExpression: "SET #name = :name",
      ExpressionAttributeNames: {
        "#name": "name",
      },
      ExpressionAttributeValues: {
        ":name": name,
      },
    })
  );

  if (userId) {
    await createAuditLog({
      orgId,
      id: uuidv7(),
      userId,
      userName,
      action: "update",
      entityType: "Account",
      entityId: accountId,
      details: JSON.stringify({ newName: name }),
      timestamp: new Date().toISOString(),
    });
  }
}

