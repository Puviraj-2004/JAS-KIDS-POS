import {
  BookingType,
  PaymentDirection,
  PaymentMethod,
  PaymentSource,
  PaymentStatus,
  TransactionType,
} from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentStaff } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { extractQrHash } from "@/lib/qr";

function parsePaymentMethod(value: unknown): PaymentMethod | null {
  if (typeof value !== "string") return null;
  const normalized = value.toUpperCase();
  return Object.values(PaymentMethod).includes(normalized as PaymentMethod)
    ? (normalized as PaymentMethod)
    : null;
}

function parsePaymentStatus(value: string): PaymentStatus {
  const normalized = value.toUpperCase();
  return Object.values(PaymentStatus).includes(normalized as PaymentStatus)
    ? (normalized as PaymentStatus)
    : PaymentStatus.UNPAID;
}

function transactionType(bookingType: BookingType): TransactionType {
  if (bookingType === BookingType.WALKIN_PLAYHOUSE || bookingType === BookingType.WALKIN_BIRTHDAY) return TransactionType.WALK_IN;
  if (bookingType === BookingType.ONLINE_PLAYHOUSE || bookingType === BookingType.ONLINE_BIRTHDAY) return TransactionType.ONLINE_BOOKING;
  return TransactionType.UNKNOWN_BOOKING;
}

export async function POST(request: NextRequest) {
  const staff = await getCurrentStaff(request);
  if (!staff) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const qrHash = extractQrHash(body?.qr_hash);
  if (!qrHash) {
    return NextResponse.json({ success: false, error: "A valid booking QR is required" }, { status: 400 });
  }

  const requestedPaymentMethod = body?.counter_payment_method;
  const counterPaymentMethod = parsePaymentMethod(requestedPaymentMethod);
  if (requestedPaymentMethod != null && !counterPaymentMethod) {
    return NextResponse.json({ success: false, error: "Invalid counter payment method" }, { status: 400 });
  }

  const booking = await prisma.booking.findUnique({
    where: { qr_hash: qrHash },
    include: { branch: true, checkin: { include: { staff: true, transaction: { include: { receipt: true } } } } },
  });
  if (!booking) {
    return NextResponse.json(
      { success: false, error: { code: "BOOKING_NOT_IMPORTED", message: "Scan and verify this QR before check-in" } },
      { status: 404 },
    );
  }
  if (staff.branch_id && booking.branch_id !== staff.branch_id) {
    return NextResponse.json(
      { success: false, error: { code: "BRANCH_NOT_PERMITTED", message: "This booking belongs to a different branch" } },
      { status: 403 },
    );
  }
  if (booking.checkin) {
    return NextResponse.json({
      success: true,
      already_checked_in: true,
      receipt_no: booking.checkin.transaction?.receipt?.receipt_no ?? null,
      transaction_id: booking.checkin.transaction?.id ?? null,
      checkin_id: booking.checkin.id,
      booking_type: booking.booking_type,
      amount_collected: Number(booking.checkin.amount_collected),
      payment_status: booking.checkin.transaction?.payment_status ?? parsePaymentStatus(booking.external_payment_status),
      receipt: {
        branch_name: booking.branch.name,
        branch_address: booking.branch.address,
        branch_phone: booking.branch.phone,
        served_by: booking.checkin.staff.name,
        issued_at: booking.checkin.checked_in_at,
        payment_method: booking.checkin.payment_method,
      },
    });
  }
  if (booking.external_qr_status !== "issued") {
    return NextResponse.json(
      { success: false, error: { code: "INVALID_QR_STATUS", message: "This QR is not valid for entry" } },
      { status: 422 },
    );
  }

  const amountDue = Math.max(0, Number(booking.amount_due_at_import));
  if (amountDue > 0 && !counterPaymentMethod) {
    return NextResponse.json(
      { success: false, error: "Select a payment method for the outstanding amount" },
      { status: 400 },
    );
  }

  const originalPaymentMethod = parsePaymentMethod(booking.external_payment_method);
  const paymentMethod = counterPaymentMethod ?? originalPaymentMethod;
  if (!paymentMethod) {
    return NextResponse.json(
      { success: false, error: "The booking does not have a valid payment method" },
      { status: 422 },
    );
  }

  const amountCollected = amountDue;
  const importedAmountPaid = Number(booking.amount_paid_at_import);
  const finalAmountPaid = importedAmountPaid + amountCollected;
  const paymentStatus = amountCollected >= amountDue
    ? PaymentStatus.PAID
    : parsePaymentStatus(booking.external_payment_status);
  const receiptNo = `RCPT-${Date.now()}`;

  try {
    const result = await prisma.$transaction(async (transaction) => {
      const checkin = await transaction.checkIn.create({
        data: {
          booking_id: booking.id,
          branch_id: booking.branch_id,
          checked_in_by: staff.id,
          amount_collected: amountCollected,
          payment_method: paymentMethod,
        },
      });
      const posTransaction = await transaction.transaction.create({
        data: {
          receipt_no: receiptNo,
          branch_id: booking.branch_id,
          type: transactionType(booking.booking_type),
          checkin_id: checkin.id,
          customer_name: booking.parent_name,
          customer_phone: booking.parent_phone,
          subtotal: amountCollected,
          discount: 0,
          total: amountCollected,
          amount_received: amountCollected,
          change_given: 0,
          payment_method: paymentMethod,
          payment_status: paymentStatus,
          staff_id: staff.id,
        },
      });
      await transaction.receipt.create({
        data: { transaction_id: posTransaction.id, receipt_no: receiptNo },
      });
      if (amountCollected > 0) {
        await transaction.payment.create({
          data: {
            branch_id: booking.branch_id,
            direction: PaymentDirection.INCOME,
            source: PaymentSource.BOOKING,
            amount: amountCollected,
            method: paymentMethod,
            booking_id: booking.id,
            checkin_id: checkin.id,
            paid_by: staff.id,
          },
        });
      }
      await transaction.auditLog.create({
        data: {
          staff_id: staff.id,
          branch_id: booking.branch_id,
          action: "BOOKING_CHECKED_IN",
          entity_type: "CheckIn",
          entity_id: checkin.id,
          new_value: {
            booking_id: booking.id,
            external_booking_id: booking.external_booking_id,
            qr_hash: booking.qr_hash,
            amount_collected: amountCollected,
            payment_method: paymentMethod,
          },
        },
      });
      return { checkin, posTransaction };
    });

    return NextResponse.json({
      success: true,
      receipt_no: receiptNo,
      transaction_id: result.posTransaction.id,
      checkin_id: result.checkin.id,
      booking_type: booking.booking_type,
      amount_collected: amountCollected,
      amount_paid: finalAmountPaid,
      payment_status: paymentStatus,
      receipt: {
        branch_name: booking.branch.name,
        branch_address: booking.branch.address,
        branch_phone: booking.branch.phone,
        served_by: staff.name,
        issued_at: result.checkin.checked_in_at,
        payment_method: paymentMethod,
      },
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "The POS check-in and receipt could not be saved" },
      { status: 500 },
    );
  }
}
