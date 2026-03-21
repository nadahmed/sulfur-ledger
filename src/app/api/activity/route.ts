import { NextRequest, NextResponse } from "next/server";
import { getActivityLogs } from "@/lib/db/audit";
import { checkPermission } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = await checkPermission("read:journals", req); 
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get("orgId") || req.cookies.get("activeOrgId")?.value;

  if (!orgId) {
    return NextResponse.json({ error: "orgId is required" }, { status: 400 });
  }

  try {
    const logs = await getActivityLogs(orgId, 500);
    return NextResponse.json(logs);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}



