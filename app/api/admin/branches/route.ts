import { Prisma, Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { getCurrentStaff } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function admin(request: Request) {
  const staff = await getCurrentStaff(request);
  if (!staff) return { staff: null, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (staff.role !== Role.SUPER_ADMIN) return { staff: null, error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { staff, error: null };
}

function fields(body: Record<string, unknown>) {
  return {
    name: typeof body.name === "string" ? body.name.trim() : "",
    address: typeof body.address === "string" && body.address.trim() ? body.address.trim() : null,
    phone: typeof body.phone === "string" && body.phone.trim() ? body.phone.trim() : null,
  };
}

function includeUsage() {
  return { _count: { select: { staff: true, bookings: true, sales: true, stock_batches: true } } };
}

export async function GET(request: Request) {
  const access = await admin(request); if (access.error) return access.error;
  const branches = await prisma.branch.findMany({ include: includeUsage(), orderBy: [{ is_active: "desc" }, { name: "asc" }] });
  return NextResponse.json({ success: true, branches });
}

export async function POST(request: Request) {
  const access = await admin(request); if (access.error) return access.error;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const data = fields(body);
  if (!data.name) return NextResponse.json({ error: "Branch name is required" }, { status: 400 });
  if (await prisma.branch.findFirst({ where: { name: { equals: data.name, mode: "insensitive" } } })) return NextResponse.json({ error: "A branch with this name already exists" }, { status: 409 });
  try {
    const branch = await prisma.branch.create({ data, include: includeUsage() });
    await prisma.auditLog.create({ data: { staff_id: access.staff!.id, branch_id: branch.id, action: "BRANCH_CREATED", entity_type: "Branch", entity_id: branch.id, new_value: data } });
    return NextResponse.json({ success: true, branch }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Branch could not be created" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const access = await admin(request); if (access.error) return access.error;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const id = typeof body?.id === "string" ? body.id : "";
  const branch = id ? await prisma.branch.findUnique({ where: { id } }) : null;
  if (!branch) return NextResponse.json({ error: "Branch not found" }, { status: 404 });
  if (body?.action === "toggle_active") {
    const updated = await prisma.branch.update({ where: { id }, data: { is_active: !branch.is_active }, include: includeUsage() });
    await prisma.auditLog.create({ data: { staff_id: access.staff!.id, branch_id: id, action: updated.is_active ? "BRANCH_ENABLED" : "BRANCH_DISABLED", entity_type: "Branch", entity_id: id } });
    return NextResponse.json({ success: true, branch: updated });
  }
  if (!body) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const data = fields(body);
  if (!data.name) return NextResponse.json({ error: "Branch name is required" }, { status: 400 });
  const duplicate = await prisma.branch.findFirst({ where: { id: { not: id }, name: { equals: data.name, mode: "insensitive" } } });
  if (duplicate) return NextResponse.json({ error: "A branch with this name already exists" }, { status: 409 });
  try {
    const updated = await prisma.branch.update({ where: { id }, data, include: includeUsage() });
    await prisma.auditLog.create({ data: { staff_id: access.staff!.id, branch_id: id, action: "BRANCH_UPDATED", entity_type: "Branch", entity_id: id, old_value: { name: branch.name, address: branch.address, phone: branch.phone }, new_value: data } });
    return NextResponse.json({ success: true, branch: updated });
  } catch {
    return NextResponse.json({ error: "Branch could not be updated" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const access = await admin(request); if (access.error) return access.error;
  const body = await request.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";
  const branch = id ? await prisma.branch.findUnique({ where: { id } }) : null;
  if (!branch) return NextResponse.json({ error: "Branch not found" }, { status: 404 });
  const [staff, bookings, transactions, checkins, batches, movements, purchases, payments, sales, expenses] = await Promise.all([
    prisma.staff.count({ where: { branch_id: id } }), prisma.booking.count({ where: { branch_id: id } }), prisma.transaction.count({ where: { branch_id: id } }), prisma.checkIn.count({ where: { branch_id: id } }), prisma.stockBatch.count({ where: { branch_id: id } }), prisma.stockMovement.count({ where: { branch_id: id } }), prisma.supplierPurchase.count({ where: { branch_id: id } }), prisma.payment.count({ where: { branch_id: id } }), prisma.sale.count({ where: { branch_id: id } }), prisma.branchExpense.count({ where: { branch_id: id } }),
  ]);
  if (staff + bookings + transactions + checkins + batches + movements + purchases + payments + sales + expenses > 0) return NextResponse.json({ error: "This branch has operational history and cannot be deleted. Deactivate it instead." }, { status: 409 });
  await prisma.$transaction([prisma.branch.delete({ where: { id } }), prisma.auditLog.create({ data: { staff_id: access.staff!.id, action: "BRANCH_DELETED", entity_type: "Branch", entity_id: id, old_value: { name: branch.name } } })]);
  return NextResponse.json({ success: true });
}
