import { NextRequest, NextResponse } from "next/server";
import { auth0 } from "./auth0";
import { getOrgUser } from "./db/users";
import { getOrganization, addUserToOrg } from "./db/organizations";
import { ROLE_PERMISSIONS } from "./constants/permissions";

export interface AuthSession {
  user: any;
  isOwner: boolean;
  error?: string;
  status?: number;
}

// ROLE_PERMISSIONS now imported from ./constants/permissions

export async function checkPermission(permission: string, req: NextRequest): Promise<AuthSession> {
  const session = await auth0.getSession();
  if (!session?.user) return { user: null, isOwner: false, error: "Unauthorized", status: 401 };
  
  const cookieOrgId = req.cookies.get("activeOrgId")?.value;
  const headerOrgId = req.headers.get("x-org-id");
  const orgId = cookieOrgId || headerOrgId;

  console.log(`[Auth] Checking permission: ${permission} for user: ${session.user.sub} in org: ${orgId}`);

  // Base permissions: if we have an orgId, we ONLY use org-specific permissions.
  // if no orgId, we use global session permissions.
  let effectivePermissions: string[] = [];

  if (orgId) {
    const orgUser = await getOrgUser(orgId, session.user.sub);
    
    // Self-healing: Update profile data if missing or outdated
    const profileOutOfSync = orgUser && (
      orgUser.userName !== session.user.name ||
      orgUser.userEmail !== session.user.email ||
      orgUser.userPicture !== session.user.picture
    );

    if (orgUser && profileOutOfSync) {
      console.log(`[Auth] User profile out of sync for ${session.user.sub}. Updating...`);
      // Update in background to avoid blocking
      addUserToOrg({
        ...orgUser,
        userName: session.user.name,
        userEmail: session.user.email,
        userPicture: session.user.picture,
      }).catch(err => console.error("[Auth] Failed to self-heal profile:", err));
    }

    // 1. Owner Bypass
    if (orgUser?.isOwner) {
      console.log(`[Auth] Owner bypass (OrgUser flag)`);
      return { user: session.user, isOwner: true };
    }

    const org = await getOrganization(orgId);
    if (org?.ownerId === session.user.sub) {
      console.log(`[Auth] Owner bypass (Metadata ownerId)`);
      return { user: session.user, isOwner: true };
    }

    // 2. Role-based Permissions from DB
    if (orgUser?.role && ROLE_PERMISSIONS[orgUser.role]) {
      effectivePermissions = ROLE_PERMISSIONS[orgUser.role];
      console.log(`[Auth] Using permissions for role: ${orgUser.role}`);
    } else {
      console.log(`[Auth] No role found for user in this organization.`);
      // If the user isn't in the org, they have no permissions for it.
      return { user: session.user, isOwner: false, error: `Forbidden: You are not a member of this organization`, status: 403 };
    }
  } else {
    // Global actions (not tied to an org) use global session permissions
    effectivePermissions = (session.user.permissions as string[]) || [];
  }

  if (!effectivePermissions.includes(permission)) {
    console.log(`[Auth] Permission denied. Required: ${permission}, Available: ${effectivePermissions.join(", ")}`);
    return { user: session.user, isOwner: false, error: `Missing permission: ${permission}`, status: 403 };
  }
  
  console.log(`[Auth] Permission granted: ${permission}`);
  return { user: session.user, isOwner: false };
}
