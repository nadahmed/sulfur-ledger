import { NextRequest, NextResponse } from "next/server";
import { getAllJournalEntriesWithLines } from "@/lib/db/journals";
import { getAccounts } from "@/lib/db/accounts";
import { checkPermission } from "@/lib/auth";
import { createAuditLog } from "@/lib/db/audit";
import { uuidv7 } from "uuidv7";

export async function GET(req: NextRequest) {
  try {
    const { user, isOwner, error, status } = await checkPermission("read:reports", req);
    if (error) return NextResponse.json({ error }, { status: status || 403 });

    const orgId = req.cookies.get("activeOrgId")?.value || req.headers.get("x-org-id");
    if (!orgId) {
      return NextResponse.json({ error: "No active organization" }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const formatType = searchParams.get("format") || "json";

    const [accounts, journals] = await Promise.all([
      getAccounts(orgId),
      getAllJournalEntriesWithLines(orgId),
    ]);

    if (formatType === "csv") {
      const accountMap = new Map(accounts.map(a => [a.id, a.name]));
      
      const csvRows = [
        "Date,Description,Amount,From (Source),To (Destination),Tags,Notes"
      ];

      journals.forEach(j => {
        // Try to find a simple From -> To pair
        const fromLine = j.lines.find(l => l.amount < 0);
        const toLine = j.lines.find(l => l.amount > 0);
        
        if (fromLine && toLine) {
          const amount = Math.abs(toLine.amount) / 100;
          const fromName = accountMap.get(fromLine.accountId) || fromLine.accountId;
          const toName = accountMap.get(toLine.accountId) || toLine.accountId;
          
          // Escape quotes and commas
          const desc = `"${(j.description || "").replace(/"/g, '""')}"`;
          const tags = `"${(j.tags || []).join(", ").replace(/"/g, '""')}"`;
          const notes = `"${(j.notes || "").replace(/"/g, '""')}"`;
          const row = `${j.date},${desc},${amount},"${fromName}","${toName}",${tags},${notes}`;
          csvRows.push(row);
        }
      });

      const csvString = csvRows.join("\n");

      // Log the export activity
      await createAuditLog({
        orgId,
        id: uuidv7(),
        userId: user!.sub,
        userName: user!.name || "Unknown",
        action: "export",
        entityType: "Organization",
        entityId: orgId,
        details: `Exported organization data as CSV`,
        data: { format: "csv" },
        timestamp: new Date().toISOString()
      });

      return new NextResponse(csvString, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="sulfur-ledger-export-${orgId}-${new Date().toISOString().split('T')[0]}.csv"`
        }
      });
    }

    const exportData = {
      organizationId: orgId,
      exportedAt: new Date().toISOString(),
      accounts,
      journals,
    };

    // Log the export activity
    await createAuditLog({
      orgId,
      id: uuidv7(),
      userId: user!.sub,
      userName: user!.name || "Unknown",
      action: "export",
      entityType: "Organization",
      entityId: orgId,
      details: `Exported organization data as ${formatType.toUpperCase()}`,
      data: { format: formatType },
      timestamp: new Date().toISOString()
    });

    return NextResponse.json(exportData);
  } catch (err: any) {
    console.error("[API Error]", err);
    return NextResponse.json({ 
      error: err.message || "Internal server error"
    }, { status: 500 });
  }
}
