import { NextRequest, NextResponse } from "next/server";
import { getOrganization } from "@/lib/db/organizations";
import { getEffectiveStorageConfig, getDownloadUrl } from "@/lib/storage";
import { checkPermission } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = await checkPermission("view", req); // Any viewer can see receipts
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get("orgId");
  const key = searchParams.get("key");

  if (!orgId || !key) {
    return NextResponse.json({ error: "Missing required parameters" }, { status: 400 });
  }

  try {
    const org = await getOrganization(orgId);
    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    const config = getEffectiveStorageConfig(org);
    const url = await getDownloadUrl(config, key);
    
    return NextResponse.json({ url });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
