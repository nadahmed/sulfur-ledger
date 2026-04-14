import { prisma } from "../prisma";

export interface EmailSettings {
  provider: "system" | "brevo" | "smtp";
  apiKey?: string; // For Brevo
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPass?: string;
  senderEmail: string;
  senderName: string;
}

export interface StorageSettings {
  provider: "system" | "s3" | "cloudinary";
  customFolder?: string;
  s3?: {
    endpoint: string;
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucketName: string;
  };
  cloudinary?: {
    cloudName: string;
    apiKey: string;
    apiSecret: string;
  };
}

export interface AiSettings {
  provider: "system" | "google" | "openai" | "openrouter";
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  personality?: string;
}

export interface Organization {
  id: string; // orgId
  name: string;
  ownerId: string; // User who owns this org
  currencySymbol?: string; // e.g. ৳, $, €
  currencyPosition?: "prefix" | "suffix";
  currencyHasSpace?: boolean;
  thousandSeparator?: string;
  decimalSeparator?: string;
  grouping?: "standard" | "indian" | "none";
  decimalPlaces?: number;
  emailSettings?: EmailSettings;
  storageSettings?: StorageSettings;
  mcpApiKey?: string;
  mcpApiKeyExpiresAt?: string;
  aiSettings?: AiSettings;
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
  thousandSeparator?: string;
  decimalSeparator?: string;
  grouping?: "standard" | "indian" | "none";
  decimalPlaces?: number;
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

export interface ApiKey {
  orgId: string;
  name: string;
  key: string; // The full API key
  userId: string; // The user identity this key represents
  userName: string; // Plain text name for the identity
  role: "admin" | "member" | "viewer";
  createdAt: string;
  expiresAt?: string | null;
}

export async function createApiKey(apiKey: ApiKey) {
  await prisma.apiKey.create({
    data: {
      orgId: apiKey.orgId,
      name: apiKey.name,
      key: apiKey.key,
      userId: apiKey.userId,
      userName: apiKey.userName,
      role: apiKey.role,
      expiresAt: apiKey.expiresAt ? new Date(apiKey.expiresAt) : null,
      createdAt: new Date(apiKey.createdAt),
    },
  });
  return apiKey;
}

export async function getApiKeys(orgId: string): Promise<ApiKey[]> {
  const keys = await prisma.apiKey.findMany({
    where: { orgId },
    orderBy: { createdAt: "desc" },
  });

  return keys.map((k) => ({
    orgId: k.orgId,
    name: k.name,
    key: k.key,
    userId: k.userId,
    userName: k.userName,
    role: k.role as any,
    createdAt: k.createdAt.toISOString(),
    expiresAt: k.expiresAt?.toISOString() || null,
  }));
}

export async function getApiKey(orgId: string, keyValue: string): Promise<ApiKey | null> {
  const k = await prisma.apiKey.findUnique({
    where: { key: keyValue },
  });

  if (!k || k.orgId !== orgId) return null;

  return {
    orgId: k.orgId,
    name: k.name,
    key: k.key,
    userId: k.userId,
    userName: k.userName,
    role: k.role as any,
    createdAt: k.createdAt.toISOString(),
    expiresAt: k.expiresAt?.toISOString() || null,
  };
}

export async function deleteApiKey(orgId: string, keyValue: string) {
  await prisma.apiKey.deleteMany({
    where: { orgId, key: keyValue },
  });
}

export async function createInvitation(invitation: Invitation) {
  await prisma.invitation.create({
    data: {
      orgId: invitation.orgId,
      email: invitation.email,
      role: invitation.role,
      orgName: invitation.orgName,
      invitedBy: invitation.invitedBy,
      createdAt: new Date(invitation.createdAt),
    },
  });
  return invitation;
}

export async function getOrganizationInvitations(orgId: string): Promise<Invitation[]> {
  const invites = await prisma.invitation.findMany({
    where: { orgId },
  });

  return invites.map((i) => ({
    orgId: i.orgId,
    email: i.email,
    role: i.role as any,
    orgName: i.orgName,
    invitedBy: i.invitedBy,
    createdAt: i.createdAt.toISOString(),
  }));
}

export async function getInvitation(orgId: string, email: string): Promise<Invitation | null> {
  const i = await prisma.invitation.findUnique({
    where: {
      orgId_email: { orgId, email },
    },
  });

  if (!i) return null;

  return {
    orgId: i.orgId,
    email: i.email,
    role: i.role as any,
    orgName: i.orgName,
    invitedBy: i.invitedBy,
    createdAt: i.createdAt.toISOString(),
  };
}

export async function deleteInvitation(orgId: string, email: string) {
  await prisma.invitation.delete({
    where: {
      orgId_email: { orgId, email },
    },
  });
}

export async function createOrganization(org: Organization) {
  await prisma.organization.create({
    data: {
      id: org.id,
      name: org.name,
      ownerId: org.ownerId,
      currencySymbol: org.currencySymbol,
      currencyPosition: org.currencyPosition,
      currencyHasSpace: org.currencyHasSpace,
      thousandSeparator: org.thousandSeparator,
      decimalSeparator: org.decimalSeparator,
      grouping: org.grouping,
      decimalPlaces: org.decimalPlaces,
      emailSettings: org.emailSettings as any,
      storageSettings: org.storageSettings as any,
      mcpApiKey: org.mcpApiKey,
      mcpApiKeyExpiresAt: org.mcpApiKeyExpiresAt ? new Date(org.mcpApiKeyExpiresAt) : null,
      aiSettings: org.aiSettings as any,
      createdAt: org.createdAt ? new Date(org.createdAt) : new Date(),
    },
  });
  return org;
}

export async function getOrganization(orgId: string): Promise<Organization | null> {
  const o = await prisma.organization.findUnique({
    where: { id: orgId },
  });

  if (!o) return null;

  return {
    id: o.id,
    name: o.name,
    ownerId: o.ownerId,
    currencySymbol: o.currencySymbol || undefined,
    currencyPosition: o.currencyPosition as any,
    currencyHasSpace: o.currencyHasSpace || undefined,
    thousandSeparator: o.thousandSeparator || undefined,
    decimalSeparator: o.decimalSeparator || undefined,
    grouping: o.grouping as any,
    decimalPlaces: o.decimalPlaces || undefined,
    emailSettings: o.emailSettings as any,
    storageSettings: o.storageSettings as any,
    mcpApiKey: o.mcpApiKey || undefined,
    mcpApiKeyExpiresAt: o.mcpApiKeyExpiresAt?.toISOString() || undefined,
    aiSettings: o.aiSettings as any,
    createdAt: o.createdAt.toISOString(),
  };
}

export async function addUserToOrg(user: OrgUser) {
  // Ensure the User record exists first
  await prisma.user.upsert({
    where: { id: user.userId },
    update: {
      email: user.userEmail || "",
      name: user.userName || "",
      picture: user.userPicture || "",
    },
    create: {
      id: user.userId,
      email: user.userEmail || "",
      name: user.userName || "",
      picture: user.userPicture || "",
      createdAt: new Date(),
    },
  });

  await prisma.orgUser.upsert({
    where: {
      orgId_userId: {
        orgId: user.orgId,
        userId: user.userId,
      },
    },
    update: {
      role: user.role,
      isOwner: user.isOwner ?? false,
    },
    create: {
      orgId: user.orgId,
      userId: user.userId,
      role: user.role,
      isOwner: user.isOwner ?? false,
      createdAt: new Date(user.createdAt),
    },
  });
  return user;
}

export async function getUserOrganizations(userId: string): Promise<OrgUser[]> {
  const orgUsers = await prisma.orgUser.findMany({
    where: { userId },
    include: {
      organization: true,
      user: true,
    },
  });

  return orgUsers.map((ou) => ({
    orgId: ou.orgId,
    orgName: ou.organization.name,
    userId: ou.userId,
    userName: ou.user.name || undefined,
    userEmail: ou.user.email || undefined,
    userPicture: ou.user.picture || undefined,
    role: ou.role as any,
    isOwner: ou.isOwner || ou.organization.ownerId === userId,
    currencySymbol: ou.organization.currencySymbol || "৳",
    currencyPosition: (ou.organization.currencyPosition as any) || "prefix",
    currencyHasSpace: ou.organization.currencyHasSpace || false,
    thousandSeparator: ou.organization.thousandSeparator || ",",
    decimalSeparator: ou.organization.decimalSeparator || ".",
    grouping: (ou.organization.grouping as any) || "standard",
    decimalPlaces: ou.organization.decimalPlaces ?? 2,
    createdAt: ou.organization.createdAt.toISOString(),
  }));
}

export async function updateOrganization(orgId: string, updates: { 
  name: string, 
  currencySymbol?: string, 
  currencyPosition?: "prefix" | "suffix",
  currencyHasSpace?: boolean,
  thousandSeparator?: string,
  decimalSeparator?: string,
  grouping?: "standard" | "indian" | "none",
  decimalPlaces?: number
}) {
  await prisma.organization.update({
    where: { id: orgId },
    data: updates,
  });
}

export async function updateOrganizationStorageSettings(orgId: string, settings: StorageSettings) {
  await prisma.organization.update({
    where: { id: orgId },
    data: {
      storageSettings: settings as any,
    },
  });
}

export async function updateOrganizationEmailSettings(orgId: string, settings: EmailSettings) {
  await prisma.organization.update({
    where: { id: orgId },
    data: {
      emailSettings: settings as any,
    },
  });
}

export async function updateOrganizationMcpSettings(orgId: string, settings: { mcpApiKey?: string | null, mcpApiKeyExpiresAt?: string | null }) {
  await prisma.organization.update({
    where: { id: orgId },
    data: {
      mcpApiKey: settings.mcpApiKey,
      mcpApiKeyExpiresAt: settings.mcpApiKeyExpiresAt ? new Date(settings.mcpApiKeyExpiresAt) : null,
    },
  });
}

export async function updateOrganizationAiSettings(orgId: string, settings: AiSettings) {
  await prisma.organization.update({
    where: { id: orgId },
    data: {
      aiSettings: settings as any,
    },
  });
}

export async function getOrganizationUsers(orgId: string): Promise<OrgUser[]> {
  const users = await prisma.orgUser.findMany({
    where: { orgId },
    include: {
      user: true,
      organization: true,
    },
  });

  return users.map((ou) => ({
    orgId: ou.orgId,
    orgName: ou.organization.name,
    userId: ou.userId,
    userName: ou.user.name || undefined,
    userEmail: ou.user.email || undefined,
    userPicture: ou.user.picture || undefined,
    role: ou.role as any,
    isOwner: ou.isOwner || ou.organization.ownerId === ou.userId,
    createdAt: ou.createdAt.toISOString(),
  }));
}

export async function removeUserFromOrg(orgId: string, userId: string) {
  await prisma.orgUser.delete({
    where: {
      orgId_userId: { orgId, userId },
    },
  });
}

export async function updateUserRole(orgId: string, userId: string, role: OrgUser["role"]) {
  await prisma.orgUser.update({
    where: {
      orgId_userId: { orgId, userId },
    },
    data: { role },
  });
}

export async function deleteFullOrganization(orgId: string) {
  // Leverage Cascade Delete in our schema
  await prisma.organization.delete({
    where: { id: orgId },
  });
}
