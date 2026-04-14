import { prisma } from "../prisma";
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

export async function createAccount(
  account: Account, 
  userId?: string, 
  userName?: string,
  metadata?: { ipAddress?: string; userAgent?: string }
) {
  await prisma.account.create({
    data: {
      id: account.id,
      orgId: account.orgId,
      name: account.name,
      category: account.category,
      status: account.status || "active",
      createdAt: account.createdAt ? new Date(account.createdAt) : new Date(),
    },
  });

  if (userId) {
    await createAuditLog({
      orgId: account.orgId,
      id: uuidv7(),
      userId,
      userName,
      action: "create",
      entityType: "Account",
      entityId: account.id,
      details: `Created account: ${account.name}`,
      data: account,
      timestamp: new Date().toISOString(),
      ...metadata,
    });
  }

  return account;
}

export async function getAccounts(orgId: string): Promise<Account[]> {
  const accounts = await prisma.account.findMany({
    where: { orgId },
    orderBy: { name: "asc" },
  });

  return accounts.map((a) => ({
    orgId: a.orgId,
    id: a.id,
    name: a.name,
    category: a.category as AccountCategory,
    status: a.status as any,
    createdAt: a.createdAt.toISOString(),
  }));
}

export async function getAccount(orgId: string, accountId: string): Promise<Account | null> {
  const a = await prisma.account.findUnique({
    where: { id: accountId },
  });

  if (!a || a.orgId !== orgId) return null;

  return {
    orgId: a.orgId,
    id: a.id,
    name: a.name,
    category: a.category as AccountCategory,
    status: a.status as any,
    createdAt: a.createdAt.toISOString(),
  };
}

export async function deleteAccount(
  orgId: string, 
  accountId: string, 
  userId?: string, 
  userName?: string,
  metadata?: { ipAddress?: string; userAgent?: string }
) {
  const oldAccount = await prisma.account.findUnique({ where: { id: accountId } });

  await prisma.account.delete({
    where: { id: accountId },
  });

  if (userId && oldAccount) {
    await createAuditLog({
      orgId,
      id: uuidv7(),
      userId,
      userName,
      action: "delete",
      entityType: "Account",
      entityId: accountId,
      details: `Deleted account: ${oldAccount.name || accountId}`,
      data: oldAccount,
      timestamp: new Date().toISOString(),
      ...metadata,
    });
  }
}


export async function archiveAccount(
  orgId: string, 
  accountId: string, 
  userId?: string, 
  userName?: string,
  metadata?: { ipAddress?: string; userAgent?: string }
) {
  const oldAccount = await prisma.account.update({
    where: { id: accountId },
    data: { status: "archived" },
  });

  if (userId && oldAccount?.status !== "archived") {
    await createAuditLog({
      orgId,
      id: uuidv7(),
      userId,
      userName,
      action: "update",
      entityType: "Account",
      entityId: accountId,
      details: `Archived account: ${oldAccount?.name || accountId}`,
      changes: {
        status: { old: oldAccount?.status || "active", new: "archived" },
      },
      timestamp: new Date().toISOString(),
      ...metadata,
    });
  }
}

export async function unarchiveAccount(
  orgId: string, 
  accountId: string, 
  userId?: string, 
  userName?: string,
  metadata?: { ipAddress?: string; userAgent?: string }
) {
  const oldAccount = await prisma.account.update({
    where: { id: accountId },
    data: { status: "active" },
  });

  if (userId && oldAccount?.status !== "active") {
    await createAuditLog({
      orgId,
      id: uuidv7(),
      userId,
      userName,
      action: "update",
      entityType: "Account",
      entityId: accountId,
      details: `Unarchived account: ${oldAccount?.name || accountId}`,
      changes: {
        status: { old: oldAccount?.status || "archived", new: "active" },
      },
      timestamp: new Date().toISOString(),
      ...metadata,
    });
  }
}

export async function updateAccountName(
  orgId: string, 
  accountId: string, 
  name: string, 
  userId?: string, 
  userName?: string,
  metadata?: { ipAddress?: string; userAgent?: string }
) {
  const oldAccount = await prisma.account.update({
    where: { id: accountId },
    data: { name },
  });

  if (userId && oldAccount?.name !== name) {
    await createAuditLog({
      orgId,
      id: uuidv7(),
      userId,
      userName,
      action: "update",
      entityType: "Account",
      entityId: accountId,
      details: `Renamed account: ${oldAccount?.name} -> ${name}`,
      changes: {
        name: { old: oldAccount?.name, new: name },
      },
      timestamp: new Date().toISOString(),
      ...metadata,
    });
  }
}
