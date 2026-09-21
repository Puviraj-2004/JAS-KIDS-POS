import { Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { dateRange, financialData } from "@/lib/accounts";
import { getCurrentStaff } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildExcelReport, buildPdfReport, reportExportData } from "@/lib/report-exports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function csvCell(value: unknown) { return `"${String(value ?? "").replaceAll('"', '""')}"`; }

const fileDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Colombo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function exportFilename(branchName: string, from: Date, to: Date, extension: string) {
  const branch = branchName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "all-branches";
  return `jaskids-${branch}-${fileDate.format(from)}-${fileDate.format(to)}.${extension}`;
}

export async function GET(request: Request) {
  const staff = await getCurrentStaff(request);
  if (!staff) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (staff.role !== Role.SUPER_ADMIN && staff.role !== Role.BRANCH_ADMIN) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (staff.role === Role.BRANCH_ADMIN && !staff.branch_id) return NextResponse.json({ error: "Branch Admin needs an assigned branch" }, { status: 403 });
  const url = new URL(request.url); const requestedBranch = url.searchParams.get("branch_id"); const branchId = staff.role === Role.SUPER_ADMIN ? requestedBranch : staff.branch_id!; const { from, to } = dateRange(url);
  const [branches, data] = await Promise.all([prisma.branch.findMany({ where: staff.role === Role.BRANCH_ADMIN ? { id: staff.branch_id! } : {}, orderBy: { name: "asc" } }), financialData(branchId, from, to)]);
  const selectedBranch = branchId ? branches.find(branch => branch.id === branchId) : null;
  if (branchId && !selectedBranch) return NextResponse.json({ error: "Branch not found" }, { status: 404 });
  const branchName = selectedBranch?.name ?? "All branches";
  const format = url.searchParams.get("format");
  if (url.searchParams.get("format") === "csv") {
    const summary = [
      ["SUMMARY"],
      ["Gross amount (known discounts)", data.summary.gross_amount.toFixed(2)],
      ["Booking discounts", data.summary.booking_discounts.toFixed(2)],
      ["Sales discounts", data.summary.sale_discounts.toFixed(2)],
      ["Total discounts", data.summary.total_discounts.toFixed(2)],
      ["Overall income", data.summary.overall_income.toFixed(2)],
      ["Overall expenses", data.summary.overall_expenses.toFixed(2)],
      ["Net revenue", data.summary.net_revenue.toFixed(2)],
      ["Playhouse revenue", data.summary.playhouse_revenue.toFixed(2)],
      ["Birthday revenue", data.summary.birthday_revenue.toFixed(2)],
      ["Cafe revenue", data.summary.cafe_revenue.toFixed(2)],
      ["Wastage loss", data.summary.wastage_loss.toFixed(2)],
      ["Expense loss", data.summary.expense_loss.toFixed(2)],
      ["Supplier purchase cost", data.summary.supplier_purchase_cost.toFixed(2)],
    ];
    const csv = summary.map(row => row.map(csvCell).join(",")).join("\r\n");
    return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${exportFilename(branchName, from, to, "csv")}"`, "Cache-Control": "private, no-store" } });
  }
  if (format === "xlsx" || format === "pdf") {
    const exportData = await reportExportData(branchId, from, to);
    const options = { data: exportData, financial: data, branchName, from, to };
    const buffer = format === "xlsx" ? await buildExcelReport(options) : await buildPdfReport(options);
    const contentType = format === "xlsx"
      ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      : "application/pdf";
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${exportFilename(branchName, from, to, format)}"`,
        "Content-Length": String(buffer.length),
        "Cache-Control": "private, no-store",
      },
    });
  }
  return NextResponse.json({ success: true, can_select_branch: staff.role === Role.SUPER_ADMIN, branches, selected_branch_id: branchId, from, to, ...data });
}
