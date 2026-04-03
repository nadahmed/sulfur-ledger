import { QueryCommand, DeleteCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { uuidv7 } from "uuidv7";
import { db, TABLE_NAME } from "../dynamodb";

export interface Tag {
  orgId: string;
  id: string; // UUID
  name: string;
  color: string; // Hex or CSS color
  description?: string;
  createdAt: string;
}

export async function createTag(tag: Omit<Tag, "id" | "createdAt">): Promise<Tag> {
  const newTag: Tag = {
    ...tag,
    id: uuidv7(),
    createdAt: new Date().toISOString(),
  };

  await db.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `ORG#${newTag.orgId}#TAG`,
        SK: `TAG#${newTag.id}`,
        Type: "Tag",
        ...newTag,
      },
    })
  );

  return newTag;
}

export async function getTags(orgId: string): Promise<Tag[]> {
  const result = await db.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :skPrefix)",
      ExpressionAttributeValues: {
        ":pk": `ORG#${orgId}#TAG`,
        ":skPrefix": "TAG#",
      },
    })
  );

  return (result.Items as unknown as Tag[]) || [];
}

export async function updateTag(orgId: string, tagId: string, updates: Partial<Omit<Tag, "id" | "orgId" | "createdAt">>) {
  // To keep it simple in DynamoDB, we fetch and put (or use update expression)
  // For a "Simple Ledger", a fetch-then-put is often fine if contention is low.
  const existing = await getTag(orgId, tagId);
  if (!existing) throw new Error("Tag not found");

  const updatedTag: Tag = {
    ...existing,
    ...updates,
  };

  await db.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `ORG#${orgId}#TAG`,
        SK: `TAG#${tagId}`,
        Type: "Tag",
        ...updatedTag,
      },
    })
  );

  return updatedTag;
}

export async function getTag(orgId: string, tagId: string): Promise<Tag | null> {
  const result = await db.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "PK = :pk AND SK = :sk",
      ExpressionAttributeValues: {
        ":pk": `ORG#${orgId}#TAG`,
        ":sk": `TAG#${tagId}`,
      },
    })
  );

  return (result.Items?.[0] as unknown as Tag) || null;
}

export async function deleteTag(orgId: string, tagId: string) {
  await db.send(
    new DeleteCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `ORG#${orgId}#TAG`,
        SK: `TAG#${tagId}`,
      },
    })
  );
}

export async function findTagByName(orgId: string, name: string): Promise<Tag | null> {
  const tags = await getTags(orgId);
  return tags.find(t => t.name.toLowerCase() === name.toLowerCase()) || null;
}
