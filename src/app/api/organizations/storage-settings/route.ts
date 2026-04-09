import { NextRequest, NextResponse } from "next/server";
import { updateOrganizationStorageSettings, getOrganization } from "@/lib/db/organizations";
import { checkPermission } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const auth = await checkPermission("manage:organization", req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const { orgId, settings } = await req.json();
    if (!orgId) {
      return NextResponse.json({ error: "Organization ID is required" }, { status: 400 });
    }

    if (settings) {
      await updateOrganizationStorageSettings(orgId, settings);
    }

    return NextResponse.json({ message: "Storage settings updated" });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const auth = await checkPermission("manage:organization", req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get("orgId");

  if (!orgId) {
    return NextResponse.json({ error: "Organization ID is required" }, { status: 400 });
  }

  try {
    const org = await getOrganization(orgId);
    return NextResponse.json({
      storageSettings: org?.storageSettings || { provider: "system" },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
