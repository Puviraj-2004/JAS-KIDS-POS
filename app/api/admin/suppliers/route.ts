import { ItemCategory, PaymentDirection, PaymentMethod, PaymentSource, Prisma, PurchaseStatus, Role, StockMovementType } from "@prisma/client";
import { NextResponse } from "next/server";
import { getCurrentStaff } from "@/lib/auth";
import { canManageInventory, canUseBranch, changeStock, positiveNumber } from "@/lib/inventory";
import { prisma } from "@/lib/prisma";

type PurchaseLine = { productId: string; quantity: number | null; unitCost: number | null; sellingPrice: number | null };
const stockCategories = [ItemCategory.CAFE_ITEM, ItemCategory.BIRTHDAY_ITEM, ItemCategory.OTHER_ITEM];

function supplierScope(staff: Awaited<ReturnType<typeof getCurrentStaff>>) {
  if (!staff) return {};
  return staff.role === Role.BRANCH_ADMIN ? { branch_id: staff.branch_id! } : {};
}

function visibleSupplierScope(staff: Awaited<ReturnType<typeof getCurrentStaff>>) {
  if (!staff) return {};
  return staff.role === Role.BRANCH_ADMIN ? { branch_id: staff.branch_id! } : {};
}

export async function GET(request: Request) {
  const staff = await getCurrentStaff(request);
  if (!staff) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageInventory(staff)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (staff.role === Role.BRANCH_ADMIN && !staff.branch_id) return NextResponse.json({ error: "Branch Admin needs an assigned branch" }, { status: 403 });
  const requestedBranch = new URL(request.url).searchParams.get("branch_id");
  const branchId = staff.role === Role.SUPER_ADMIN ? requestedBranch : staff.branch_id;
  const suppliers = await prisma.supplier.findMany({ where: { is_active: true, ...visibleSupplierScope(staff), ...(branchId ? { branch_id: branchId } : {}) }, include: { branch: { select: { name: true } } }, orderBy: { name: "asc" } });
  const purchases = await prisma.supplierPurchase.findMany({ where: branchId ? { branch_id: branchId } : {}, include: { supplier: true, branch: true, items: { include: { product: true } } }, orderBy: { purchased_at: "desc" } });
  const payments = await prisma.payment.findMany({ where: { source: PaymentSource.PURCHASE, ...(branchId ? { branch_id: branchId } : {}) }, include: { branch: true, purchase: { include: { supplier: true } } }, orderBy: { paid_at: "desc" }, take: 100 });
  const products = await prisma.product.findMany({ where: { is_active: true, item_category: { in: stockCategories }, ...(branchId ? { branch_id: branchId } : {}) }, orderBy: { name: "asc" } });
  const branches = await prisma.branch.findMany({ where: { is_active: true, ...(staff.role === Role.BRANCH_ADMIN ? { id: staff.branch_id! } : {}) }, orderBy: { name: "asc" } });
  return NextResponse.json({ success: true, can_manage: staff.role === Role.BRANCH_ADMIN, can_manage_catalogue: staff.role === Role.SUPER_ADMIN, can_select_branch: staff.role === Role.SUPER_ADMIN, selected_branch_id: branchId, suppliers, purchases, payments, products, branches });
}

export async function POST(request: Request) {
  const staff = await getCurrentStaff(request);
  if (!staff) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageInventory(staff)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (staff.role === Role.BRANCH_ADMIN && !staff.branch_id) return NextResponse.json({ error: "Branch Admin needs an assigned branch" }, { status: 403 });
  if (staff.role !== Role.BRANCH_ADMIN) return NextResponse.json({ error: "Only Branch Admin can manage supplier operations" }, { status: 403 });
  const body = await request.json().catch(() => null);
  try {
    if (body?.action === "create_supplier") {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      const supplierBranchId = staff.branch_id!;
      if (!name) return NextResponse.json({ error: "Supplier name is required" }, { status: 400 });
      if (supplierBranchId && !canUseBranch(staff, supplierBranchId)) return NextResponse.json({ error: "A permitted branch is required" }, { status: 403 });
      const supplier = await prisma.supplier.create({ data: { branch_id: supplierBranchId, name, phone: body.phone?.trim() || null, address: body.address?.trim() || null } });
      await prisma.auditLog.create({ data: { staff_id: staff.id, branch_id: supplierBranchId, action: "SUPPLIER_CREATED", entity_type: "Supplier", entity_id: supplier.id, new_value: { name, branch_id: supplierBranchId } } });
      return NextResponse.json({ success: true, id: supplier.id }, { status: 201 });
    }
    if (body?.action === "update_supplier") {
      const id = typeof body.id === "string" ? body.id : "";
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (!id || !name) return NextResponse.json({ error: "Supplier and name are required" }, { status: 400 });
      const supplier = await prisma.supplier.findFirst({ where: { id, is_active: true, ...supplierScope(staff) } });
      if (!supplier) return NextResponse.json({ error: "Supplier not found or cannot be edited by this role" }, { status: 404 });
      await prisma.supplier.update({ where: { id }, data: { name, phone: body.phone?.trim() || null, address: body.address?.trim() || null } });
      await prisma.auditLog.create({ data: { staff_id: staff.id, branch_id: supplier.branch_id, action: "SUPPLIER_UPDATED", entity_type: "Supplier", entity_id: id, new_value: { name } } });
      return NextResponse.json({ success: true, id });
    }
    if (body?.action === "delete_supplier") {
      const id = typeof body.id === "string" ? body.id : "";
      if (!id) return NextResponse.json({ error: "Supplier is required" }, { status: 400 });
      const supplier = await prisma.supplier.findFirst({ where: { id, is_active: true, ...supplierScope(staff) }, include: { _count: { select: { purchases: true } } } });
      if (!supplier) return NextResponse.json({ error: "Supplier not found or cannot be deleted by this role" }, { status: 404 });
      const paymentCount = await prisma.payment.count({ where: { purchase: { supplier_id: id } } });
      if (supplier._count.purchases || paymentCount) {
        await prisma.supplier.update({ where: { id }, data: { is_active: false } });
      } else {
        await prisma.supplier.delete({ where: { id } });
      }
      await prisma.auditLog.create({ data: { staff_id: staff.id, branch_id: supplier.branch_id, action: "SUPPLIER_DELETED", entity_type: "Supplier", entity_id: id, old_value: { name: supplier.name } } });
      return NextResponse.json({ success: true, id });
    }
    const branchId = staff.branch_id!;
    if (!branchId || !canUseBranch(staff, branchId)) return NextResponse.json({ error: "A permitted branch is required" }, { status: 403 });
    if (body?.action === "create_purchase") {
      const supplierId = typeof body.supplier_id === "string" ? body.supplier_id : "";
      const supplier = supplierId ? await prisma.supplier.findFirst({ where: { id: supplierId, is_active: true, OR: [{ branch_id: branchId }, { branch_id: null }] } }) : null;
      const items: PurchaseLine[] = Array.isArray(body.items) ? body.items.map((item: Record<string, unknown>) => ({ productId: typeof item.product_id === "string" ? item.product_id : "", quantity: positiveNumber(item.quantity), unitCost: positiveNumber(item.unit_cost), sellingPrice: positiveNumber(item.selling_price) })) : [];
      if (!supplier || items.length === 0 || items.some(item => !item.productId || !item.quantity || !item.unitCost || !item.sellingPrice)) return NextResponse.json({ error: "Supplier, product, quantity, buying price, and selling price are required" }, { status: 400 });
      const productCount = await prisma.product.count({ where: { id: { in: items.map(item => item.productId) }, branch_id: branchId, is_active: true, item_category: { in: stockCategories } } });
      if (productCount !== new Set(items.map(item => item.productId)).size) return NextResponse.json({ error: "Only active stock products can be received" }, { status: 400 });
      const total = items.reduce((sum, item) => sum + item.quantity! * item.unitCost!, 0);
      const amountPaid = Number(body.amount_paid ?? 0);
      if (!Number.isFinite(amountPaid) || amountPaid < 0 || amountPaid > total) return NextResponse.json({ error: "Amount paid must be between zero and the purchase total" }, { status: 400 });
      const paymentMethod = Object.values(PaymentMethod).includes(body.payment_method) ? body.payment_method as PaymentMethod : null;
      if (amountPaid > 0 && !paymentMethod) return NextResponse.json({ error: "Payment method is required when recording a payment" }, { status: 400 });
      const balance = total - amountPaid;
      const status = balance === 0 ? PurchaseStatus.PAID : amountPaid > 0 ? PurchaseStatus.PARTIALLY_PAID : PurchaseStatus.RECEIVED;
      const purchaseNo = `PUR-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;
      const purchase = await prisma.$transaction(async transaction => {
        const created = await transaction.supplierPurchase.create({ data: { purchase_no: purchaseNo, supplier_id: supplierId, branch_id: branchId, status, total, amount_paid: amountPaid, balance_due: balance, note: body.note?.trim() || null, created_by: staff.id, items: { create: items.map(item => ({ product_id: item.productId, quantity: item.quantity!, unit_cost: item.unitCost!, selling_price: item.sellingPrice!, line_total: item.quantity! * item.unitCost! })) } }, include: { items: true } });
        for (const purchaseItem of created.items) {
          await transaction.stockBatch.create({ data: { branch_id: branchId, product_id: purchaseItem.product_id, supplier_purchase_item_id: purchaseItem.id, quantity_received: purchaseItem.quantity, quantity_remaining: purchaseItem.quantity, buying_price: purchaseItem.unit_cost, selling_price: purchaseItem.selling_price, received_by: staff.id, received_at: created.purchased_at } });
          await changeStock(transaction, { branchId, productId: purchaseItem.product_id, type: StockMovementType.PURCHASE, quantity: Number(purchaseItem.quantity), unitCost: Number(purchaseItem.unit_cost), sellingPrice: Number(purchaseItem.selling_price), staffId: staff.id, referenceType: "SUPPLIER_PURCHASE", referenceId: created.id, note: body.note ?? null });
        }
        if (amountPaid > 0) await transaction.payment.create({ data: { branch_id: branchId, direction: PaymentDirection.OUTGOING, source: PaymentSource.PURCHASE, purchase_id: created.id, amount: amountPaid, method: paymentMethod!, paid_by: staff.id, note: "Payment recorded with purchase" } });
        await transaction.auditLog.create({ data: { staff_id: staff.id, branch_id: branchId, action: "SUPPLIER_PURCHASE_RECEIVED", entity_type: "SupplierPurchase", entity_id: created.id, new_value: { purchase_no: purchaseNo, supplier_id: supplierId, total, amount_paid: amountPaid } } });
        return created;
      });
      return NextResponse.json({ success: true, id: purchase.id, purchase_no: purchase.purchase_no }, { status: 201 });
    }
    if (body?.action === "record_payment") {
      const amount = positiveNumber(body.amount);
      const method = Object.values(PaymentMethod).includes(body.method) ? body.method as PaymentMethod : null;
      const purchase = await prisma.supplierPurchase.findFirst({ where: { id: body.purchase_id, branch_id: branchId }, include: { supplier: true } });
      if (!purchase || !amount || !method) return NextResponse.json({ error: "Valid purchase, amount, and payment method are required" }, { status: 400 });
      if (amount > Number(purchase.balance_due)) return NextResponse.json({ error: "Payment cannot exceed the outstanding balance" }, { status: 400 });
      const payment = await prisma.$transaction(async transaction => {
        const updated = await transaction.supplierPurchase.updateMany({ where: { id: purchase.id, branch_id: branchId, balance_due: { gte: amount } }, data: { amount_paid: { increment: amount }, balance_due: { decrement: amount } } });
        if (updated.count !== 1) throw new Error("PAYMENT_EXCEEDS_BALANCE");
        const updatedPurchase = await transaction.supplierPurchase.findUniqueOrThrow({ where: { id: purchase.id } });
        await transaction.supplierPurchase.update({ where: { id: purchase.id }, data: { status: Number(updatedPurchase.balance_due) === 0 ? PurchaseStatus.PAID : PurchaseStatus.PARTIALLY_PAID } });
        const created = await transaction.payment.create({ data: { branch_id: branchId, direction: PaymentDirection.OUTGOING, source: PaymentSource.PURCHASE, purchase_id: purchase.id, amount, method, reference: body.reference?.trim() || null, note: body.note?.trim() || null, paid_by: staff.id } });
        await transaction.auditLog.create({ data: { staff_id: staff.id, branch_id: branchId, action: "SUPPLIER_PAYMENT_RECORDED", entity_type: "Payment", entity_id: created.id, new_value: { purchase_id: purchase.id, amount, method } } });
        return created;
      });
      return NextResponse.json({ success: true, id: payment.id });
    }
    return NextResponse.json({ error: "Invalid supplier action" }, { status: 400 });
  } catch (error) {
    if (error instanceof Error && error.message === "PAYMENT_EXCEEDS_BALANCE") return NextResponse.json({ error: "Payment exceeds the current outstanding balance" }, { status: 409 });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") return NextResponse.json({ error: "A selected supplier, product, or branch does not exist" }, { status: 400 });
    return NextResponse.json({ error: "Supplier operation could not be completed" }, { status: 500 });
  }
}
