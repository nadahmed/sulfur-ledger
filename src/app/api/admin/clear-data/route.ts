import { NextRequest, NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";
import { clearOrganizationData } from "@/lib/db/admin";

export async function POST(req: NextRequest) {
  const session = await auth0.getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const orgId = req.cookies.get("activeOrgId")?.value;
  if (!orgId) {
    return NextResponse.json({ error: "No active organization" }, { status: 400 });
  }

  try {
    await clearOrganizationData(orgId);
    return NextResponse.json({ message: "Data cleared successfully" });
  } catch (err: any) {
    console.error("Clear data error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
