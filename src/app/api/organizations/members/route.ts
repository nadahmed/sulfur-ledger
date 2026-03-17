import { NextRequest, NextResponse } from "next/server";
import { checkPermission } from "@/lib/auth";
import { getOrganizationUsers, removeUserFromOrg, getOrganization, updateUserRole } from "@/lib/db/organizations";
import { getOrgUser } from "@/lib/db/users";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get("orgId");
  
  if (!orgId) return NextResponse.json({ error: "Org ID required" }, { status: 400 });

  const auth = await checkPermission("read:organization", req); 
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const users = await getOrganizationUsers(orgId);
    return NextResponse.json(users);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get("orgId");
  
  if (!orgId) return NextResponse.json({ error: "Org ID required" }, { status: 400 });

  const auth = await checkPermission("manage:organization", req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const { userId, role } = await req.json();
    if (!userId || !role) {
      return NextResponse.json({ error: "User ID and Role are required" }, { status: 400 });
    }

    // Protection: Cannot change owner's role
    const targetUser = await getOrgUser(orgId, userId);
    if (targetUser?.isOwner) {
      return NextResponse.json({ error: "Cannot change the role of the organization owner." }, { status: 400 });
    }

    await updateUserRole(orgId, userId, role);
    return NextResponse.json({ message: "Role updated" });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get("orgId");
  const userId = searchParams.get("userId");

  if (!orgId || !userId) {
    return NextResponse.json({ error: "Org ID and User ID required" }, { status: 400 });
  }

  const auth = await checkPermission("read:accounts", req); 
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const isSelf = auth.user.sub === userId;
    const canManage = auth.isOwner || (await checkPermission("manage:organization", req)).error === undefined;

    if (!isSelf && !canManage) {
      return NextResponse.json({ error: "Forbidden: You don't have permission to remove this user" }, { status: 403 });
    }

    // Protection: Cannot remove/leave if owner
    const org = await getOrganization(orgId);
    if (org?.ownerId === userId) {
      return NextResponse.json({ error: "The owner cannot leave or be removed from the organization." }, { status: 400 });
    }

    await removeUserFromOrg(orgId, userId);
    return NextResponse.json({ message: isSelf ? "Left organization" : "User removed" });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
