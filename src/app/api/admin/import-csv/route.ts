import { NextRequest, NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";
import { importJournalsFromCsv } from "@/lib/db/import";

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
    const { csvContent } = await req.json();
    if (!csvContent) {
      return NextResponse.json({ error: "No CSV content provided" }, { status: 400 });
    }

    const result = await importJournalsFromCsv(orgId, csvContent);
    return NextResponse.json({ 
      message: `Successfully imported ${result.importedCount} journal entries`,
      importedCount: result.importedCount
    });
  } catch (err: any) {
    console.error("Import CSV error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
