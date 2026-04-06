import { GetCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { db, TABLE_NAME } from "../dynamodb";

export interface EmailSettings {
  provider: "brevo" | "smtp" | "none";
  apiKey?: string; // For Brevo
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPass?: string;
  senderEmail: string;
  senderName: string;
}

export interface Organization {
  id: string; // orgId
  name: string;
  ownerId: string; // User who owns this org
  currencySymbol?: string; // e.g. ৳, $, €
  currencyPosition?: "prefix" | "suffix";
  currencyHasSpace?: boolean;
  emailSettings?: EmailSettings;
  mcpApiKey?: string;
  mcpApiKeyExpiresAt?: string;
  createdAt: string;
}

export interface OrgUser {
  orgId: string;
  orgName: string; // Denormalized for easy lookup
  userId: string; // From Auth0 sub
  userName?: string;
  userEmail?: string;
  userPicture?: string;
  role: "admin" | "member" | "viewer";
  isOwner?: boolean; // Owner bypass flag
  currencySymbol?: string;
  currencyPosition?: "prefix" | "suffix";
  currencyHasSpace?: boolean;
  createdAt: string;
}

export interface Invitation {
  orgId: string;
  email: string;
  role: "admin" | "member" | "viewer";
  orgName: string;
  invitedBy: string; // userId
  createdAt: string;
}

export async function createInvitation(invitation: Invitation) {
  await db.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `ORG#${invitation.orgId}`,
        SK: `INVITE#${invitation.email}`,
        Type: "Invitation",
        ...invitation,
      },
    })
  );
  return invitation;
}

export async function getOrganizationInvitations(orgId: string): Promise<Invitation[]> {
  const result = await db.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :skPrefix)",
      ExpressionAttributeValues: {
        ":pk": `ORG#${orgId}`,
        ":skPrefix": "INVITE#",
      },
    })
  );
  return (result.Items as Invitation[]) || [];
}

export async function getInvitation(orgId: string, email: string): Promise<Invitation | null> {
  const result = await db.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `ORG#${orgId}`,
        SK: `INVITE#${email}`,
      },
    })
  );
  return (result.Item as Invitation) || null;
}

export async function deleteInvitation(orgId: string, email: string) {
  const { DeleteCommand } = require("@aws-sdk/lib-dynamodb");
  await db.send(
    new DeleteCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `ORG#${orgId}`,
        SK: `INVITE#${email}`,
      },
    })
  );
}

export async function createOrganization(org: Organization) {
  await db.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `ORG#${org.id}`,
        SK: `METADATA`,
        Type: "Organization",
        ...org,
      },
    })
  );
  return org;
}

export async function getOrganization(orgId: string): Promise<Organization | null> {
  const result = await db.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `ORG#${orgId}`,
        SK: `METADATA`,
      },
    })
  );
  return (result.Item as Organization) || null;
}

export async function addUserToOrg(user: OrgUser) {
  await db.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `ORG#${user.orgId}`,
        SK: `USER#${user.userId}`,
        Type: "OrgUser",
        // Enable reverse lookup (get all orgs for a user)
        GSI1PK: `USER#${user.userId}`,
        GSI1SK: `ORG#${user.orgId}`,
        ...user,
      },
    })
  );
  return user;
}

export async function getUserOrganizations(userId: string): Promise<OrgUser[]> {
  const result = await db.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: "GSI1",
      KeyConditionExpression: "GSI1PK = :pk AND begins_with(GSI1SK, :skPrefix)",
      ExpressionAttributeValues: {
        ":pk": `USER#${userId}`,
        ":skPrefix": "ORG#",
      },
    })
  );
  
  const orgUsers = (result.Items as OrgUser[]) || [];
  
  // Fetch all metadata records to merge branding, currency, and ownership
  const updatedOrgUsers = await Promise.all(orgUsers.map(async (ou) => {
    const orgMetadata = await getOrganization(ou.orgId);
    let updated = { ...ou };

    if (orgMetadata) {
      updated.orgName = orgMetadata.name || ou.orgName || ou.orgId;
      updated.currencySymbol = orgMetadata.currencySymbol || "৳";
      updated.currencyPosition = orgMetadata.currencyPosition || "prefix";
      updated.currencyHasSpace = orgMetadata.currencyHasSpace || false;
      if (orgMetadata.ownerId === userId) {
        updated.isOwner = true;
      }
    }

    return updated;
  }));

  return updatedOrgUsers;
}

export async function updateOrganization(orgId: string, updates: { 
  name: string, 
  currencySymbol?: string, 
  currencyPosition?: "prefix" | "suffix",
  currencyHasSpace?: boolean
}) {
  const { UpdateCommand } = require("@aws-sdk/lib-dynamodb");
  
  let updateExp = "SET #name = :name";
  const attrNames: any = { "#name": "name" };
  const attrValues: any = { ":name": updates.name };

  if (updates.currencySymbol !== undefined) {
    updateExp += ", #symbol = :symbol";
    attrNames["#symbol"] = "currencySymbol";
    attrValues[":symbol"] = updates.currencySymbol;
  }
  if (updates.currencyPosition !== undefined) {
    updateExp += ", #pos = :pos";
    attrNames["#pos"] = "currencyPosition";
    attrValues[":pos"] = updates.currencyPosition;
  }
  if (updates.currencyHasSpace !== undefined) {
    updateExp += ", #space = :space";
    attrNames["#space"] = "currencyHasSpace";
    attrValues[":space"] = updates.currencyHasSpace;
  }

  // 1. Update Metadata
  await db.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `ORG#${orgId}`,
        SK: `METADATA`,
      },
      UpdateExpression: updateExp,
      ExpressionAttributeNames: attrNames,
      ExpressionAttributeValues: attrValues,
    })
  );

  // 2. Update denormalized orgName in OrgUser records
  // Fetch all users in this org
  const result = await db.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :skPrefix)",
      ExpressionAttributeValues: {
        ":pk": `ORG#${orgId}`,
        ":skPrefix": "USER#",
      },
    })
  );

  const orgUsers = result.Items || [];
  for (const ou of orgUsers) {
    await db.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: ou.PK,
          SK: ou.SK,
        },
        UpdateExpression: "SET orgName = :name",
        ExpressionAttributeValues: { ":name": updates.name },
      })
    );
  }
}

export async function updateOrganizationEmailSettings(orgId: string, settings: EmailSettings) {
  const { UpdateCommand } = require("@aws-sdk/lib-dynamodb");
  
  await db.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `ORG#${orgId}`,
        SK: `METADATA`,
      },
      UpdateExpression: "SET emailSettings = :settings",
      ExpressionAttributeValues: { ":settings": settings },
    })
  );
}

export async function updateOrganizationMcpSettings(orgId: string, settings: { mcpApiKey?: string | null, mcpApiKeyExpiresAt?: string | null }) {
  const { UpdateCommand } = require("@aws-sdk/lib-dynamodb");
  
  await db.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `ORG#${orgId}`,
        SK: `METADATA`,
      },
      UpdateExpression: "SET mcpApiKey = :key, mcpApiKeyExpiresAt = :expires",
      ExpressionAttributeValues: { 
        ":key": settings.mcpApiKey || null, 
        ":expires": settings.mcpApiKeyExpiresAt || null 
      },
    })
  );
}

export async function getOrganizationUsers(orgId: string): Promise<OrgUser[]> {
  const result = await db.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :skPrefix)",
      ExpressionAttributeValues: {
        ":pk": `ORG#${orgId}`,
        ":skPrefix": "USER#",
      },
    })
  );
  
  const orgUsers = (result.Items as OrgUser[]) || [];
  const org = await getOrganization(orgId);
  
  return orgUsers.map(ou => ({
    ...ou,
    isOwner: ou.isOwner || (org?.ownerId === ou.userId)
  }));
}

export async function removeUserFromOrg(orgId: string, userId: string) {
  const { DeleteCommand } = require("@aws-sdk/lib-dynamodb");
  await db.send(
    new DeleteCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `ORG#${orgId}`,
        SK: `USER#${userId}`,
      },
    })
  );
}

export async function updateUserRole(orgId: string, userId: string, role: OrgUser["role"]) {
  const { UpdateCommand } = require("@aws-sdk/lib-dynamodb");
  await db.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `ORG#${orgId}`,
        SK: `USER#${userId}`,
      },
      UpdateExpression: "SET #role = :role",
      ExpressionAttributeNames: { "#role": "role" },
      ExpressionAttributeValues: { ":role": role },
    })
  );
}

export async function deleteFullOrganization(orgId: string) {
  const { clearOrganizationData } = require("./admin");
  
  // 1. Clear accounts and journals
  await clearOrganizationData(orgId);

  // 2. Clear org metadata and user links
  let lastEvaluatedKey: Record<string, any> | undefined = undefined;
  const { BatchWriteCommand } = require("@aws-sdk/lib-dynamodb");

  do {
    const queryResult: any = await db.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: "PK = :pk",
        ExpressionAttributeValues: {
          ":pk": `ORG#${orgId}`,
        },
        ExclusiveStartKey: lastEvaluatedKey,
      })
    );

    const items = queryResult.Items || [];
    if (items.length > 0) {
      for (let i = 0; i < items.length; i += 25) {
        const chunk = items.slice(i, i + 25);
        await db.send(
          new BatchWriteCommand({
            RequestItems: {
              [TABLE_NAME]: chunk.map((item: any) => ({
                DeleteRequest: {
                  Key: {
                    PK: item.PK,
                    SK: item.SK,
                  },
                },
              })),
            },
          })
        );
      }
    }
    lastEvaluatedKey = queryResult.LastEvaluatedKey;
  } while (lastEvaluatedKey);
}
