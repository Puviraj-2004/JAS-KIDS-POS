import { Prisma, Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { getCurrentStaff, hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const POS_ROLES = [Role.SUPER_ADMIN, Role.BRANCH_ADMIN, Role.CASHIER] as const;

async function authorize(request: Request) {
  const staff = await getCurrentStaff(request);
  if (!staff) return { staff: null, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (staff.role !== Role.SUPER_ADMIN) return { staff: null, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { staff, response: null };
}

export async function GET(request: Request) {
  const authorization = await authorize(request);
  if (authorization.response) return authorization.response;
  const [staff, branches] = await Promise.all([
    prisma.staff.findMany({ include: { branch: true }, orderBy: [{ is_active: "desc" }, { name: "asc" }] }),
    prisma.branch.findMany({ where: { is_active: true }, orderBy: { name: "asc" } }),
  ]);
  return NextResponse.json({ success: true, staff: staff.map(({ password_hash: _, ...item }) => item), branches });
}

export async function POST(request: Request) {
  const authorization = await authorize(request);
  if (authorization.response) return authorization.response;
  const admin = authorization.staff!;
  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const role = POS_ROLES.includes(body?.role) ? body.role as Role : null;
  const branchId = role === Role.SUPER_ADMIN ? null : typeof body?.branch_id === "string" ? body.branch_id : null;
  if (!name || !email || password.length < 8 || !role || (role !== Role.SUPER_ADMIN && !branchId)) {
    return NextResponse.json({ error: "Provide a name, valid role, branch, and password of at least 8 characters" }, { status: 400 });
  }
  if (branchId && !await prisma.branch.findFirst({ where: { id: branchId, is_active: true } })) return NextResponse.json({ error: "Selected branch is not available" }, { status: 400 });
  try {
    const created = await prisma.staff.create({ data: { name, email, password_hash: await hashPassword(password), role, branch_id: branchId }, include: { branch: true } });
    await prisma.auditLog.create({ data: { staff_id: admin.id, action: "STAFF_CREATED", entity_type: "Staff", entity_id: created.id, new_value: { name, email, role, branch_id: branchId } } });
    const { password_hash: _, ...staff } = created;
    return NextResponse.json({ success: true, staff }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return NextResponse.json({ error: "A POS account already uses this email" }, { status: 409 });
    return NextResponse.json({ error: "Staff account could not be created" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const authorization = await authorize(request);
  if (authorization.response) return authorization.response;
  const admin = authorization.staff!;
  const body = await request.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";
  const target = id ? await prisma.staff.findUnique({ where: { id } }) : null;
  if (!target) return NextResponse.json({ error: "Staff account not found" }, { status: 404 });

  if (body.action === "update_details") {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const role = POS_ROLES.includes(body.role) ? body.role as Role : null;
    const branchId = role === Role.SUPER_ADMIN ? null : typeof body.branch_id === "string" ? body.branch_id : null;
    if (!name || !email || !role || (role !== Role.SUPER_ADMIN && !branchId)) return NextResponse.json({ error: "Provide a name, valid role, and branch" }, { status: 400 });
    if (branchId && !await prisma.branch.findFirst({ where: { id: branchId, is_active: true } })) return NextResponse.json({ error: "Selected branch is not available" }, { status: 400 });
    try {
      const updated = await prisma.staff.update({ where: { id }, data: { name, email, role, branch_id: branchId }, include: { branch: true } });
      await prisma.auditLog.create({ data: { staff_id: admin.id, action: "STAFF_UPDATED", entity_type: "Staff", entity_id: id, old_value: { name: target.name, email: target.email, role: target.role, branch_id: target.branch_id }, new_value: { name, email, role, branch_id: branchId } } });
      const { password_hash: _, ...staff } = updated;
      return NextResponse.json({ success: true, staff });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return NextResponse.json({ error: "A POS account already uses this email" }, { status: 409 });
      return NextResponse.json({ error: "Staff account could not be updated" }, { status: 500 });
    }
  }

  if (body.action === "reset_password") {
    if (typeof body.password !== "string" || body.password.length < 8) return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    await prisma.$transaction([
      prisma.staff.update({ where: { id }, data: { password_hash: await hashPassword(body.password) } }),
      prisma.session.deleteMany({ where: { staff_id: id } }),
      prisma.auditLog.create({ data: { staff_id: admin.id, action: "STAFF_PASSWORD_RESET", entity_type: "Staff", entity_id: id } }),
    ]);
    const updated = await prisma.staff.findUnique({ where: { id }, include: { branch: true } });
    if (!updated) return NextResponse.json({ error: "Staff account not found" }, { status: 404 });
    const { password_hash: _, ...staff } = updated;
    return NextResponse.json({ success: true, staff });
  }
  if (body.action === "toggle_active") {
    if (id === admin.id) return NextResponse.json({ error: "You cannot disable your own account" }, { status: 400 });
    const isActive = !target.is_active;
    const [updated] = await prisma.$transaction([
      prisma.staff.update({ where: { id }, data: { is_active: isActive }, include: { branch: true } }),
      prisma.session.deleteMany({ where: { staff_id: id } }),
      prisma.auditLog.create({ data: { staff_id: admin.id, action: isActive ? "STAFF_ENABLED" : "STAFF_DISABLED", entity_type: "Staff", entity_id: id } }),
    ]);
    const { password_hash: _, ...staff } = updated;
    return NextResponse.json({ success: true, staff });
  }
  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

export async function DELETE(request: Request) {
  const authorization = await authorize(request);
  if (authorization.response) return authorization.response;
  const admin = authorization.staff!;
  const body = await request.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "Staff account is required" }, { status: 400 });
  if (id === admin.id) return NextResponse.json({ error: "You cannot delete your own account" }, { status: 400 });
  const target = await prisma.staff.findUnique({ where: { id } });
  if (!target) return NextResponse.json({ error: "Staff account not found" }, { status: 404 });

  const [imports, transactions, checkins, batches, stock, purchases, payments, sales, cancellations, expenses] = await Promise.all([
    prisma.booking.count({ where: { imported_by: id } }),
    prisma.transaction.count({ where: { staff_id: id } }),
    prisma.checkIn.count({ where: { checked_in_by: id } }),
    prisma.stockBatch.count({ where: { received_by: id } }),
    prisma.stockMovement.count({ where: { performed_by: id } }),
    prisma.supplierPurchase.count({ where: { created_by: id } }),
    prisma.payment.count({ where: { paid_by: id } }),
    prisma.sale.count({ where: { cashier_id: id } }),
    prisma.sale.count({ where: { cancelled_by: id } }),
    prisma.branchExpense.count({ where: { recorded_by: id } }),
  ]);
  if (imports + transactions + checkins + batches + stock + purchases + payments + sales + cancellations + expenses > 0) {
    return NextResponse.json({ error: "This account has operational history and cannot be deleted. Disable it to preserve records." }, { status: 409 });
  }

  await prisma.$transaction([
    prisma.session.deleteMany({ where: { staff_id: id } }),
    prisma.staff.delete({ where: { id } }),
    prisma.auditLog.create({ data: { staff_id: admin.id, action: "STAFF_DELETED", entity_type: "Staff", entity_id: id, old_value: { name: target.name, email: target.email, role: target.role, branch_id: target.branch_id } } }),
  ]);
  return NextResponse.json({ success: true });
}
