import { NextRequest, NextResponse } from "next/server";
import { getActivityLogs, ActivityFilter } from "@/lib/db/audit";
import { checkPermission } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = await checkPermission("read:journals", req); 
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get("orgId") || req.cookies.get("activeOrgId")?.value;

  if (!orgId) {
    return NextResponse.json({ error: "orgId is required" }, { status: 400 });
  }

  const limit = parseInt(searchParams.get("limit") || "50");
  const cursor = searchParams.get("cursor") || undefined;
  
  const filters: ActivityFilter = {
    action: searchParams.get("action") || undefined,
    userId: searchParams.get("userId") || undefined,
    entityType: searchParams.get("entityType") || undefined,
    entityId: searchParams.get("entityId") || undefined,
    type: (searchParams.get("type") as "ui" | "mcp") || undefined,
    startDate: searchParams.get("from") || searchParams.get("startDate") || undefined,
    endDate: searchParams.get("to") || searchParams.get("endDate") || undefined,
  };

  try {
    const result = await getActivityLogs(orgId, limit, cursor, filters);
    return NextResponse.json(result);
  } catch (err: any) {
    console.error("Activity API Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}




