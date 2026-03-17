import { NextRequest, NextResponse } from "next/server";
import { sendEmail } from "@/lib/email";
import { checkPermission } from "@/lib/auth";
import { createInvitation, getOrganizationInvitations, deleteInvitation, getInvitation } from "@/lib/db/organizations";
import { getOrgUser } from "@/lib/db/users";

const EXPIRATION_HOURS = 48;

export async function POST(req: NextRequest) {
  const auth = await checkPermission("manage:organization", req);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { email, role, orgId, orgName } = await req.json();

    if (!email || !role || !orgId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Edge case 1: Prevent self-invite
    if (email.toLowerCase() === auth.user.email?.toLowerCase()) {
      return NextResponse.json({ error: "You cannot invite yourself" }, { status: 400 });
    }

    // Edge case 2: Prevent duplicate pending invite
    const existingInvite = await getInvitation(orgId, email);
    if (existingInvite) {
      // Check if it's expired
      const createdAt = new Date(existingInvite.createdAt);
      const isExpired = (new Date().getTime() - createdAt.getTime()) >= (EXPIRATION_HOURS * 60 * 60 * 1000);
      if (!isExpired) {
        return NextResponse.json({ error: "An active invitation has already been sent to this user" }, { status: 400 });
      } else {
        // Automatically clean up expired invite so we can send a new one
        await deleteInvitation(orgId, email);
      }
    }

    const invitation = {
      orgId,
      email,
      role,
      orgName,
      invitedBy: auth.user.sub,
      createdAt: new Date().toISOString(),
    };

    // Before sending the invite, attempt to link secondary accounts
    // so they don't block OAuth or separate sign-ins under the same email
    try {
      const { linkUsersByEmail } = await import('@/lib/auth0');
      const auth0Users = await linkUsersByEmail(email);

      // Edge case 3: Prevent inviting users who are already members
      if (auth0Users && auth0Users.length > 0) {
        for (const u of auth0Users) {
          if (!u.user_id) continue;
          const orgUser = await getOrgUser(orgId, u.user_id);
          if (orgUser) {
            return NextResponse.json({ error: "This user is already a member of the organization" }, { status: 400 });
          }
        }
      }
    } catch (linkError) {
      console.error("Non-fatal error linking Auth0 users:", linkError);
    }

    await createInvitation(invitation);

    const inviteLink = `${process.env.APP_BASE_URL}/auth/login?returnTo=${encodeURIComponent(`/onboarding?inviteOrgId=${orgId}`)}`;
    
    await sendEmail(orgId, {
      to: email,
      subject: `Invitation to join ${orgName}`,
      text: `Hello,\n\nYou have been invited to join ${orgName} on Sulfur Ledger as a ${role}.\n\nThis invitation expires in ${EXPIRATION_HOURS} hours.\n\nAccept invitation: ${inviteLink}`,
      html: `
        <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
          <h2 style="color: #2563eb;">Join ${orgName}</h2>
          <p>You have been invited to join <strong>${orgName}</strong> on Sulfur Ledger as a <strong>${role}</strong>.</p>
          <p>This invitation expires in <strong>${EXPIRATION_HOURS}</strong> hours.</p>
          <div style="margin: 30px 0;">
            <a href="${inviteLink}" style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Accept Invitation</a>
          </div>
          <p style="color: #666; font-size: 14px;">If the button above doesn't work, copy and paste this link into your browser:<br>${inviteLink}</p>
        </div>
      `
    });

    return NextResponse.json({ message: "Invitation sent successfully" });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "An error occurred" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const auth = await checkPermission("manage:organization", req);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get("orgId");

  if (!orgId) {
    return NextResponse.json({ error: "Organization ID is required" }, { status: 400 });
  }

  try {
    const invitations = await getOrganizationInvitations(orgId);
    
    // Filter out expired invitations (> 48h)
    const now = new Date();
    const activeInvitations = invitations.filter(inv => {
      const createdAt = new Date(inv.createdAt);
      const diffMs = now.getTime() - createdAt.getTime();
      return diffMs < (EXPIRATION_HOURS * 60 * 60 * 1000);
    });

    return NextResponse.json(activeInvitations);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "An error occurred" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await checkPermission("manage:organization", req);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get("orgId");
  const email = searchParams.get("email");

  if (!orgId || !email) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  try {
    await deleteInvitation(orgId, email);
    return NextResponse.json({ message: "Invitation cancelled successfully" });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "An error occurred" }, { status: 500 });
  }
}
