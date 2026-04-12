import { NextRequest, NextResponse } from "next/server";
import { checkPermission } from "@/lib/auth";
import { getOrganization, updateOrganizationAiSettings } from "@/lib/db/organizations";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get("orgId");
  
  if (!orgId) return NextResponse.json({ error: "orgId required" }, { status: 400 });

  const auth = await checkPermission("view:dashboard", req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const org = await getOrganization(orgId);
    if (!org) return NextResponse.json({ error: "Organization not found" }, { status: 404 });

    // Mask the API key in GET response
    const settings = org.aiSettings || { provider: "system" };
    if (settings.apiKey) {
      settings.apiKey = settings.apiKey.substring(0, 4) + "****" + settings.apiKey.substring(settings.apiKey.length - 4);
    }

    return NextResponse.json(settings);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await checkPermission("manage:organization", req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const { orgId, settings } = await req.json();
    if (!orgId) return NextResponse.json({ error: "orgId required" }, { status: 400 });

    // Validation
    if (settings.provider !== "system" && !settings.apiKey && !settings.isExistingKey) {
       // if it's a new setup or clearing the key
    }

    // If apiKey is masked (came from UI GET), don't update it if we didn't get a new one
    if (settings.apiKey && settings.apiKey.includes("****")) {
      const existingOrg = await getOrganization(orgId);
      settings.apiKey = existingOrg?.aiSettings?.apiKey;
    }

    await updateOrganizationAiSettings(orgId, settings);
    return NextResponse.json({ message: "AI settings updated" });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
