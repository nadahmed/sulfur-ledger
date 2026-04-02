import { NextRequest, NextResponse } from "next/server";
import { checkPermission } from "@/lib/auth";
import { generateReportData } from "@/lib/reports";
import { getOrganization } from "@/lib/db/organizations";
import { createAuditLog } from "@/lib/db/audit";
import { uuidv7 } from "uuidv7";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";

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

    // Format utility
    const formatCurrency = (amount: number) => {
      return new Intl.NumberFormat("en-BD", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(Math.abs(amount) / 100);
    };

    // 1. Fetch organization for branding
    const org = await getOrganization(orgId);
    const orgName = org?.name || "Sulfur Ledger Organization";

    // 2. Fetch the report data natively via our shared library function
    const reportData = await generateReportData(orgId, reportType, startDate, endDate, searchParams);

    // 3. Generate PDF
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    
    // Header
    doc.setFontSize(20);
    doc.text(orgName, 14, 22);
    
    doc.setFontSize(14);
    const reportTitle = reportType.replace("-", " ").toUpperCase();
    doc.text(reportTitle, 14, 32);

    doc.setFontSize(10);
    doc.setTextColor(100);
    
    let metaY = 40;
    
    if (startDate || endDate) {
      let periodText = "Period: ";
      if (startDate && endDate) periodText += `${startDate} to ${endDate}`;
      else if (startDate) periodText += `From ${startDate}`;
      else if (endDate) periodText += `Up to ${endDate}`;
      
      doc.text(periodText, 14, metaY);
      metaY += 5;
    }

    doc.text(`Printed on: ${format(new Date(), "PPpp")}`, 14, metaY);

    let currentY = metaY + 10;

    if (reportType === "trial-balance") {
      const data = reportData as any;
      const rows = data.accounts.map((acc: any) => [
        acc.name,
        acc.category.charAt(0).toUpperCase() + acc.category.slice(1),
        acc.balance > 0 ? formatCurrency(acc.balance) : "-",
        acc.balance < 0 ? formatCurrency(acc.balance) : "-"
      ]);

      rows.push([
        "TOTAL",
        "",
        formatCurrency(data.totalDebits || 0),
        formatCurrency(data.totalCredits || 0)
      ]);

      autoTable(doc, {
        startY: currentY,
        head: [['Account Name', 'Category', 'Debit', 'Credit']],
        body: rows,
        headStyles: { fillColor: [41, 41, 41] },
        columnStyles: {
          2: { halign: 'right' },
          3: { halign: 'right' }
        },
        willDrawCell: (data) => {
          if (data.row.index === rows.length - 1 && data.section === 'body') {
            doc.setFont("helvetica", "bold");
          }
        }
      });
    } else if (reportType === "balance-sheet") {
      const data = reportData as any;
      const sections = [
        { title: 'Assets', accounts: data.assets || [] },
        { title: 'Liabilities', accounts: data.liabilities || [] },
        { title: 'Equity', accounts: data.equity || [] }
      ];

      sections.forEach((section) => {
        doc.setFontSize(12);
        doc.setTextColor(0);
        doc.text(section.title, 14, currentY);
        currentY += 5;

        const total = section.accounts.reduce((sum: number, acc: any) => sum + Math.abs(acc.balance), 0);
        const rows = section.accounts.map((acc: any) => [acc.name, formatCurrency(acc.balance)]);
        
        if (rows.length === 0) {
           rows.push(['No items found', formatCurrency(0)]);
        }
        
        rows.push([`Total ${section.title}`, formatCurrency(total)]);

        autoTable(doc, {
          startY: currentY,
          body: rows,
          theme: 'plain',
          head: [],
          columnStyles: {
            1: { halign: 'right' }
          },
          willDrawCell: (data) => {
            if (data.row.index === rows.length - 1) {
              doc.setFont("helvetica", "bold");
            }
          }
        });
        currentY = (doc as any).lastAutoTable.finalY + 15;
      });
    } else if (reportType === "income-statement") {
      const data = reportData as any;
      const sections = [
        { title: 'Income', accounts: data.income || [] },
        { title: 'Expenses', accounts: data.expenses || [] }
      ];

      sections.forEach((section) => {
        doc.setFontSize(12);
        doc.setTextColor(0);
        doc.text(section.title, 14, currentY);
        currentY += 5;

        const total = section.accounts.reduce((sum: number, acc: any) => sum + Math.abs(acc.balance), 0);
        const rows = section.accounts.map((acc: any) => [acc.name, formatCurrency(acc.balance)]);
        
        if (rows.length === 0) {
           rows.push(['No items found', formatCurrency(0)]);
        }
        
        rows.push([`Total ${section.title}`, formatCurrency(total)]);

        autoTable(doc, {
          startY: currentY,
          body: rows,
          theme: 'plain',
          head: [],
          columnStyles: {
            1: { halign: 'right' }
          },
          willDrawCell: (data) => {
            if (data.row.index === rows.length - 1) {
              doc.setFont("helvetica", "bold");
            }
          }
        });
        currentY = (doc as any).lastAutoTable.finalY + 15;
      });

      const totalIncome = (data.income || []).reduce((s: number, a: any) => s + Math.abs(a.balance), 0);
      const totalExpenses = (data.expenses || []).reduce((s: number, a: any) => s + Math.abs(a.balance), 0);
      const netIncome = totalIncome - totalExpenses;

      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text(`Net Income: ${formatCurrency(netIncome)}`, 14, currentY);
    } else {
       doc.text("Report preview unavailable for this format.", 14, 50);
    }

    const pdfArrayBuffer = doc.output('arraybuffer');

    // 4. Log the export activity
    await createAuditLog({
      orgId,
      id: uuidv7(),
      userId: user!.sub,
      userName: user!.name || "Unknown",
      action: "export",
      entityType: "Report",
      entityId: reportType,
      details: JSON.stringify({ message: `Exported ${reportTitle} PDF`, startDate, endDate }),
      timestamp: new Date().toISOString()
    });

    // 5. Return PDF buffer
    return new NextResponse(pdfArrayBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${reportType}-${format(new Date(), 'yyyy-MM-dd')}.pdf"`,
      },
    });

  } catch (err: any) {
    console.error("[API Error PDF]", err);
    return NextResponse.json({ 
      error: err.message || "Internal server error"
    }, { status: 500 });
  }
}
