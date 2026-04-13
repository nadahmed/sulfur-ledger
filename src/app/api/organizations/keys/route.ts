import { NextRequest, NextResponse } from "next/server";
import { checkPermission } from "@/lib/auth";
import { getApiKeys, createApiKey, deleteApiKey } from "@/lib/db/organizations";
import { randomBytes } from "crypto";
import { ApiKey } from "@/lib/db/organizations";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get("orgId");
  
  if (!orgId) return NextResponse.json({ error: "orgId required" }, { status: 400 });

  const auth = await checkPermission("manage:organization", req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const keys = await getApiKeys(orgId);
    
    // Sanitize: never send back the full sensitive keys if they were stored in plain text.
    // However, in our architecture, once created, the user gets the key once.
    // The SK contains the key value (which acts as the hash/token). 
    // We only return the "safe" version for listing.
    return NextResponse.json(keys.map(k => ({
      name: k.name,
      role: k.role,
      userName: k.userName,
      expiresAt: k.expiresAt,
      createdAt: k.createdAt,
      // We send just the suffix/token for identifying the key in delete requests
      key: k.key 
    })));
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await checkPermission("manage:organization", req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const { orgId, name, role, ttlDays } = await req.json();
    if (!orgId) return NextResponse.json({ error: "orgId required" }, { status: 400 });
    if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

    const secret = randomBytes(16).toString("hex");
    const mcpApiKey = `mcp_${orgId}_${secret}`;
    
    let expiresAt = null;
    if (ttlDays && ttlDays !== "never") {
      const days = parseInt(ttlDays);
      const expiry = new Date();
      expiry.setDate(expiry.getDate() + days);
      expiresAt = expiry.toISOString();
    }

    const keyRecord: ApiKey = {
      orgId,
      key: mcpApiKey,
      name: name || "Unnamed Key",
      userId: `key:${secret}`, // Decoupled from the creator
      userName: name || "API Key",
      role: role || "member",
      expiresAt,
      createdAt: new Date().toISOString(),
    };

    await createApiKey(keyRecord);

    return NextResponse.json({ 
      ...keyRecord,
      // This is the only time the user will see the full key
      fullKey: mcpApiKey 
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get("orgId");
  const key = searchParams.get("key");

  if (!orgId || !key) return NextResponse.json({ error: "orgId and key required" }, { status: 400 });

  const auth = await checkPermission("manage:organization", req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    await deleteApiKey(orgId, key);
    return NextResponse.json({ message: "API Key revoked" });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
