import { Prisma, Role, SaleStatus, StockMovementType } from "@prisma/client";
import { NextResponse } from "next/server";
import { getCurrentStaff } from "@/lib/auth";
import { changeStock } from "@/lib/inventory";
import { prisma } from "@/lib/prisma";
import { canCancelSale } from "@/lib/sales";

async function findPermittedSale(id: string, staff: Awaited<ReturnType<typeof getCurrentStaff>>) {
  if (!staff) return null;
  return prisma.sale.findFirst({
    where: { id, ...(staff.role === Role.SUPER_ADMIN ? {} : { branch_id: staff.branch_id ?? "" }) },
    include: {
      branch: true,
      cashier: { select: { id: true, name: true } },
      cancelled_by_staff: { select: { name: true } },
      items: { orderBy: { product_name: "asc" } },
      transaction: { include: { receipt: true } },
    },
  });
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const staff = await getCurrentStaff(request);
  if (!staff) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const sale = await findPermittedSale(id, staff);
  if (!sale) return NextResponse.json({ error: "Sale not found" }, { status: 404 });
  return NextResponse.json({ success: true, viewer_role: staff.role, can_cancel: canCancelSale(staff), sale });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const staff = await getCurrentStaff(request);
  if (!staff) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const { id } = await params;
  const sale = await findPermittedSale(id, staff);
  if (!sale) return NextResponse.json({ error: "Sale not found" }, { status: 404 });

  if (body?.action === "mark_printed") {
    if (sale.transaction?.receipt) await prisma.receipt.update({ where: { id: sale.transaction.receipt.id }, data: { printed_at: new Date() } });
    return NextResponse.json({ success: true });
  }

  if (body?.action !== "cancel") return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  if (!canCancelSale(staff)) return NextResponse.json({ error: "Only an administrator can cancel sales" }, { status: 403 });
  if (sale.status === SaleStatus.CANCELLED) return NextResponse.json({ error: "This sale is already cancelled" }, { status: 400 });
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (reason.length < 3) return NextResponse.json({ error: "Enter a cancellation reason" }, { status: 400 });

  try {
    await prisma.$transaction(async (transaction) => {
      const updated = await transaction.sale.updateMany({
        where: { id: sale.id, status: SaleStatus.COMPLETED },
        data: { status: SaleStatus.CANCELLED, cancelled_at: new Date(), cancelled_by: staff.id, cancellation_reason: reason },
      });
      if (updated.count !== 1) throw new Error("ALREADY_CANCELLED");
      for (const item of sale.items) {
        if (item.stock_batch_id) await transaction.stockBatch.update({ where: { id: item.stock_batch_id }, data: { quantity_remaining: { increment: item.quantity } } });
        await changeStock(transaction, {
          branchId: sale.branch_id,
          productId: item.product_id,
          type: StockMovementType.SALE_REVERSAL,
          quantity: Number(item.quantity),
          staffId: staff.id,
          unitCost: Number(item.unit_cost),
          sellingPrice: Number(item.unit_price),
          referenceType: "SALE_CANCELLATION",
          referenceId: sale.id,
          note: reason,
        });
      }
      await transaction.auditLog.create({ data: {
        staff_id: staff.id,
        branch_id: sale.branch_id,
        action: "PRODUCT_SALE_CANCELLED",
        entity_type: "Sale",
        entity_id: sale.id,
        old_value: { status: SaleStatus.COMPLETED },
        new_value: { status: SaleStatus.CANCELLED, reason },
      } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "ALREADY_CANCELLED") return NextResponse.json({ error: "This sale is already cancelled" }, { status: 400 });
    return NextResponse.json({ error: "The sale could not be cancelled" }, { status: 500 });
  }
}
