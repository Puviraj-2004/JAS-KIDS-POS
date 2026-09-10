import { ItemCategory, PaymentDirection, PaymentMethod, PaymentSource, Prisma, Role, StockMovementType } from "@prisma/client";
import { NextResponse } from "next/server";
import { getCurrentStaff } from "@/lib/auth";
import { canUseBranch, canUseStockModule, changeStock, positiveNumber } from "@/lib/inventory";
import { prisma } from "@/lib/prisma";

const stockCategories = new Set<ItemCategory>([ItemCategory.CAFE_ITEM, ItemCategory.BIRTHDAY_ITEM, ItemCategory.OTHER_ITEM]);

export async function GET(request: Request) {
  const staff = await getCurrentStaff(request);
  if (!staff) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canUseStockModule(staff)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (staff.role !== Role.SUPER_ADMIN && !staff.branch_id) return NextResponse.json({ error: "This account needs an assigned branch" }, { status: 403 });
  const requestedBranch = new URL(request.url).searchParams.get("branch_id");
  const branchId = staff.role === Role.SUPER_ADMIN ? requestedBranch : staff.branch_id;
  const productScope = branchId ? { branch_id: branchId } : {};
  const canAddStock = staff.role === Role.BRANCH_ADMIN;
  const canRecordWaste = staff.role === Role.BRANCH_ADMIN || staff.role === Role.CASHIER;
  const products = await prisma.product.findMany({ where: { is_active: true, ...productScope }, include: { branch: { select: { id: true, name: true } } }, orderBy: { name: "asc" } });
  const branches = await prisma.branch.findMany({ where: { is_active: true, ...(staff.role !== Role.SUPER_ADMIN ? { id: staff.branch_id! } : {}) }, orderBy: { name: "asc" } });
  const stockBatches = await prisma.stockBatch.findMany({ where: { ...(branchId ? { branch_id: branchId } : {}), quantity_remaining: { gt: 0 }, product: { item_category: { in: Array.from(stockCategories) }, ...productScope } }, include: { branch: true, product: true, supplier_purchase_item: { include: { purchase: { include: { supplier: { select: { id: true, name: true } } } } } } }, orderBy: [{ product: { name: "asc" } }, { received_at: "asc" }] });
  const movements = await prisma.stockMovement.findMany({ where: branchId ? { branch_id: branchId } : {}, include: { branch: true, product: true, staff: { select: { name: true } } }, orderBy: { created_at: "desc" }, take: 100 });
  const suppliers = await prisma.supplier.findMany({ where: { is_active: true, ...(branchId ? { branch_id: branchId } : {}) }, orderBy: { name: "asc" } });
  const inventoryMap = new Map<string, { id: string; quantity: number; branch: { id: string; name: string }; product: typeof products[number] }>();
  for (const batch of stockBatches) {
    const key = `${batch.branch_id}:${batch.product_id}`;
    const existing = inventoryMap.get(key);
    if (existing) existing.quantity += Number(batch.quantity_remaining);
    else inventoryMap.set(key, { id: key, quantity: Number(batch.quantity_remaining), branch: batch.branch, product: { ...batch.product, branch: { id: batch.branch.id, name: batch.branch.name } } });
  }
  const inventory = Array.from(inventoryMap.values()).map(item => ({ ...item, quantity: item.quantity.toString() }));
  return NextResponse.json({ success: true, can_manage: canAddStock, can_add_stock: canAddStock, can_record_waste: canRecordWaste, can_manage_catalogue: staff.role === Role.BRANCH_ADMIN, can_select_branch: false, selected_branch_id: branchId, products, branches, inventory, stock_batches: stockBatches, movements, suppliers });
}

export async function POST(request: Request) {
  const staff = await getCurrentStaff(request);
  if (!staff) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canUseStockModule(staff)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (staff.role !== Role.SUPER_ADMIN && !staff.branch_id) return NextResponse.json({ error: "This account needs an assigned branch" }, { status: 403 });
  const body = await request.json().catch(() => null);
  const action = body?.action;
  try {
    if (action === "create_product") {
      if (staff.role !== Role.BRANCH_ADMIN) return NextResponse.json({ error: "Only Branch Admin can change branch items, services, and packages" }, { status: 403 });
      const name = typeof body.name === "string" ? body.name.trim() : "";
      const itemCategory = Object.values(ItemCategory).includes(body.item_category) ? body.item_category as ItemCategory : ItemCategory.CAFE_ITEM;
      const sellingPrice = positiveNumber(body.selling_price);
      const tracksStock = stockCategories.has(itemCategory);
      if (!name || (!tracksStock && !sellingPrice)) return NextResponse.json({ error: tracksStock ? "Item name is required" : "Complete all required item fields with a valid price" }, { status: 400 });
      const product = await prisma.product.create({ data: { branch_id: staff.branch_id!, name, item_category: itemCategory, selling_price: sellingPrice } });
      await prisma.auditLog.create({ data: { staff_id: staff.id, branch_id: staff.branch_id!, action: "PRODUCT_CREATED", entity_type: "Product", entity_id: product.id, new_value: { name, item_category: itemCategory, branch_id: staff.branch_id } } });
      return NextResponse.json({ success: true, id: product.id }, { status: 201 });
    }
    if (action === "update_product") {
      if (staff.role !== Role.BRANCH_ADMIN) return NextResponse.json({ error: "Only Branch Admin can change branch items, services, and packages" }, { status: 403 });
      const id = typeof body.id === "string" ? body.id : "";
      const name = typeof body.name === "string" ? body.name.trim() : "";
      const itemCategory = Object.values(ItemCategory).includes(body.item_category) ? body.item_category as ItemCategory : null;
      const sellingPrice = positiveNumber(body.selling_price);
      const tracksStock = itemCategory ? stockCategories.has(itemCategory) : false;
      if (!id || !name || !itemCategory || (!tracksStock && !sellingPrice)) return NextResponse.json({ error: tracksStock ? "Item name and category are required" : "Complete all required item fields with a valid price" }, { status: 400 });
      const existing = await prisma.product.findFirst({ where: { id, branch_id: staff.branch_id!, is_active: true } });
      if (!existing) return NextResponse.json({ error: "Item not found in your branch" }, { status: 404 });
      const product = await prisma.product.update({ where: { id }, data: { name, item_category: itemCategory, selling_price: sellingPrice } });
      await prisma.auditLog.create({ data: { staff_id: staff.id, branch_id: staff.branch_id!, action: "PRODUCT_UPDATED", entity_type: "Product", entity_id: product.id, new_value: { name, item_category: itemCategory } } });
      return NextResponse.json({ success: true, id: product.id });
    }
    if (action === "delete_product") {
      if (staff.role !== Role.BRANCH_ADMIN) return NextResponse.json({ error: "Only Branch Admin can change branch items, services, and packages" }, { status: 403 });
      const id = typeof body.id === "string" ? body.id : "";
      if (!id) return NextResponse.json({ error: "Item is required" }, { status: 400 });
      const existing = await prisma.product.findFirst({ where: { id, branch_id: staff.branch_id!, is_active: true } });
      if (!existing) return NextResponse.json({ error: "Item not found in your branch" }, { status: 404 });
      await prisma.product.update({ where: { id }, data: { is_active: false } });
      await prisma.auditLog.create({ data: { staff_id: staff.id, branch_id: staff.branch_id!, action: "PRODUCT_DISABLED", entity_type: "Product", entity_id: id } });
      return NextResponse.json({ success: true, id });
    }
    if (action === "update_stock_batch") {
      if (staff.role !== Role.BRANCH_ADMIN) return NextResponse.json({ error: "Only Branch Admin can edit stock" }, { status: 403 });
      const stockBatchId = typeof body?.stock_batch_id === "string" ? body.stock_batch_id : "";
      const quantity = positiveNumber(body?.quantity);
      const buyingPrice = positiveNumber(body?.buying_price);
      const sellingPrice = positiveNumber(body?.selling_price);
      if (!stockBatchId || !quantity || !buyingPrice || !sellingPrice) return NextResponse.json({ error: "Stock, quantity, buying price, and selling price are required" }, { status: 400 });
      const current = await prisma.stockBatch.findFirst({ where: { id: stockBatchId, branch_id: staff.branch_id!, quantity_remaining: { gt: 0 } } });
      if (!current) return NextResponse.json({ error: "Stock batch not found in your branch" }, { status: 404 });
      const oldQuantity = Number(current.quantity_remaining);
      const movementQuantity = Math.abs(quantity - oldQuantity);
      const movementType = quantity > oldQuantity ? StockMovementType.ADJUSTMENT_IN : StockMovementType.ADJUSTMENT_OUT;
      const updated = await prisma.$transaction(async transaction => {
        const batch = await transaction.stockBatch.update({ where: { id: stockBatchId }, data: { quantity_remaining: quantity, buying_price: buyingPrice, selling_price: sellingPrice } });
        if (movementQuantity > 0) {
          await changeStock(transaction, { branchId: staff.branch_id!, productId: current.product_id, type: movementType, quantity: movementQuantity, staffId: staff.id, unitCost: buyingPrice, sellingPrice, referenceType: "STOCK_BATCH_EDIT", referenceId: stockBatchId, note: typeof body.note === "string" ? body.note.trim() : null });
        }
        await transaction.auditLog.create({ data: { staff_id: staff.id, branch_id: staff.branch_id!, action: "STOCK_BATCH_UPDATED", entity_type: "StockBatch", entity_id: stockBatchId, old_value: { quantity_remaining: current.quantity_remaining, buying_price: current.buying_price, selling_price: current.selling_price }, new_value: { quantity_remaining: quantity, buying_price: buyingPrice, selling_price: sellingPrice } } });
        return batch;
      });
      return NextResponse.json({ success: true, id: updated.id });
    }
    if (action === "transfer" || action === "adjust") return NextResponse.json({ error: "Stock is added through Add Stock so supplier, buying price, selling price, and payment history stay clean." }, { status: 403 });
    const quantity = positiveNumber(body?.quantity);
    const branchId = staff.role === Role.SUPER_ADMIN ? typeof body?.branch_id === "string" ? body.branch_id : "" : staff.branch_id!;
    const stockBatchId = typeof body?.stock_batch_id === "string" ? body.stock_batch_id : "";
    const productId = typeof body?.product_id === "string" ? body.product_id : "";
    if (!quantity || !branchId || (!productId && !stockBatchId) || !canUseBranch(staff, branchId)) return NextResponse.json({ error: "Valid product, branch, and quantity are required" }, { status: 400 });
    const stockBatch = stockBatchId ? await prisma.stockBatch.findFirst({ where: { id: stockBatchId, branch_id: branchId, quantity_remaining: { gt: 0 } }, include: { product: true } }) : null;
    const selectedProductId = stockBatch?.product_id ?? productId;
    const stockProduct = stockBatch?.product ?? await prisma.product.findFirst({ where: { id: selectedProductId, branch_id: branchId, item_category: { in: Array.from(stockCategories) } } });
    if (!stockProduct) return NextResponse.json({ error: "Only stock-tracked products can use stock actions" }, { status: 400 });
    if (action === "wastage") {
      if (action === "wastage" && staff.role !== Role.BRANCH_ADMIN && staff.role !== Role.CASHIER) return NextResponse.json({ error: "Only Branch Admin or Cashier can record wastage" }, { status: 403 });
      if (action === "wastage" && (typeof body.note !== "string" || !body.note.trim())) return NextResponse.json({ error: "A wastage reason is required" }, { status: 400 });
      if (action === "wastage" && !stockBatch) return NextResponse.json({ error: "Select the stock batch being wasted" }, { status: 400 });
      const wastageBatch = stockBatch;
      if (wastageBatch && quantity > Number(wastageBatch.quantity_remaining)) return NextResponse.json({ error: "Waste quantity cannot exceed the selected batch stock" }, { status: 409 });
      const movement = await prisma.$transaction(async transaction => {
        const updated = await transaction.stockBatch.updateMany({ where: { id: wastageBatch!.id, quantity_remaining: { gte: quantity } }, data: { quantity_remaining: { decrement: quantity } } });
        if (updated.count !== 1) throw new Error("INSUFFICIENT_STOCK");
        const unitCost = wastageBatch ? Number(wastageBatch.buying_price) : null;
        const sellingPrice = wastageBatch ? Number(wastageBatch.selling_price) : null;
        const note = typeof body.note === "string" ? body.note.trim() : null;
        const result = await changeStock(transaction, { branchId, productId: selectedProductId, type: StockMovementType.WASTAGE, quantity, staffId: staff.id, unitCost, sellingPrice, note });
        const wasteValue = Math.round(quantity * Number(wastageBatch!.buying_price) * 100) / 100;
        await transaction.payment.create({ data: { branch_id: branchId, direction: PaymentDirection.OUTGOING, source: PaymentSource.WASTAGE, amount: wasteValue, method: PaymentMethod.CASH, note, wastage_id: result.id, paid_by: staff.id } });
        await transaction.auditLog.create({ data: { staff_id: staff.id, branch_id: branchId, action: StockMovementType.WASTAGE, entity_type: "StockMovement", entity_id: result.id, new_value: { product_id: selectedProductId, stock_batch_id: stockBatchId || null, quantity, waste_value: wasteValue, note: body.note ?? null } } });
        return result;
      });
      return NextResponse.json({ success: true, id: movement.id });
    }
    return NextResponse.json({ error: "Invalid stock action" }, { status: 400 });
  } catch (error) {
    if (error instanceof Error && error.message === "INSUFFICIENT_STOCK") return NextResponse.json({ error: "Insufficient stock for this operation" }, { status: 409 });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return NextResponse.json({ error: "That item already exists" }, { status: 409 });
    return NextResponse.json({ error: "Inventory could not be updated" }, { status: 500 });
  }
}
