import { NextRequest, NextResponse } from "next/server";
import { checkPermission } from "@/lib/auth";
import { generateReportData } from "@/lib/reports";

export async function GET(req: NextRequest) {
  try {
    const { user, isOwner, error, status } = await checkPermission("read:reports", req);
    if (error) return NextResponse.json({ error }, { status: status || 403 });

    const orgId = req.cookies.get("activeOrgId")?.value || req.headers.get("x-org-id");
    if (!orgId) {
      return NextResponse.json({ error: "No active organization" }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get("start") || undefined;
    const endDate = searchParams.get("end") || undefined;
    const reportType = searchParams.get("type") || "trial-balance";

    const reportData = await generateReportData(orgId, reportType, startDate, endDate, searchParams);
    return NextResponse.json(reportData);

  } catch (err: any) {
    console.error("[API Error]", err);
    return NextResponse.json({ 
      error: err.message || "Internal server error", 
      stack: err.stack,
      orgIdUsed: req.cookies.get("activeOrgId")?.value || req.headers.get("x-org-id")
    }, { status: err.message === "Invalid report type" ? 400 : 500 });
  }
}
