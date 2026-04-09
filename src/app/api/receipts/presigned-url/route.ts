import { NextRequest, NextResponse } from "next/server";
import { getOrganization } from "@/lib/db/organizations";
import { getEffectiveStorageConfig, getPresignedUploadUrl } from "@/lib/storage";
import { checkPermission } from "@/lib/auth";
import { uuidv7 } from "uuidv7";

export async function GET(req: NextRequest) {
  const auth = await checkPermission("member", req); // Any member can upload
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get("orgId");
  const fileName = searchParams.get("fileName");
  const contentType = searchParams.get("contentType");

  if (!orgId || !fileName || !contentType) {
    return NextResponse.json({ error: "Missing required parameters" }, { status: 400 });
  }

  try {
    const org = await getOrganization(orgId);
    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    const config = getEffectiveStorageConfig(org);
    const key = `tmp/${uuidv7()}-${fileName}`;
    
    const result = await getPresignedUploadUrl(config, key, contentType);
    
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
