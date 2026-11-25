import { ItemCategory, Role, StockMovementType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentStaff } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sriLankaDateBoundary, todaySriLanka } from "@/lib/date";

export const dynamic = "force-dynamic";

const stockCategories: ItemCategory[] = [ItemCategory.CAFE_ITEM, ItemCategory.BIRTHDAY_ITEM, ItemCategory.OTHER_ITEM];
const incoming = new Set<StockMovementType>([StockMovementType.PURCHASE, StockMovementType.SALE_REVERSAL, StockMovementType.ADJUSTMENT_IN, StockMovementType.TRANSFER_IN]);
const safeDate = (value: string | null, fallback: string) => value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;

export async function GET(request: NextRequest) {
  const staff = await getCurrentStaff(request);
  if (!staff) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const params = request.nextUrl.searchParams;
  const branchId = staff.role === Role.SUPER_ADMIN ? params.get("branch_id") : staff.branch_id;
  if (!branchId) return NextResponse.json({ error: "Select a branch" }, { status: 400 });
  const branch = await prisma.branch.findFirst({ where: { id: branchId, is_active: true }, select: { id: true, name: true } });
  if (!branch) return NextResponse.json({ error: "Branch is unavailable" }, { status: 404 });

  const today = todaySriLanka(); const fromValue = safeDate(params.get("from"), today); const toValue = safeDate(params.get("to"), fromValue);
  if (toValue < fromValue) return NextResponse.json({ error: "End date must be on or after start date" }, { status: 400 });
  const from = sriLankaDateBoundary(fromValue, false); const endExclusive = new Date(sriLankaDateBoundary(toValue, true).getTime() + 1);
  const requestedCategory = params.get("category"); const category = stockCategories.includes(requestedCategory as ItemCategory) ? requestedCategory as ItemCategory : null;
  const search = (params.get("q") ?? "").trim();
  const products = await prisma.product.findMany({ where: { branch_id: branch.id, item_category: category ?? { in: stockCategories }, ...(search ? { name: { contains: search, mode: "insensitive" } } : {}) }, select: { id: true, name: true, item_category: true }, orderBy: { name: "asc" } });
  const branches = staff.role === Role.SUPER_ADMIN ? await prisma.branch.findMany({ where: { is_active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : [branch];
  const productIds = products.map((item) => item.id);
  if (!productIds.length) return NextResponse.json({ success: true, branch, branches, rows: [], summary: { sales_value: 0, units_sold: 0, purchase_value: 0, low_stock_count: 0 } });
  const [movements, sales] = await Promise.all([
    prisma.stockMovement.findMany({ where: { branch_id: branch.id, product_id: { in: productIds }, created_at: { lt: endExclusive } }, select: { product_id: true, type: true, quantity: true, unit_cost: true, created_at: true } }),
    prisma.sale.findMany({ where: { branch_id: branch.id, status: "COMPLETED", created_at: { gte: from, lt: endExclusive } }, select: { items: { where: { product_id: { in: productIds } }, select: { product_id: true, quantity: true, line_total: true } } } }),
  ]);
  const rows = new Map(products.map((item) => [item.id, { ...item, opening_stock: 0, purchased: 0, sold: 0, wastage: 0, closing_stock: 0, purchase_value: 0, sales_value: 0 }]));
  for (const movement of movements) { const row = rows.get(movement.product_id); if (!row) continue; const qty = Number(movement.quantity); const delta = incoming.has(movement.type) ? qty : -qty; if (movement.created_at < from) row.opening_stock += delta; else { row.closing_stock += delta; if (movement.type === StockMovementType.PURCHASE) { row.purchased += qty; row.purchase_value += qty * Number(movement.unit_cost ?? 0); } if (movement.type === StockMovementType.WASTAGE) row.wastage += qty; } }
  for (const row of Array.from(rows.values())) row.closing_stock += row.opening_stock;
  for (const sale of sales) for (const item of sale.items) { const row = rows.get(item.product_id); if (row) { row.sold += Number(item.quantity); row.sales_value += Number(item.line_total); } }
  const reportRows = Array.from(rows.values()).map((row) => ({ ...row, opening_stock: Math.max(0, row.opening_stock), closing_stock: Math.max(0, row.closing_stock) }));
  return NextResponse.json({ success: true, branch, branches, rows: reportRows, summary: { sales_value: reportRows.reduce((sum, row) => sum + row.sales_value, 0), units_sold: reportRows.reduce((sum, row) => sum + row.sold, 0), purchase_value: reportRows.reduce((sum, row) => sum + row.purchase_value, 0), low_stock_count: reportRows.filter((row) => row.closing_stock <= 5).length } });
}
