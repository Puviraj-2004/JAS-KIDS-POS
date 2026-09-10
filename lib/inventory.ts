import { Prisma, StockMovementType, type Staff } from "@prisma/client";

export function canManageInventory(staff: Staff) {
  return staff.role === "SUPER_ADMIN" || staff.role === "BRANCH_ADMIN";
}

export function canUseStockModule(staff: Staff) {
  return staff.role === "SUPER_ADMIN" || staff.role === "BRANCH_ADMIN" || staff.role === "CASHIER";
}

export function canUseBranch(staff: Staff, branchId: string) {
  return staff.role === "SUPER_ADMIN" || staff.branch_id === branchId;
}

export function positiveNumber(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

export async function getWeightedAverageUnitCost(transaction: Prisma.TransactionClient, branchId: string, productId: string) {
  const batches = await transaction.stockBatch.findMany({
    where: { branch_id: branchId, product_id: productId, quantity_remaining: { gt: 0 } },
    select: { quantity_remaining: true, buying_price: true },
  });
  const totals = batches.reduce((summary, batch) => {
    const quantity = Number(batch.quantity_remaining);
    const unitCost = Number(batch.buying_price);
    return { quantity: summary.quantity + quantity, cost: summary.cost + quantity * unitCost };
  }, { quantity: 0, cost: 0 });
  return totals.quantity > 0 ? Math.round((totals.cost / totals.quantity) * 100) / 100 : 0;
}

export async function changeStock(
  transaction: Prisma.TransactionClient,
  input: {
    branchId: string;
    productId: string;
    type: StockMovementType;
    quantity: number;
    staffId: string;
    unitCost?: number | null;
    sellingPrice?: number | null;
    referenceType?: string | null;
    referenceId?: string | null;
    note?: string | null;
  },
) {
  return transaction.stockMovement.create({ data: {
    branch_id: input.branchId, product_id: input.productId, type: input.type, quantity: input.quantity,
    unit_cost: input.unitCost, selling_price: input.sellingPrice, reference_type: input.referenceType, reference_id: input.referenceId,
    note: input.note, performed_by: input.staffId,
  } });
}
