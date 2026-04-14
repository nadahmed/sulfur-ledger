import { prisma } from "../prisma";
import { uuidv7 } from "uuidv7";
import { createAuditLog } from "./audit";

export interface Tag {
  orgId: string;
  id: string; // UUID
  name: string;
  color: string; // Hex or CSS color
  description?: string;
  createdAt: string;
}

export async function createTag(
  tag: Omit<Tag, "id" | "createdAt">,
  userId?: string,
  userName?: string,
  metadata?: { ipAddress?: string; userAgent?: string }
): Promise<Tag> {
  const newTag = await prisma.tag.create({
    data: {
      id: uuidv7(),
      orgId: tag.orgId,
      name: tag.name,
      color: tag.color,
      description: tag.description,
    },
  });

  const result: Tag = {
    ...newTag,
    description: newTag.description || undefined,
    color: newTag.color || "",
    createdAt: newTag.createdAt.toISOString(),
  };

  if (userId) {
    await createAuditLog({
      orgId: result.orgId,
      id: uuidv7(),
      userId,
      userName,
      action: "create",
      entityType: "Tag",
      entityId: result.id,
      details: `Created tag: ${result.name}`,
      data: result,
      timestamp: new Date().toISOString(),
      ...metadata,
    });
  }

  return result;
}

export async function getTags(orgId: string): Promise<Tag[]> {
  const tags = await prisma.tag.findMany({
    where: { orgId },
    orderBy: { name: "asc" },
  });

  return tags.map(t => ({
    ...t,
    description: t.description || undefined,
    color: t.color || "",
    createdAt: t.createdAt.toISOString(),
  }));
}

export async function updateTag(orgId: string, tagId: string, updates: Partial<Omit<Tag, "id" | "orgId" | "createdAt">>) {
  const updatedTag = await prisma.tag.update({
    where: { id: tagId },
    data: {
      name: updates.name,
      color: updates.color,
      description: updates.description,
    },
  });

  return {
    ...updatedTag,
    description: updatedTag.description || undefined,
    color: updatedTag.color || "",
    createdAt: updatedTag.createdAt.toISOString(),
  };
}

export async function getTag(orgId: string, tagId: string): Promise<Tag | null> {
  const t = await prisma.tag.findUnique({
    where: { id: tagId },
  });

  if (!t || t.orgId !== orgId) return null;

  return {
    ...t,
    description: t.description || undefined,
    color: t.color || "",
    createdAt: t.createdAt.toISOString(),
  };
}

export async function deleteTag(
  orgId: string, 
  tagId: string,
  userId?: string,
  userName?: string,
  metadata?: { ipAddress?: string; userAgent?: string }
) {
  const oldTag = await getTag(orgId, tagId);

  await prisma.tag.delete({
    where: { id: tagId },
  });

  if (userId) {
    await createAuditLog({
      orgId,
      id: uuidv7(),
      userId,
      userName,
      action: "delete",
      entityType: "Tag",
      entityId: tagId,
      details: `Deleted tag: ${oldTag?.name || tagId}`,
      timestamp: new Date().toISOString(),
      ...metadata,
    });
  }
}

export async function findTagByName(orgId: string, name: string): Promise<Tag | null> {
  const t = await prisma.tag.findUnique({
    where: {
      orgId_name: { orgId, name },
    },
  });

  if (!t) return null;

  return {
    ...t,
    description: t.description || undefined,
    color: t.color || "",
    createdAt: t.createdAt.toISOString(),
  };
}
