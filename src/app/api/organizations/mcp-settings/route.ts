import { NextRequest, NextResponse } from "next/server";
import { checkPermission } from "@/lib/auth";
import { getOrganization, updateOrganizationMcpSettings } from "@/lib/db/organizations";
import { randomBytes } from "crypto";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get("orgId");
  
  if (!orgId) return NextResponse.json({ error: "orgId required" }, { status: 400 });

  const auth = await checkPermission("manage:organization", req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const org = await getOrganization(orgId);
    if (!org) return NextResponse.json({ error: "Organization not found" }, { status: 404 });

    return NextResponse.json({
      mcpApiKey: org.mcpApiKey,
      mcpApiKeyExpiresAt: org.mcpApiKeyExpiresAt,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await checkPermission("manage:organization", req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const { orgId, ttlDays } = await req.json();
    if (!orgId) return NextResponse.json({ error: "orgId required" }, { status: 400 });

    const mcpApiKey = `mcp_${orgId}_${randomBytes(16).toString("hex")}`;
    let mcpApiKeyExpiresAt = null;

    if (ttlDays && ttlDays !== "never") {
      const days = parseInt(ttlDays);
      const expiry = new Date();
      expiry.setDate(expiry.getDate() + days);
      mcpApiKeyExpiresAt = expiry.toISOString();
    }

    await updateOrganizationMcpSettings(orgId, { mcpApiKey, mcpApiKeyExpiresAt });

    return NextResponse.json({ mcpApiKey, mcpApiKeyExpiresAt });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get("orgId");

  if (!orgId) return NextResponse.json({ error: "orgId required" }, { status: 400 });

  const auth = await checkPermission("manage:organization", req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    await updateOrganizationMcpSettings(orgId, { mcpApiKey: null, mcpApiKeyExpiresAt: null });
    return NextResponse.json({ message: "MCP API Key deleted" });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
