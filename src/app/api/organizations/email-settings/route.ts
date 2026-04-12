import { NextRequest, NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";
import { getOrganization, updateOrganizationEmailSettings } from "@/lib/db/organizations";
import { checkPermission } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await auth0.getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get("orgId");

  if (!orgId) {
    return NextResponse.json({ error: "Organization ID is required" }, { status: 400 });
  }

  try {
    const org = await getOrganization(orgId);
    return NextResponse.json(org?.emailSettings || { provider: "system" });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { user, isOwner, error, status } = await checkPermission("manage:organization", req);
  if (error) return NextResponse.json({ error }, { status });

  try {
    const { orgId, settings } = await req.json();
    if (!orgId || !settings) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    await updateOrganizationEmailSettings(orgId, settings);
    return NextResponse.json({ message: "Email settings updated" });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
