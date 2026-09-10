import { PaymentMethod, Role, type Staff } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export function parsePaymentMethod(value: unknown): PaymentMethod | null {
  return typeof value === "string" && Object.values(PaymentMethod).includes(value as PaymentMethod)
    ? value as PaymentMethod
    : null;
}

export async function resolveSaleBranch(staff: Staff, requestedBranchId?: string | null) {
  if (staff.role !== Role.SUPER_ADMIN) {
    if (!staff.branch_id) return null;
    return prisma.branch.findFirst({ where: { id: staff.branch_id, is_active: true } });
  }

  if (requestedBranchId) {
    return prisma.branch.findFirst({ where: { id: requestedBranchId, is_active: true } });
  }

  return prisma.branch.findFirst({ where: { is_active: true }, orderBy: { name: "asc" } });
}

export function canCancelSale(staff: Staff) {
  return staff.role === Role.SUPER_ADMIN;
}
