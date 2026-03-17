import { PutCommand, QueryCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { db, TABLE_NAME } from "../dynamodb";

export type AccountCategory = "asset" | "liability" | "equity" | "income" | "expense";

export interface Account {
  orgId: string;
  id: string; // e.g. "checking", "salary-expense"
  name: string;
  category: AccountCategory;
  status: "active" | "archived";
  createdAt: string;
}

export async function createAccount(account: Account) {
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

export async function deleteAccount(orgId: string, accountId: string) {
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
}

export async function archiveAccount(orgId: string, accountId: string) {
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
}

export async function unarchiveAccount(orgId: string, accountId: string) {
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
}
