import { prisma } from "../prisma";
import { OrgUser } from "./organizations";

export async function getOrgUser(orgId: string, userId: string): Promise<OrgUser | null> {
  const ou = await prisma.orgUser.findUnique({
    where: {
      orgId_userId: { orgId, userId },
    },
    include: {
      user: true,
      organization: true,
    },
  });

  if (!ou) return null;

  return {
    orgId: ou.orgId,
    orgName: ou.organization.name,
    userId: ou.userId,
    userName: ou.user.name || undefined,
    userEmail: ou.user.email || undefined,
    userPicture: ou.user.picture || undefined,
    role: ou.role as any,
    isOwner: ou.isOwner || ou.organization.ownerId === userId,
    createdAt: ou.createdAt.toISOString(),
  };
}
