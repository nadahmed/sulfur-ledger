import { NextRequest, NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";
import { 
  createOrganization, 
  addUserToOrg, 
  getUserOrganizations,
  updateOrganization, 
  deleteFullOrganization 
} from "@/lib/db/organizations";
import { randomUUID } from "crypto";
import { checkPermission } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await auth0.getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const orgs = await getUserOrganizations(session.user.sub);
    return NextResponse.json(orgs);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth0.getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { name, currencySymbol, currencyPosition, currencyHasSpace } = await req.json();
    if (!name) {
      return NextResponse.json({ error: "Organization name is required" }, { status: 400 });
    }

    const orgId = randomUUID();
    const org = await createOrganization({
      id: orgId,
      name,
      ownerId: session.user.sub,
      currencySymbol: currencySymbol || "৳", // Default to Taka
      currencyPosition: currencyPosition || "prefix",
      currencyHasSpace: currencyHasSpace || false,
      createdAt: new Date().toISOString(),
    });

    await addUserToOrg({
      orgId,
      orgName: name,
      userId: session.user.sub,
      userName: session.user.name,
      userEmail: session.user.email,
      userPicture: session.user.picture,
      role: "admin",
      isOwner: true,
      createdAt: new Date().toISOString(),
    });

    return NextResponse.json(org, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await checkPermission("manage:organization", req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const { id, name, currencySymbol, currencyPosition, currencyHasSpace } = await req.json();
    if (!id || !name) {
      return NextResponse.json({ error: "ID and Name are required" }, { status: 400 });
    }

    await updateOrganization(id, { name, currencySymbol, currencyPosition, currencyHasSpace });
    return NextResponse.json({ message: "Organization updated" });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await checkPermission("manage:organization", req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get("id");

  if (!orgId) {
    return NextResponse.json({ error: "Organization ID is required" }, { status: 400 });
  }

  try {
    await deleteFullOrganization(orgId);
    return NextResponse.json({ message: "Organization deleted" });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
