import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { PaymentDirection, SaleStatus, StockMovementType } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type FinancialReport = Awaited<ReturnType<typeof import("@/lib/accounts").financialData>>;

const BRAND = "087454";
const BRAND_DARK = "163B31";
const GOLD = "D6A33C";
const LIGHT = "EAF4EF";
const BORDER = "CFDED7";
const MONEY_FORMAT = '"Rs." #,##0.00;[Red]-"Rs." #,##0.00';
const DATE_FORMAT = "dd mmm yyyy";
const DATE_TIME_FORMAT = "dd mmm yyyy hh:mm";

const sriLankaDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Colombo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const sriLankaDateTime = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Colombo",
  dateStyle: "medium",
  timeStyle: "short",
});

export async function reportExportData(branchId: string | null, from: Date, to: Date) {
  const branchWhere = branchId ? { branch_id: branchId } : {};
  const [checkins, sales, payments, expenses, purchases, wastage] = await Promise.all([
    prisma.checkIn.findMany({
      where: { ...branchWhere, status: "CHECKED_IN", checked_in_at: { gte: from, lte: to } },
      include: {
        branch: { select: { name: true } },
        staff: { select: { name: true } },
        booking: { include: { items: true } },
      },
      orderBy: { checked_in_at: "asc" },
    }),
    prisma.sale.findMany({
      where: { ...branchWhere, status: SaleStatus.COMPLETED, created_at: { gte: from, lte: to } },
      include: {
        branch: { select: { name: true } },
        cashier: { select: { name: true } },
        items: true,
        transaction: { select: { receipt_no: true } },
      },
      orderBy: { created_at: "asc" },
    }),
    prisma.payment.findMany({
      where: { ...branchWhere, paid_at: { gte: from, lte: to } },
      include: {
        branch: { select: { name: true } },
        staff: { select: { name: true } },
        booking: { select: { reference_no: true } },
        sale: { select: { sale_no: true } },
        expense: { select: { description: true } },
        purchase: { select: { purchase_no: true } },
        wastage: { select: { reference_id: true } },
      },
      orderBy: { paid_at: "asc" },
    }),
    prisma.branchExpense.findMany({
      where: { ...branchWhere, incurred_at: { gte: from, lte: to } },
      include: {
        branch: { select: { name: true } },
        expense_type: { select: { name: true } },
        staff: { select: { name: true } },
      },
      orderBy: { incurred_at: "asc" },
    }),
    prisma.supplierPurchase.findMany({
      where: { ...branchWhere, purchased_at: { gte: from, lte: to } },
      include: {
        branch: { select: { name: true } },
        supplier: { select: { name: true } },
        staff: { select: { name: true } },
        items: { include: { product: { select: { name: true } } } },
      },
      orderBy: { purchased_at: "asc" },
    }),
    prisma.stockMovement.findMany({
      where: { ...branchWhere, type: StockMovementType.WASTAGE, created_at: { gte: from, lte: to } },
      include: {
        branch: { select: { name: true } },
        product: { select: { name: true } },
        staff: { select: { name: true } },
      },
      orderBy: { created_at: "asc" },
    }),
  ]);

  return { checkins, sales, payments, expenses, purchases, wastage };
}

export type ReportExportData = Awaited<ReturnType<typeof reportExportData>>;

function number(value: unknown) {
  return Number(value ?? 0);
}

function sourceReference(payment: ReportExportData["payments"][number]) {
  return payment.booking?.reference_no
    ?? payment.sale?.sale_no
    ?? payment.purchase?.purchase_no
    ?? payment.expense?.description
    ?? payment.wastage?.reference_id
    ?? "";
}

function localExcelDate(value: Date) {
  return new Date(value.getTime() + 5.5 * 60 * 60 * 1000);
}

function formatEnum(value: string) {
  return value.toLowerCase().split("_").map(word => `${word[0]?.toUpperCase() ?? ""}${word.slice(1)}`).join(" ");
}

function safeSheetName(value: string) {
  return value.replace(/[\\/?*\[\]:]/g, " ").slice(0, 31);
}

function addDataSheet(
  workbook: ExcelJS.Workbook,
  name: string,
  columns: Array<{ header: string; key: string; width?: number; style?: "money" | "date" | "datetime" | "number" | "decimal" }>,
  rows: Array<Record<string, unknown>>,
) {
  const sheet = workbook.addWorksheet(safeSheetName(name), { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = columns.map(column => ({ header: column.header, key: column.key, width: column.width ?? 18 }));
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  const header = sheet.getRow(1);
  header.height = 26;
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${BRAND}` } };
  header.alignment = { vertical: "middle" };
  rows.forEach(row => sheet.addRow(row));
  columns.forEach((column, index) => {
    const excelColumn = sheet.getColumn(index + 1);
    if (column.style === "money") excelColumn.numFmt = MONEY_FORMAT;
    if (column.style === "date") excelColumn.numFmt = DATE_FORMAT;
    if (column.style === "datetime") excelColumn.numFmt = DATE_TIME_FORMAT;
    if (column.style === "number") excelColumn.numFmt = "0.000";
    if (column.style === "decimal") excelColumn.numFmt = "0.00";
  });
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1 && rowNumber % 2 === 1) {
      row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF6FAF8" } };
    }
    row.alignment = { vertical: "top", wrapText: true };
  });
  if (!rows.length) sheet.addRow(["No records for this period"]);
  return sheet;
}

function analysis(data: ReportExportData) {
  const days = new Map<string, { bookings: number; sales: number; expenses: number; purchases: number; wastage: number }>();
  const day = (value: Date) => {
    const key = sriLankaDate.format(value);
    const current = days.get(key) ?? { bookings: 0, sales: 0, expenses: 0, purchases: 0, wastage: 0 };
    days.set(key, current);
    return current;
  };
  data.checkins.forEach(item => { day(item.checked_in_at).bookings += number(item.booking.total_price); });
  data.sales.forEach(item => { day(item.created_at).sales += number(item.total); });
  data.expenses.forEach(item => { day(item.incurred_at).expenses += number(item.amount); });
  data.purchases.forEach(item => { day(item.purchased_at).purchases += number(item.total); });
  data.wastage.forEach(item => { day(item.created_at).wastage += number(item.quantity) * number(item.unit_cost); });

  const products = new Map<string, { quantity: number; revenue: number }>();
  data.sales.flatMap(sale => sale.items).forEach(item => {
    const current = products.get(item.product_name) ?? { quantity: 0, revenue: 0 };
    current.quantity += number(item.quantity);
    current.revenue += number(item.line_total);
    products.set(item.product_name, current);
  });

  const paymentMethods = new Map<string, number>();
  data.payments.filter(payment => payment.direction === PaymentDirection.INCOME).forEach(payment => {
    paymentMethods.set(formatEnum(payment.method), (paymentMethods.get(formatEnum(payment.method)) ?? 0) + number(payment.amount));
  });

  return {
    daily: Array.from(days.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([date, values]) => ({
      date,
      ...values,
      income: values.bookings + values.sales,
      outgoing: values.expenses + values.purchases + values.wastage,
      net: values.bookings + values.sales - values.expenses - values.purchases - values.wastage,
    })),
    products: Array.from(products.entries()).map(([product, values]) => ({ product, ...values })).sort((a, b) => b.revenue - a.revenue),
    paymentMethods: Array.from(paymentMethods.entries()).map(([method, amount]) => ({ method, amount })).sort((a, b) => b.amount - a.amount),
  };
}

export async function buildExcelReport(options: {
  data: ReportExportData;
  financial: FinancialReport;
  branchName: string;
  from: Date;
  to: Date;
}) {
  const { data, financial, branchName, from, to } = options;
  const insights = analysis(data);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "JAS KIDS POS";
  workbook.company = "JAS KIDS";
  workbook.subject = "Financial and operations report";
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.calcProperties.fullCalcOnLoad = true;

  const summary = workbook.addWorksheet("Summary", { properties: { tabColor: { argb: `FF${BRAND}` } } });
  summary.columns = [{ width: 34 }, { width: 22 }, { width: 18 }, { width: 18 }];
  summary.mergeCells("A1:D1");
  summary.getCell("A1").value = "JAS KIDS — FINANCIAL & OPERATIONS REPORT";
  summary.getCell("A1").font = { bold: true, size: 18, color: { argb: "FFFFFFFF" } };
  summary.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${BRAND_DARK}` } };
  summary.getCell("A1").alignment = { vertical: "middle", horizontal: "left" };
  summary.getRow(1).height = 38;
  [["Branch", branchName], ["Period", `${sriLankaDate.format(from)} to ${sriLankaDate.format(to)}`], ["Generated", sriLankaDateTime.format(new Date())]].forEach(row => summary.addRow(row));
  summary.addRow([]);
  const addSection = (title: string, rows: Array<[string, number]>, money = true) => {
    const titleRow = summary.addRow([title]);
    titleRow.font = { bold: true, color: { argb: `FF${BRAND_DARK}` } };
    titleRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${LIGHT}` } };
    rows.forEach(([label, value]) => {
      const row = summary.addRow([label, value]);
      if (money) row.getCell(2).numFmt = MONEY_FORMAT;
    });
    summary.addRow([]);
  };
  addSection("Financial overview", [
    ["Gross amount", financial.summary.gross_amount],
    ["Total discounts", financial.summary.total_discounts],
    ["Overall income", financial.summary.overall_income],
    ["Overall expenses", financial.summary.overall_expenses],
    ["Net revenue", financial.summary.net_revenue],
  ]);
  addSection("Revenue", [
    ["Playhouse revenue", financial.summary.playhouse_revenue],
    ["Birthday revenue", financial.summary.birthday_revenue],
    ["Cafe revenue", financial.summary.cafe_revenue],
  ]);
  addSection("Discounts", [
    ["Booking discounts", financial.summary.booking_discounts],
    ["Sales discounts", financial.summary.sale_discounts],
  ]);
  addSection("Outgoing", [
    ["Wastage loss", financial.summary.wastage_loss],
    ["Operating expenses", financial.summary.expense_loss],
    ["Supplier purchases", financial.summary.supplier_purchase_cost],
  ]);
  addSection("Activity", [
    ["Checked-in bookings", financial.counts.bookings],
    ["Completed sales", financial.counts.sales],
    ["Expense records", financial.counts.expenses],
    ["Supplier purchases", financial.counts.supplier_purchases],
    ["Wastage records", financial.counts.wastage_records],
  ], false);
  summary.views = [{ state: "frozen", ySplit: 5 }];
  summary.getColumn(2).alignment = { horizontal: "right" };

  addDataSheet(workbook, "Daily Summary", [
    { header: "Date", key: "date", width: 16 },
    { header: "Booking Revenue", key: "bookings", width: 20, style: "money" },
    { header: "Sales Revenue", key: "sales", width: 18, style: "money" },
    { header: "Income", key: "income", width: 18, style: "money" },
    { header: "Expenses", key: "expenses", width: 18, style: "money" },
    { header: "Purchases", key: "purchases", width: 18, style: "money" },
    { header: "Wastage", key: "wastage", width: 18, style: "money" },
    { header: "Outgoing", key: "outgoing", width: 18, style: "money" },
    { header: "Net", key: "net", width: 18, style: "money" },
  ], insights.daily);

  addDataSheet(workbook, "Bookings", [
    { header: "Check-in Date", key: "checkedInAt", width: 22, style: "datetime" },
    { header: "Reference", key: "reference", width: 18 },
    { header: "Branch", key: "branch", width: 22 },
    { header: "Booking Type", key: "type", width: 22 },
    { header: "Parent / Customer", key: "customer", width: 24 },
    { header: "Phone", key: "phone", width: 18 },
    { header: "Children", key: "children", width: 12 },
    { header: "Booking Date", key: "bookingDate", width: 16, style: "date" },
    { header: "Time", key: "time", width: 18 },
    { header: "Subtotal", key: "subtotal", width: 16, style: "money" },
    { header: "Discount Type", key: "discountType", width: 17 },
    { header: "Discount Value (Rate / Amount)", key: "discountValue", width: 28, style: "decimal" },
    { header: "POS Discount", key: "discount", width: 16, style: "money" },
    { header: "Website Benefit", key: "externalDiscount", width: 18, style: "money" },
    { header: "Total", key: "total", width: 16, style: "money" },
    { header: "Collected at Check-in", key: "collected", width: 21, style: "money" },
    { header: "Payment Method", key: "method", width: 17 },
    { header: "Checked in by", key: "staff", width: 20 },
    { header: "Note", key: "note", width: 28 },
  ], data.checkins.map(checkin => ({
    checkedInAt: localExcelDate(checkin.checked_in_at), reference: checkin.booking.reference_no, branch: checkin.branch.name,
    type: formatEnum(checkin.booking.booking_type), customer: checkin.booking.parent_name, phone: checkin.booking.parent_phone ?? "",
    children: checkin.booking.child_count, bookingDate: localExcelDate(checkin.booking.booking_date),
    time: `${checkin.booking.start_time} – ${checkin.booking.end_time}`,
    subtotal: number(checkin.booking.subtotal ?? checkin.booking.total_price), discountType: formatEnum(checkin.booking.discount_type),
    discountValue: number(checkin.booking.discount_value), discount: number(checkin.booking.discount),
    externalDiscount: number(checkin.booking.external_discount), total: number(checkin.booking.total_price),
    collected: number(checkin.amount_collected), method: checkin.payment_method ? formatEnum(checkin.payment_method) : "",
    staff: checkin.staff.name, note: checkin.note ?? "",
  })));

  addDataSheet(workbook, "Booking Items", [
    { header: "Reference", key: "reference", width: 18 }, { header: "Branch", key: "branch", width: 22 },
    { header: "Item", key: "item", width: 28 }, { header: "Category", key: "category", width: 22 },
    { header: "Quantity", key: "quantity", width: 14, style: "number" }, { header: "Unit Price", key: "unitPrice", width: 16, style: "money" },
    { header: "Line Total", key: "lineTotal", width: 16, style: "money" },
  ], data.checkins.flatMap(checkin => checkin.booking.items.map(item => ({
    reference: checkin.booking.reference_no, branch: checkin.branch.name, item: item.item_name,
    category: formatEnum(item.item_category), quantity: number(item.quantity), unitPrice: number(item.unit_price), lineTotal: number(item.line_total),
  }))));

  addDataSheet(workbook, "Sales", [
    { header: "Sale Date", key: "createdAt", width: 22, style: "datetime" }, { header: "Sale No.", key: "saleNo", width: 20 },
    { header: "Receipt No.", key: "receiptNo", width: 20 }, { header: "Branch", key: "branch", width: 22 },
    { header: "Cashier", key: "cashier", width: 20 }, { header: "Payment Method", key: "method", width: 17 },
    { header: "Subtotal", key: "subtotal", width: 16, style: "money" }, { header: "Discount Type", key: "discountType", width: 17 },
    { header: "Discount Value (Rate / Amount)", key: "discountValue", width: 28, style: "decimal" }, { header: "Discount", key: "discount", width: 16, style: "money" },
    { header: "Total", key: "total", width: 16, style: "money" }, { header: "Amount Received", key: "received", width: 19, style: "money" },
    { header: "Change", key: "change", width: 16, style: "money" },
  ], data.sales.map(sale => ({
    createdAt: localExcelDate(sale.created_at), saleNo: sale.sale_no, receiptNo: sale.transaction?.receipt_no ?? "", branch: sale.branch.name,
    cashier: sale.cashier.name, method: formatEnum(sale.payment_method), subtotal: number(sale.subtotal), discountType: formatEnum(sale.discount_type),
    discountValue: number(sale.discount_value), discount: number(sale.discount), total: number(sale.total), received: number(sale.amount_received), change: number(sale.change_given),
  })));

  addDataSheet(workbook, "Sale Items", [
    { header: "Sale No.", key: "saleNo", width: 20 }, { header: "Branch", key: "branch", width: 22 },
    { header: "Product", key: "product", width: 28 }, { header: "Quantity", key: "quantity", width: 14, style: "number" },
    { header: "Unit Price", key: "unitPrice", width: 16, style: "money" }, { header: "Unit Cost", key: "unitCost", width: 16, style: "money" },
    { header: "Line Total", key: "lineTotal", width: 16, style: "money" }, { header: "Gross Profit", key: "profit", width: 16, style: "money" },
  ], data.sales.flatMap(sale => sale.items.map(item => ({
    saleNo: sale.sale_no, branch: sale.branch.name, product: item.product_name, quantity: number(item.quantity), unitPrice: number(item.unit_price),
    unitCost: number(item.unit_cost), lineTotal: number(item.line_total), profit: number(item.line_total) - number(item.quantity) * number(item.unit_cost),
  }))));

  addDataSheet(workbook, "Payments", [
    { header: "Paid At", key: "paidAt", width: 22, style: "datetime" }, { header: "Branch", key: "branch", width: 22 },
    { header: "Direction", key: "direction", width: 15 }, { header: "Source", key: "source", width: 15 },
    { header: "Source Reference", key: "sourceReference", width: 28 }, { header: "Method", key: "method", width: 15 },
    { header: "Amount", key: "amount", width: 17, style: "money" }, { header: "Reference", key: "reference", width: 24 },
    { header: "Recorded By", key: "staff", width: 20 }, { header: "Note", key: "note", width: 28 },
  ], data.payments.map(payment => ({
    paidAt: localExcelDate(payment.paid_at), branch: payment.branch.name, direction: formatEnum(payment.direction), source: formatEnum(payment.source),
    sourceReference: sourceReference(payment), method: formatEnum(payment.method), amount: number(payment.amount), reference: payment.reference ?? "",
    staff: payment.staff.name, note: payment.note ?? "",
  })));

  addDataSheet(workbook, "Expenses", [
    { header: "Date", key: "date", width: 22, style: "datetime" }, { header: "Branch", key: "branch", width: 22 },
    { header: "Expense Type", key: "type", width: 22 }, { header: "Description", key: "description", width: 36 },
    { header: "Amount", key: "amount", width: 17, style: "money" }, { header: "Recorded By", key: "staff", width: 20 },
  ], data.expenses.map(expense => ({
    date: localExcelDate(expense.incurred_at), branch: expense.branch.name, type: expense.expense_type.name,
    description: expense.description, amount: number(expense.amount), staff: expense.staff.name,
  })));

  addDataSheet(workbook, "Purchases", [
    { header: "Date", key: "date", width: 22, style: "datetime" }, { header: "Purchase No.", key: "purchaseNo", width: 20 },
    { header: "Branch", key: "branch", width: 22 }, { header: "Supplier", key: "supplier", width: 24 },
    { header: "Status", key: "status", width: 18 }, { header: "Total", key: "total", width: 17, style: "money" },
    { header: "Amount Paid", key: "paid", width: 17, style: "money" }, { header: "Balance Due", key: "balance", width: 17, style: "money" },
    { header: "Recorded By", key: "staff", width: 20 }, { header: "Note", key: "note", width: 28 },
  ], data.purchases.map(purchase => ({
    date: localExcelDate(purchase.purchased_at), purchaseNo: purchase.purchase_no, branch: purchase.branch.name, supplier: purchase.supplier.name,
    status: formatEnum(purchase.status), total: number(purchase.total), paid: number(purchase.amount_paid), balance: number(purchase.balance_due),
    staff: purchase.staff.name, note: purchase.note ?? "",
  })));

  addDataSheet(workbook, "Purchase Items", [
    { header: "Purchase No.", key: "purchaseNo", width: 20 }, { header: "Branch", key: "branch", width: 22 },
    { header: "Supplier", key: "supplier", width: 24 }, { header: "Product", key: "product", width: 28 },
    { header: "Quantity", key: "quantity", width: 14, style: "number" }, { header: "Unit Cost", key: "unitCost", width: 16, style: "money" },
    { header: "Selling Price", key: "sellingPrice", width: 17, style: "money" }, { header: "Line Total", key: "lineTotal", width: 17, style: "money" },
  ], data.purchases.flatMap(purchase => purchase.items.map(item => ({
    purchaseNo: purchase.purchase_no, branch: purchase.branch.name, supplier: purchase.supplier.name, product: item.product.name,
    quantity: number(item.quantity), unitCost: number(item.unit_cost), sellingPrice: number(item.selling_price), lineTotal: number(item.line_total),
  }))));

  addDataSheet(workbook, "Wastage", [
    { header: "Date", key: "date", width: 22, style: "datetime" }, { header: "Branch", key: "branch", width: 22 },
    { header: "Product", key: "product", width: 28 }, { header: "Quantity", key: "quantity", width: 14, style: "number" },
    { header: "Unit Cost", key: "unitCost", width: 16, style: "money" }, { header: "Loss", key: "loss", width: 17, style: "money" },
    { header: "Recorded By", key: "staff", width: 20 }, { header: "Note", key: "note", width: 30 },
  ], data.wastage.map(item => ({
    date: localExcelDate(item.created_at), branch: item.branch.name, product: item.product.name, quantity: number(item.quantity),
    unitCost: number(item.unit_cost), loss: number(item.quantity) * number(item.unit_cost), staff: item.staff.name, note: item.note ?? "",
  })));

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function pdfBuffer(document: PDFKit.PDFDocument) {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    document.on("data", chunk => chunks.push(Buffer.from(chunk)));
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);
    document.end();
  });
}

export async function buildPdfReport(options: {
  data: ReportExportData;
  financial: FinancialReport;
  branchName: string;
  from: Date;
  to: Date;
}) {
  const { data, financial, branchName, from, to } = options;
  const insights = analysis(data);
  const document = new PDFDocument({ size: "A4", margins: { top: 58, right: 46, bottom: 54, left: 46 }, bufferPages: true, info: { Title: "JAS KIDS Financial & Operations Report", Author: "JAS KIDS POS" } });
  const pageWidth = document.page.width - document.page.margins.left - document.page.margins.right;
  const currency = (value: number) => `Rs. ${value.toLocaleString("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const ensureSpace = (height: number) => { if (document.y + height > document.page.height - document.page.margins.bottom) document.addPage(); };
  const section = (title: string) => {
    ensureSpace(42);
    document.moveDown(0.7).fillColor(`#${BRAND_DARK}`).font("Helvetica-Bold").fontSize(12).text(title);
    document.moveDown(0.35).strokeColor(`#${BORDER}`).lineWidth(1).moveTo(document.page.margins.left, document.y).lineTo(document.page.width - document.page.margins.right, document.y).stroke();
    document.moveDown(0.45);
  };
  const table = (headers: string[], rows: string[][], widths: number[]) => {
    const rowHeight = 24;
    const drawRow = (values: string[], header = false) => {
      if (!header && document.y + rowHeight + 4 > document.page.height - document.page.margins.bottom) {
        document.addPage();
        drawRow(headers, true);
      }
      const y = document.y;
      let x = document.page.margins.left;
      if (header) document.rect(x, y, widths.reduce((sum, width) => sum + width, 0), rowHeight).fill(`#${BRAND}`);
      values.forEach((value, index) => {
        document.fillColor(header ? "#FFFFFF" : `#${BRAND_DARK}`).font(header ? "Helvetica-Bold" : "Helvetica").fontSize(8.5)
          .text(value, x + 6, y + 7, { width: widths[index] - 12, height: rowHeight - 8, ellipsis: true, align: index === 0 ? "left" : "right" });
        x += widths[index];
      });
      if (!header) document.strokeColor("#E3ECE8").moveTo(document.page.margins.left, y + rowHeight).lineTo(document.page.width - document.page.margins.right, y + rowHeight).stroke();
      document.y = y + rowHeight;
    };
    drawRow(headers, true);
    if (!rows.length) drawRow(["No records for this period", ...headers.slice(1).map(() => "")]);
    rows.forEach(row => drawRow(row));
  };

  document.rect(0, 0, document.page.width, 126).fill(`#${BRAND_DARK}`);
  document.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(22).text("JAS KIDS", 46, 38);
  document.fillColor(`#${GOLD}`).fontSize(10).text("FINANCIAL & OPERATIONS REPORT", 46, 70);
  document.fillColor("#DDEAE5").font("Helvetica").fontSize(9)
    .text(`${branchName}  •  ${sriLankaDate.format(from)} to ${sriLankaDate.format(to)}`, 46, 91)
    .text(`Generated ${sriLankaDateTime.format(new Date())}`, 46, 106);
  document.y = 148;

  const cards = [
    ["INCOME", financial.summary.overall_income],
    ["EXPENSES", financial.summary.overall_expenses],
    ["NET REVENUE", financial.summary.net_revenue],
  ] as const;
  const cardGap = 10;
  const cardWidth = (pageWidth - cardGap * 2) / 3;
  cards.forEach(([label, value], index) => {
    const x = document.page.margins.left + index * (cardWidth + cardGap);
    document.roundedRect(x, 148, cardWidth, 62, 5).fillAndStroke(index === 2 ? `#${LIGHT}` : "#F7FAF8", `#${BORDER}`);
    document.fillColor(`#${BRAND}`).font("Helvetica-Bold").fontSize(7.5).text(label, x + 10, 160, { width: cardWidth - 20 });
    document.fillColor(`#${BRAND_DARK}`).fontSize(11).text(currency(value), x + 10, 180, { width: cardWidth - 20, ellipsis: true });
  });
  document.y = 220;

  section("Revenue and discounts");
  table(["Category", "Amount"], [
    ["Gross amount", currency(financial.summary.gross_amount)],
    ["Booking discounts", currency(financial.summary.booking_discounts)],
    ["Sales discounts", currency(financial.summary.sale_discounts)],
    ["Playhouse revenue", currency(financial.summary.playhouse_revenue)],
    ["Birthday revenue", currency(financial.summary.birthday_revenue)],
    ["Cafe revenue", currency(financial.summary.cafe_revenue)],
  ], [pageWidth * 0.6, pageWidth * 0.4]);

  section("Outgoing and activity");
  table(["Category", "Amount / Count"], [
    ["Wastage loss", currency(financial.summary.wastage_loss)],
    ["Operating expenses", currency(financial.summary.expense_loss)],
    ["Supplier purchases", currency(financial.summary.supplier_purchase_cost)],
    ["Checked-in bookings", String(financial.counts.bookings)],
    ["Completed sales", String(financial.counts.sales)],
  ], [pageWidth * 0.6, pageWidth * 0.4]);

  section("Payment method split");
  table(["Method", "Recorded incoming payments"], insights.paymentMethods.map(item => [item.method, currency(item.amount)]), [pageWidth * 0.6, pageWidth * 0.4]);

  section("Daily performance");
  table(["Date", "Income", "Outgoing", "Net"], insights.daily.map(item => [item.date, currency(item.income), currency(item.outgoing), currency(item.net)]), [pageWidth * 0.25, pageWidth * 0.25, pageWidth * 0.25, pageWidth * 0.25]);

  section("Top cafe products");
  table(["Product", "Qty", "Revenue"], insights.products.slice(0, 15).map(item => [item.product, item.quantity.toLocaleString("en-LK"), currency(item.revenue)]), [pageWidth * 0.5, pageWidth * 0.16, pageWidth * 0.34]);

  const range = document.bufferedPageRange();
  for (let index = 0; index < range.count; index += 1) {
    document.switchToPage(index);
    document.fillColor("#71867D").font("Helvetica").fontSize(8)
      .text("JAS KIDS POS • Confidential management report", document.page.margins.left, document.page.height - 34, { width: pageWidth * 0.75 })
      .text(`Page ${index + 1} of ${range.count}`, document.page.margins.left + pageWidth * 0.75, document.page.height - 34, { width: pageWidth * 0.25, align: "right" });
  }
  return pdfBuffer(document);
}
