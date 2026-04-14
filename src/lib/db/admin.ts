import { prisma } from "../prisma";

export async function clearOrganizationData(orgId: string) {
  // We use $transaction to ensure all deletions happen or none do
  await prisma.$transaction([
    prisma.account.deleteMany({ where: { orgId } }),
    prisma.journalEntry.deleteMany({ where: { orgId } }),
    prisma.auditLog.deleteMany({ where: { orgId } }),
    prisma.mcpActivityLog.deleteMany({ where: { orgId } }),
    prisma.recurringEntry.deleteMany({ where: { orgId } }),
    prisma.apiKey.deleteMany({ where: { orgId } }),
    prisma.invitation.deleteMany({ where: { orgId } }),
    prisma.chatMessage.deleteMany({ where: { orgId } }),
    // Note: We keep OrgUser and the Organization itself
  ]);
}
