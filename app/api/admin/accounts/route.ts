import { PaymentDirection, PaymentMethod, PaymentSource, Prisma, Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { dateRange, financialData } from "@/lib/accounts";
import { getCurrentStaff } from "@/lib/auth";
import { parseDateOnly } from "@/lib/date";
import { prisma } from "@/lib/prisma";

async function requireAdmin(request: Request) {
  const staff = await getCurrentStaff(request);
  if (!staff) return { staff: null, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (staff.role !== Role.SUPER_ADMIN && staff.role !== Role.BRANCH_ADMIN) return { staff: null, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  if (staff.role === Role.BRANCH_ADMIN && !staff.branch_id) return { staff: null, response: NextResponse.json({ error: "Branch Admin needs an assigned branch" }, { status: 403 }) };
  return { staff, response: null };
}

export async function GET(request: Request) {
  const access = await requireAdmin(request); if (access.response) return access.response;
  const staff = access.staff!;
  const url = new URL(request.url); const requestedBranch = url.searchParams.get("branch_id"); const branchId = staff.role === Role.SUPER_ADMIN ? requestedBranch : staff.branch_id!; const { from, to } = dateRange(url);
  if (branchId && !await prisma.branch.findUnique({ where: { id: branchId } })) return NextResponse.json({ error: "Branch not found" }, { status: 404 });
  const branches = await prisma.branch.findMany({ where: staff.role === Role.BRANCH_ADMIN ? { id: staff.branch_id! } : {}, orderBy: [{ is_active: "desc" }, { name: "asc" }] });
  const data = await financialData(branchId, from, to);
  const expenses = await prisma.branchExpense.findMany({
    where: { ...(branchId ? { branch_id: branchId } : {}), incurred_at: { gte: from, lte: to } },
    include: {
      branch: { select: { name: true } },
      expense_type: true,
      staff: { select: { name: true } },
      payments: { where: { source: PaymentSource.EXPENSE }, select: { method: true, reference: true }, orderBy: { paid_at: "desc" }, take: 1 },
    },
    orderBy: { incurred_at: "desc" },
  });
  const supplierBalances = await prisma.supplier.findMany({ include: { purchases: { where: branchId ? { branch_id: branchId } : undefined, select: { balance_due: true } } }, orderBy: { name: "asc" } });
  const expenseTypes = await prisma.expenseType.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json({ success: true, can_select_branch: staff.role === Role.SUPER_ADMIN, can_record_expense: staff.role === Role.BRANCH_ADMIN, can_manage_expense_types: staff.role === Role.SUPER_ADMIN || staff.role === Role.BRANCH_ADMIN, branches, selected_branch_id: branchId, from, to, ...data, expenses, expense_types: expenseTypes, supplier_balances: supplierBalances.map(supplier => ({ id: supplier.id, name: supplier.name, balance: supplier.purchases.reduce((sum, purchase) => sum + Number(purchase.balance_due), 0) })).filter(item => item.balance > 0) });
}

export async function POST(request: Request) {
  const access = await requireAdmin(request); if (access.response) return access.response;
  const staff = access.staff!;
  const body = await request.json().catch(() => null);
  if (body?.action === "create_expense_type") {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return NextResponse.json({ error: "Expense name is required" }, { status: 400 });
    try {
      const expenseType = await prisma.expenseType.create({ data: { name } });
      await prisma.auditLog.create({ data: { staff_id: staff.id, action: "EXPENSE_TYPE_CREATED", entity_type: "ExpenseType", entity_id: expenseType.id, new_value: { name } } });
      return NextResponse.json({ success: true, expense_type: expenseType }, { status: 201 });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return NextResponse.json({ error: "This expense name already exists" }, { status: 409 });
      return NextResponse.json({ error: "Expense name could not be created" }, { status: 500 });
    }
  }
  if (body?.action === "update_expense_type") {
    const id = typeof body.id === "string" ? body.id : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!id || !name) return NextResponse.json({ error: "Expense name is required" }, { status: 400 });
    try {
      const expenseType = await prisma.expenseType.update({ where: { id }, data: { name } });
      await prisma.auditLog.create({ data: { staff_id: staff.id, action: "EXPENSE_TYPE_UPDATED", entity_type: "ExpenseType", entity_id: expenseType.id, new_value: { name } } });
      return NextResponse.json({ success: true, expense_type: expenseType });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") return NextResponse.json({ error: "Expense name not found" }, { status: 404 });
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return NextResponse.json({ error: "This expense name already exists" }, { status: 409 });
      return NextResponse.json({ error: "Expense name could not be updated" }, { status: 500 });
    }
  }
  if (body?.action === "update_expense") {
    if (staff.role !== Role.BRANCH_ADMIN) return NextResponse.json({ error: "Only Branch Admin can edit expenses" }, { status: 403 });
    const id = typeof body.id === "string" ? body.id : "";
    const expenseTypeId = typeof body.expense_type_id === "string" ? body.expense_type_id : "";
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const amount = Number(body.amount);
    const paymentMethod = Object.values(PaymentMethod).includes(body.payment_method) ? body.payment_method as PaymentMethod : null;
    const reference = typeof body.reference === "string" && body.reference.trim() ? body.reference.trim() : null;
    const incurredAt = typeof body.incurred_at === "string" && body.incurred_at ? parseDateOnly(body.incurred_at) : null;
    const branchId = staff.branch_id!;
    const existing = id ? await prisma.branchExpense.findFirst({ where: { id, branch_id: branchId }, include: { payments: { where: { source: PaymentSource.EXPENSE }, orderBy: { paid_at: "desc" }, take: 1 } } }) : null;
    const expenseType = expenseTypeId ? await prisma.expenseType.findUnique({ where: { id: expenseTypeId } }) : null;
    if (!existing) return NextResponse.json({ error: "Expense not found" }, { status: 404 });
    if (!expenseType || !description || !Number.isFinite(amount) || amount <= 0 || !paymentMethod || !incurredAt || Number.isNaN(incurredAt.getTime())) return NextResponse.json({ error: "Valid expense name, description, amount, date, and payment method are required" }, { status: 400 });
    const expense = await prisma.$transaction(async transaction => {
      const updated = await transaction.branchExpense.update({ where: { id }, data: { expense_type_id: expenseType.id, description, amount, incurred_at: incurredAt } });
      const payment = existing.payments[0];
      if (payment) await transaction.payment.update({ where: { id: payment.id }, data: { amount, method: paymentMethod, reference } });
      else await transaction.payment.create({ data: { branch_id: branchId, direction: PaymentDirection.OUTGOING, source: PaymentSource.EXPENSE, expense_id: updated.id, amount, method: paymentMethod, reference, paid_by: staff.id } });
      await transaction.auditLog.create({ data: { staff_id: staff.id, branch_id: branchId, action: "BRANCH_EXPENSE_UPDATED", entity_type: "BranchExpense", entity_id: id, new_value: { expense_type_id: expenseType.id, expense_name: expenseType.name, description, amount, payment_method: paymentMethod } } });
      return updated;
    });
    return NextResponse.json({ success: true, expense });
  }
  if (body?.action !== "record_expense") return NextResponse.json({ error: "Invalid accounts action" }, { status: 400 });
  if (staff.role !== Role.BRANCH_ADMIN) return NextResponse.json({ error: "Only Branch Admin can record expenses" }, { status: 403 });
  const branchId = staff.branch_id!;
  const expenseTypeId = typeof body.expense_type_id === "string" ? body.expense_type_id : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const amount = Number(body.amount);
  const paymentMethod = Object.values(PaymentMethod).includes(body.payment_method) ? body.payment_method as PaymentMethod : null;
  const incurredAt = typeof body.incurred_at === "string" && body.incurred_at ? parseDateOnly(body.incurred_at) : new Date();
  const branch = branchId ? await prisma.branch.findFirst({ where: { id: branchId, is_active: true } }) : null;
  const expenseType = expenseTypeId ? await prisma.expenseType.findUnique({ where: { id: expenseTypeId } }) : null;
  if (!branch || !expenseType || !description || !Number.isFinite(amount) || amount <= 0 || !paymentMethod || Number.isNaN(incurredAt.getTime())) return NextResponse.json({ error: "Valid branch, expense name, description, amount, date, and payment method are required" }, { status: 400 });
  const expense = await prisma.$transaction(async transaction => {
    const created = await transaction.branchExpense.create({ data: { branch_id: branchId, expense_type_id: expenseType.id, description, amount, recorded_by: staff.id, incurred_at: incurredAt } });
    await transaction.payment.create({ data: { branch_id: branchId, direction: PaymentDirection.OUTGOING, source: PaymentSource.EXPENSE, expense_id: created.id, amount, method: paymentMethod, reference: typeof body.reference === "string" && body.reference.trim() ? body.reference.trim() : null, paid_by: staff.id } });
    await transaction.auditLog.create({ data: { staff_id: staff.id, branch_id: branchId, action: "BRANCH_EXPENSE_RECORDED", entity_type: "BranchExpense", entity_id: created.id, new_value: { expense_type_id: expenseType.id, expense_name: expenseType.name, description, amount, payment_method: paymentMethod } } });
    return created;
  });
  return NextResponse.json({ success: true, expense }, { status: 201 });
}

export async function DELETE(request: Request) {
  const access = await requireAdmin(request); if (access.response) return access.response;
  const staff = access.staff!;
  const body = await request.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "Expense name is required" }, { status: 400 });
  if (body?.action === "delete_expense") {
    if (staff.role !== Role.BRANCH_ADMIN) return NextResponse.json({ error: "Only Branch Admin can delete expenses" }, { status: 403 });
    const expense = await prisma.branchExpense.findFirst({ where: { id, branch_id: staff.branch_id! }, include: { expense_type: true } });
    if (!expense) return NextResponse.json({ error: "Expense not found" }, { status: 404 });
    await prisma.$transaction([
      prisma.payment.deleteMany({ where: { expense_id: id } }),
      prisma.branchExpense.delete({ where: { id } }),
      prisma.auditLog.create({ data: { staff_id: staff.id, branch_id: staff.branch_id!, action: "BRANCH_EXPENSE_DELETED", entity_type: "BranchExpense", entity_id: id, old_value: { expense_type_id: expense.expense_type_id, expense_name: expense.expense_type.name, description: expense.description, amount: expense.amount } } }),
    ]);
    return NextResponse.json({ success: true });
  }
  const used = await prisma.branchExpense.count({ where: { expense_type_id: id } });
  if (used > 0) return NextResponse.json({ error: "This expense name has records and cannot be deleted" }, { status: 409 });
  try {
    const deleted = await prisma.expenseType.delete({ where: { id } });
    await prisma.auditLog.create({ data: { staff_id: staff.id, action: "EXPENSE_TYPE_DELETED", entity_type: "ExpenseType", entity_id: id, old_value: { name: deleted.name } } });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") return NextResponse.json({ error: "Expense name not found" }, { status: 404 });
    return NextResponse.json({ error: "Expense name could not be deleted" }, { status: 500 });
  }
}
