import { NextRequest, NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";
import { getInvitation, addUserToOrg, deleteInvitation } from "@/lib/db/organizations";

const EXPIRATION_HOURS = 48;

export async function POST(req: NextRequest) {
  const session = await auth0.getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { orgId } = await req.json();

    if (!orgId) {
      return NextResponse.json({ error: "Organization ID is required" }, { status: 400 });
    }

    const email = session.user.email;
    if (!email) {
      return NextResponse.json({ error: "User email not available" }, { status: 400 });
    }

    // 1. Fetch invitation
    const invite = await getInvitation(orgId, email);
    if (!invite) {
      return NextResponse.json({ error: "No valid invitation found for this email and organization" }, { status: 404 });
    }

    // 2. Check expiration
    const createdAt = new Date(invite.createdAt);
    const now = new Date();
    const diffMs = now.getTime() - createdAt.getTime();
    if (diffMs >= (EXPIRATION_HOURS * 60 * 60 * 1000)) {
      // Auto-cleanup expired invite on attempt
      await deleteInvitation(orgId, email);
      return NextResponse.json({ error: "This invitation has expired" }, { status: 400 });
    }

    // 3. Add user to organization
    await addUserToOrg({
      orgId: invite.orgId,
      orgName: invite.orgName,
      userId: session.user.sub,
      userName: session.user.name,
      userEmail: session.user.email,
      userPicture: session.user.picture,
      role: invite.role,
      isOwner: false,
      createdAt: new Date().toISOString(),
    });

    // 4. Delete the used invitation
    await deleteInvitation(orgId, email);

    return NextResponse.json({ message: "Successfully joined the organization", orgId: invite.orgId });
    
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "An error occurred" }, { status: 500 });
  }
}
