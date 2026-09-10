import { randomBytes } from "crypto";
import { ItemCategory, PaymentDirection, PaymentMethod, PaymentSource, PaymentStatus, Prisma, Role, SaleStatus, StockMovementType, TransactionType } from "@prisma/client";
import { NextResponse } from "next/server";
import { getCurrentStaff } from "@/lib/auth";
import { changeStock } from "@/lib/inventory";
import { prisma } from "@/lib/prisma";
import { canCancelSale, parsePaymentMethod, resolveSaleBranch } from "@/lib/sales";

function nonNegative(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function saleNumber(prefix: string) {
  return `${prefix}-${Date.now()}-${randomBytes(2).toString("hex").toUpperCase()}`;
}

function itemCategoryLabel(value: string) {
  return value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

const stockCategories = [ItemCategory.CAFE_ITEM, ItemCategory.BIRTHDAY_ITEM, ItemCategory.OTHER_ITEM];

export async function GET(request: Request) {
  const staff = await getCurrentStaff(request);
  if (!staff) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const requestedBranchId = url.searchParams.get("branch_id");
  const historyMode = url.searchParams.get("mode") === "history";
  const branch = await resolveSaleBranch(staff, requestedBranchId);
  if (!branch) return NextResponse.json({ error: "An active branch is required" }, { status: 400 });
  const saleBranchId = staff.role === Role.SUPER_ADMIN && historyMode && !requestedBranchId ? null : branch.id;
  const search = (url.searchParams.get("q") ?? "").trim();
  const payment = parsePaymentMethod(url.searchParams.get("payment_method"));
  const status = Object.values(SaleStatus).includes(url.searchParams.get("status") as SaleStatus) ? url.searchParams.get("status") as SaleStatus : null;
  const fromValue = url.searchParams.get("from");
  const toValue = url.searchParams.get("to");
  const from = fromValue ? new Date(`${fromValue}T00:00:00`) : null;
  const to = toValue ? new Date(`${toValue}T23:59:59.999`) : null;
  const createdRange = from || to ? { ...(from && !Number.isNaN(from.getTime()) ? { gte: from } : {}), ...(to && !Number.isNaN(to.getTime()) ? { lte: to } : {}) } : undefined;
  const saleWhere: Prisma.SaleWhereInput = {
    ...(saleBranchId ? { branch_id: saleBranchId } : {}),
    ...(createdRange ? { created_at: createdRange } : {}),
    ...(payment ? { payment_method: payment } : {}),
    ...(status ? { status } : {}),
    ...(search ? { OR: [
      { sale_no: { contains: search, mode: "insensitive" } },
      { cashier: { name: { contains: search, mode: "insensitive" } } },
      { items: { some: { product_name: { contains: search, mode: "insensitive" } } } },
    ] } : {}),
  };

  const [branches, inventory, sales] = await Promise.all([
    staff.role === Role.SUPER_ADMIN
      ? prisma.branch.findMany({ where: { is_active: true }, orderBy: { name: "asc" } })
      : Promise.resolve([branch]),
    prisma.stockBatch.findMany({
      where: { branch_id: branch.id, quantity_remaining: { gt: 0 }, product: { is_active: true, item_category: { in: stockCategories } } },
      include: { product: true },
      orderBy: [{ product: { name: "asc" } }, { received_at: "asc" }],
    }),
    prisma.sale.findMany({
      where: saleWhere,
      include: {
        branch: { select: { id: true, name: true, address: true, phone: true } },
        cashier: { select: { name: true } },
        cancelled_by_staff: { select: { name: true } },
        items: { select: { id: true, product_name: true, quantity: true, unit_price: true, unit_cost: true, line_total: true } },
        transaction: { include: { receipt: true } },
      },
      orderBy: { created_at: "desc" },
      take: 100,
    }),
  ]);
  const completedSales = sales.filter((sale) => sale.status !== SaleStatus.CANCELLED);
  const cashSales = completedSales.filter((sale) => sale.payment_method === PaymentMethod.CASH).reduce((sum, sale) => sum + Number(sale.total), 0);
  const digitalSales = completedSales.filter((sale) => sale.payment_method !== PaymentMethod.CASH).reduce((sum, sale) => sum + Number(sale.total), 0);

  return NextResponse.json({
    success: true,
    selected_branch: branch,
    branches,
    viewer_role: staff.role,
    can_select_branch: staff.role === Role.SUPER_ADMIN,
    can_cancel: canCancelSale(staff),
    summary: {
      total_sales: completedSales.reduce((sum, sale) => sum + Number(sale.total), 0),
      total_transactions: sales.length,
      cash_sales: cashSales,
      digital_sales: digitalSales,
    },
    products: inventory.map((item) => ({
      id: item.id,
      stock_batch_id: item.id,
      product_id: item.product.id,
      name: item.product.name,
      selling_price: item.selling_price,
      buying_price: item.buying_price,
      quantity: item.quantity_remaining,
      category: { id: item.product.item_category, name: itemCategoryLabel(item.product.item_category) },
    })),
    sales,
  });
}

export async function POST(request: Request) {
  const staff = await getCurrentStaff(request);
  if (!staff) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const idempotencyKey = typeof body?.idempotency_key === "string" ? body.idempotency_key.trim() : "";
  const paymentMethod = parsePaymentMethod(body?.payment_method);
  const discount = nonNegative(body?.discount ?? 0);
  const amountReceivedInput = nonNegative(body?.amount_received);
  if (!idempotencyKey || idempotencyKey.length > 100 || !paymentMethod || discount === null || !Array.isArray(body?.items) || body.items.length === 0 || body.items.length > 100) {
    return NextResponse.json({ error: "Valid items, payment method, discount, and checkout key are required" }, { status: 400 });
  }

  const branch = await resolveSaleBranch(staff, typeof body.branch_id === "string" ? body.branch_id : null);
  if (!branch) return NextResponse.json({ error: "An active permitted branch is required" }, { status: 403 });

  const consolidated = new Map<string, number>();
  for (const item of body.items) {
    const productId = typeof item?.stock_batch_id === "string" ? item.stock_batch_id : typeof item?.product_id === "string" ? item.product_id : "";
    const quantity = Number(item?.quantity);
    if (!productId || !Number.isFinite(quantity) || quantity <= 0 || quantity > 10000) {
      return NextResponse.json({ error: "Every sale item requires a valid product and quantity" }, { status: 400 });
    }
    consolidated.set(productId, (consolidated.get(productId) ?? 0) + quantity);
  }

  const existing = await prisma.sale.findUnique({ where: { idempotency_key: idempotencyKey }, include: { transaction: { include: { receipt: true } } } });
  if (existing) return NextResponse.json({ success: true, sale_id: existing.id, receipt_no: existing.transaction?.receipt?.receipt_no, duplicate: true });

  const productIds = Array.from(consolidated.keys());
  const inventory = await prisma.stockBatch.findMany({
    where: { id: { in: productIds }, branch_id: branch.id, quantity_remaining: { gt: 0 }, product: { is_active: true, item_category: { in: stockCategories } } },
    include: { product: true },
  });
  if (inventory.length !== productIds.length) return NextResponse.json({ error: "One or more products are unavailable at this branch" }, { status: 409 });

  const lines = inventory.map((stock) => {
    const quantity = consolidated.get(stock.id)!;
    const unitPrice = Number(stock.selling_price);
    return { stock, quantity, unitPrice, lineTotal: Math.round(quantity * unitPrice * 100) / 100 };
  });
  if (lines.some((line) => line.quantity > Number(line.stock.quantity_remaining))) return NextResponse.json({ error: "One or more selected batches do not have enough stock" }, { status: 409 });
  const subtotal = Math.round(lines.reduce((sum, line) => sum + line.lineTotal, 0) * 100) / 100;
  if (discount > subtotal) return NextResponse.json({ error: "Discount cannot exceed the subtotal" }, { status: 400 });
  const total = Math.round((subtotal - discount) * 100) / 100;
  const amountReceived = amountReceivedInput ?? total;
  if (amountReceived < total) return NextResponse.json({ error: "Amount received cannot be less than the total" }, { status: 400 });
  const changeGiven = Math.round((amountReceived - total) * 100) / 100;
  const saleNo = saleNumber("SALE");
  const receiptNo = saleNumber("POS");

  try {
    const sale = await prisma.$transaction(async (transaction) => {
      const created = await transaction.sale.create({
        data: {
          sale_no: saleNo,
          branch_id: branch.id,
          cashier_id: staff.id,
          subtotal,
          discount,
          total,
          amount_received: amountReceived,
          change_given: changeGiven,
          payment_method: paymentMethod,
          idempotency_key: idempotencyKey,
          items: { create: lines.map(({ stock, quantity, unitPrice, lineTotal }) => ({
            product_id: stock.product_id,
            stock_batch_id: stock.id,
            product_name: stock.product.name,
            quantity,
            unit_price: unitPrice,
            unit_cost: stock.buying_price,
            line_total: lineTotal,
          })) },
        },
      });

      for (const line of lines) {
        const batchUpdate = await transaction.stockBatch.updateMany({
          where: { id: line.stock.id, quantity_remaining: { gte: line.quantity } },
          data: { quantity_remaining: { decrement: line.quantity } },
        });
        if (batchUpdate.count !== 1) throw new Error("INSUFFICIENT_STOCK");
        await changeStock(transaction, {
          branchId: branch.id,
          productId: line.stock.product_id,
          type: StockMovementType.SALE,
          quantity: line.quantity,
          staffId: staff.id,
          unitCost: Number(line.stock.buying_price),
          sellingPrice: Number(line.stock.selling_price),
          referenceType: "SALE",
          referenceId: created.id,
          note: saleNo,
        });
      }

      const financialTransaction = await transaction.transaction.create({ data: {
        receipt_no: receiptNo,
        branch_id: branch.id,
        type: TransactionType.PRODUCT_SALE,
        sale_id: created.id,
        subtotal,
        discount,
        total,
        amount_received: amountReceived,
        change_given: changeGiven,
        payment_method: paymentMethod,
        payment_status: PaymentStatus.PAID,
        staff_id: staff.id,
      } });
      await transaction.payment.create({ data: {
        branch_id: branch.id,
        direction: PaymentDirection.INCOME,
        source: PaymentSource.SALE,
        sale_id: created.id,
        amount: total,
        method: paymentMethod,
        paid_by: staff.id,
      } });
      await transaction.receipt.create({ data: { transaction_id: financialTransaction.id, receipt_no: receiptNo } });
      await transaction.auditLog.create({ data: {
        staff_id: staff.id,
        branch_id: branch.id,
        action: "PRODUCT_SALE_COMPLETED",
        entity_type: "Sale",
        entity_id: created.id,
        new_value: { sale_no: saleNo, receipt_no: receiptNo, subtotal, discount, total, payment_method: paymentMethod },
      } });
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return NextResponse.json({ success: true, sale_id: sale.id, sale_no: saleNo, receipt_no: receiptNo }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "INSUFFICIENT_STOCK") return NextResponse.json({ error: "Stock changed during checkout. Review the cart and try again." }, { status: 409 });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const duplicate = await prisma.sale.findUnique({ where: { idempotency_key: idempotencyKey }, include: { transaction: { include: { receipt: true } } } });
      if (duplicate) return NextResponse.json({ success: true, sale_id: duplicate.id, receipt_no: duplicate.transaction?.receipt?.receipt_no, duplicate: true });
    }
    return NextResponse.json({ error: "The sale could not be completed" }, { status: 500 });
  }
}
