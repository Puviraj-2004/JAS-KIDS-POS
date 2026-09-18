import { calculatePricing, lineAmount, sumAmounts, moneyAmount } from "@/lib/pricing";
import { randomBytes } from "crypto";
import { BookingType, Prisma, ItemCategory, PaymentDirection, PaymentMethod, PaymentSource, PaymentStatus, Role, TransactionType } from "@prisma/client";
import { NextResponse } from "next/server";
import { getCurrentStaff } from "@/lib/auth";
import { parseDateOnly } from "@/lib/date";
import { prisma } from "@/lib/prisma";

const allowedTypes = [BookingType.WALKIN_PLAYHOUSE, BookingType.WALKIN_BIRTHDAY];
type WalkInBookingType = (typeof allowedTypes)[number];
const bookingCategories: Record<WalkInBookingType, ItemCategory[]> = {
  [BookingType.WALKIN_PLAYHOUSE]: [ItemCategory.PLAYHOUSE_PACKAGE],
  [BookingType.WALKIN_BIRTHDAY]: [ItemCategory.BIRTHDAY_PACKAGE, ItemCategory.SERVICE_ITEM, ItemCategory.OTHER_PACKAGE],
};
type RequestedItem = { product_id: string; quantity: number };

function parsePaymentMethod(value: unknown): PaymentMethod | null {
  return typeof value === "string" && Object.values(PaymentMethod).includes(value as PaymentMethod) ? value as PaymentMethod : null;
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function code(prefix: string) {
  return `${prefix}-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

async function requireCounter(request: Request) {
  const staff = await getCurrentStaff(request);
  if (!staff) return { staff: null, response: NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 }) };
  if (staff.role !== Role.BRANCH_ADMIN && staff.role !== Role.CASHIER) return { staff: null, response: NextResponse.json({ success: false, error: "Only Branch Admin or Cashier can create walk-in bookings" }, { status: 403 }) };
  if (!staff.branch_id) return { staff: null, response: NextResponse.json({ success: false, error: "Staff branch is required" }, { status: 400 }) };
  return { staff, response: null };
}

export async function GET(request: Request) {
  const access = await requireCounter(request); if (access.response) return access.response;
  const staff = access.staff!;
  const requestedType = new URL(request.url).searchParams.get("booking_type");
  const bookingType: WalkInBookingType = requestedType === BookingType.WALKIN_BIRTHDAY
    ? BookingType.WALKIN_BIRTHDAY
    : BookingType.WALKIN_PLAYHOUSE;
  const products = await prisma.product.findMany({
    where: { branch_id: staff.branch_id!, is_active: true, item_category: { in: bookingCategories[bookingType] }, selling_price: { not: null } },
    orderBy: [{ item_category: "asc" }, { name: "asc" }],
  });
  return NextResponse.json({
    success: true,
    products: products.map(product => ({ id: product.id, name: product.name, item_category: product.item_category, selling_price: Number(product.selling_price) })),
  });
}

export async function POST(request: Request) {
  const access = await requireCounter(request); if (access.response) return access.response;
  const staff = access.staff!;
  const body = await request.json().catch(() => null);
  const bookingType = allowedTypes.includes(body?.booking_type)
    ? body.booking_type as WalkInBookingType
    : null;
  const paymentMethod = parsePaymentMethod(body?.payment_method);
  const childCount = Math.max(1, Math.floor(numberValue(body?.child_count) ?? 1));
  const childNames = Array.isArray(body?.child_names)
    ? body.child_names.filter((name: unknown): name is string => typeof name === "string").map((name: string) => name.trim()).filter(Boolean).slice(0, childCount)
    : [];
  let amountReceived: number;
  try { amountReceived = moneyAmount(body?.amount_received); }
  catch { return NextResponse.json({ success: false, error: "Invalid amount received" }, { status: 400 }); }
  const idempotencyKey = typeof body?.idempotency_key === "string" ? body.idempotency_key.trim() : "";
  if (!idempotencyKey || idempotencyKey.length > 100) return NextResponse.json({ success: false, error: "A checkout key is required" }, { status: 400 });
  const existing = await prisma.booking.findUnique({ where: { idempotency_key: idempotencyKey } });
  if (existing) return NextResponse.json(existing.branch_id === staff.branch_id ? { success: true, duplicate: true, booking_id: existing.id } : { error: "Checkout key is already in use" }, { status: existing.branch_id === staff.branch_id ? 200 : 409 });
  const bookingDate = typeof body?.booking_date === "string" ? parseDateOnly(body.booking_date) : new Date();
  const startTime = typeof body?.start_time === "string" ? body.start_time : "";
  const endTime = typeof body?.end_time === "string" ? body.end_time : "";
  const contactName = typeof body?.contact_name === "string" && body.contact_name.trim() ? body.contact_name.trim() : "Walk-in customer";
  const contactPhone = typeof body?.contact_phone === "string" && body.contact_phone.trim() ? body.contact_phone.trim() : null;
  const note = typeof body?.note === "string" && body.note.trim() ? body.note.trim() : null;
  const requestedItems: RequestedItem[] = Array.isArray(body?.items)
    ? body.items.map((item: { product_id?: unknown }) => ({
        product_id: typeof item.product_id === "string" ? item.product_id : "",
        quantity: 1,
      })).filter((item: RequestedItem) => item.product_id.length > 0)
    : [];

  if (!bookingType || !paymentMethod || amountReceived === null || amountReceived < 0 || Number.isNaN(bookingDate.getTime()) || !startTime || !endTime || requestedItems.length === 0) {
    return NextResponse.json({ success: false, error: "Booking type, items, date, time, payment method, and amount received are required" }, { status: 400 });
  }

  const branch = await prisma.branch.findUnique({ where: { id: staff.branch_id! } });
  if (!branch) return NextResponse.json({ success: false, error: "Staff branch is not available" }, { status: 404 });
  const productIds = Array.from(new Set<string>(requestedItems.map((item: { product_id: string }) => item.product_id)));
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, branch_id: staff.branch_id!, is_active: true, item_category: { in: bookingType ? bookingCategories[bookingType] : [] }, selling_price: { not: null } },
  });
  if (products.length !== productIds.length) return NextResponse.json({ success: false, error: "One or more selected items are not available for this branch" }, { status: 404 });

  const productMap = new Map(products.map(product => [product.id, product]));
  const mergedItems = requestedItems.reduce((result: Map<string, RequestedItem>, item) => {
    const existing = result.get(item.product_id);
    result.set(item.product_id, { product_id: item.product_id, quantity: (existing?.quantity ?? 0) + (item.quantity ?? 0) });
    return result;
  }, new Map<string, RequestedItem>());
  let bookingItems;
  let pricing;
  try {
  bookingItems = Array.from(mergedItems.values()).map(item => {
    const product = productMap.get(item.product_id)!;
    const unitPrice = Number(product.selling_price);
    const lineTotal = lineAmount(product.selling_price!.toString(), item.quantity.toFixed(3));
    return { product, quantity: item.quantity, unitPrice, lineTotal };
  });
  pricing = calculatePricing(sumAmounts(bookingItems.map(item => item.lineTotal)).toFixed(2), body);
  if (pricing.subtotal <= 0) throw new Error("Add a priced booking item.");
  } catch (error) { return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Invalid pricing" }, { status: 400 }); }
  const { subtotal, discount, discount_type, discount_value, total } = pricing;
  if (amountReceived < total) return NextResponse.json({ success: false, error: "Amount received cannot be less than the total" }, { status: 400 });

  const change = Math.round((amountReceived - total) * 100) / 100;
  const referenceNo = code(bookingType === BookingType.WALKIN_BIRTHDAY ? "JWB" : "JWP");
  const receiptNo = code("RCPT");
  const qrHash = code("WALKIN");
  const primaryItem = bookingItems[0];

  try {
    const result = await prisma.$transaction(async transaction => {
      const booking = await transaction.booking.create({ data: {
        reference_no: referenceNo,
        qr_hash: qrHash,
        booking_type: bookingType,
        branch_id: staff.branch_id!,
        parent_name: contactName,
        parent_phone: contactPhone,
        baby_name: null,
        child_count: bookingType === BookingType.WALKIN_PLAYHOUSE ? childCount : 1,
        booking_date: bookingDate,
        start_time: startTime,
        end_time: endTime,
        slot_name: primaryItem.product.name,
        service_name: bookingType === BookingType.WALKIN_BIRTHDAY ? "Birthday booking" : "Playhouse booking",
        subtotal, discount, discount_type, discount_value, idempotency_key: idempotencyKey,
      total_price: total,
        amount_paid_at_import: 0,
        amount_due_at_import: 0,
        external_payment_status: "paid",
        external_payment_method: paymentMethod,
        external_status: "active",
        external_qr_status: "used",
        source_payload: { source: "POS_WALKIN", item_count: bookingItems.length, note },
        imported_by: staff.id,
      } });
      for (const [index, name] of childNames.entries()) {
        await transaction.bookingChild.create({ data: { booking_id: booking.id, position: index + 1, name } });
      }
      for (const item of bookingItems) {
        await transaction.$executeRaw`
          INSERT INTO "booking_items" ("booking_id", "product_id", "item_name", "item_category", "quantity", "unit_price", "line_total")
          VALUES (${booking.id}::uuid, ${item.product.id}::uuid, ${item.product.name}, ${item.product.item_category}::"ItemCategory", ${item.quantity}, ${item.unitPrice}, ${item.lineTotal})
        `;
      }
      const checkin = await transaction.checkIn.create({ data: { booking_id: booking.id, branch_id: staff.branch_id!, checked_in_by: staff.id, amount_collected: total, payment_method: paymentMethod, note } });
      const posTransaction = await transaction.transaction.create({ data: { receipt_no: receiptNo, branch_id: staff.branch_id!, type: TransactionType.WALK_IN, checkin_id: checkin.id, customer_name: contactName, customer_phone: contactPhone, subtotal, discount, discount_type, discount_value, total, amount_received: amountReceived, change_given: change, payment_method: paymentMethod, payment_status: PaymentStatus.PAID, note, staff_id: staff.id } });
      if (total > 0) await transaction.payment.create({ data: { branch_id: staff.branch_id!, direction: PaymentDirection.INCOME, source: PaymentSource.BOOKING, amount: total, method: paymentMethod, booking_id: booking.id, checkin_id: checkin.id, paid_by: staff.id } });
      await transaction.receipt.create({ data: { transaction_id: posTransaction.id, receipt_no: receiptNo } });
      await transaction.auditLog.create({ data: { staff_id: staff.id, branch_id: staff.branch_id!, action: "WALKIN_BOOKING_CREATED", entity_type: "Booking", entity_id: booking.id, new_value: { reference_no: referenceNo, booking_type: bookingType, subtotal, discount, discount_type, discount_value, total, payment_method: paymentMethod, item_count: bookingItems.length } } });
      return { booking, checkin };
    });
    return NextResponse.json({
      success: true,
      booking_id: result.booking.id,
      reference_no: result.booking.reference_no,
      receipt_no: receiptNo,
      booking_type: result.booking.booking_type,
      qr_hash: result.booking.qr_hash,
      child_count: result.booking.child_count,
      booking_date: result.booking.booking_date.toISOString().slice(0, 10),
      start_time: result.booking.start_time,
      end_time: result.booking.end_time,
      slot_name: result.booking.slot_name,
      service_name: result.booking.service_name,
      subtotal, discount, discount_type, discount_value,
      total_price: total,
      amount_collected: total,
      amount_received: amountReceived,
      change_given: change,
      payment_method: paymentMethod,
      payment_status: PaymentStatus.PAID,
      items: bookingItems.map(item => ({ id: item.product.id, product_name: item.product.name, quantity: item.quantity, unit_price: item.unitPrice, line_total: item.lineTotal })),
      receipt: {
        branch_name: branch.name,
        branch_address: branch.address,
        branch_phone: branch.phone,
        served_by: staff.name,
        issued_at: result.checkin.checked_in_at,
        payment_method: paymentMethod,
      },
    }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const duplicate = await prisma.booking.findUnique({ where: { idempotency_key: idempotencyKey } });
      if (duplicate?.branch_id === staff.branch_id) return NextResponse.json({ success: true, duplicate: true, booking_id: duplicate.id });
    }
    return NextResponse.json({ success: false, error: "Walk-in booking could not be saved" }, { status: 500 });
  }
}
