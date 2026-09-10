import axios from "axios";
import { BookingType, Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentStaff } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { extractQrHash } from "@/lib/qr";

type TicketChild = {
  name: string;
  date_of_birth: string | null;
  age_category: string | null;
};

type PublicTicket = {
  booking_id: string;
  reference_no: string;
  qr_hash: string;
  booking_type?: string | null;
  branch_id?: string | null;
  parent_name: string;
  parent_phone?: string | null;
  baby_name: string | null;
  child_count: number;
  children: TicketChild[];
  date: string;
  start_time: string;
  end_time: string;
  slot_name: string | null;
  status: string;
  qr_status: string;
  payment_status: string;
  payment_method: string | null;
  total_price: number;
  amount_paid: number;
  amount_due: number;
  branch_name: string;
  service_name: string | null;
};

function parseBookingType(ticket: PublicTicket): BookingType {
  const value = ticket.booking_type?.toLowerCase().replaceAll("-", "_").replaceAll(" ", "_") ?? "";
  const serviceText = `${ticket.service_name ?? ""} ${ticket.slot_name ?? ""} ${ticket.reference_no ?? ""}`.toLowerCase();
  const birthday = value.includes("birthday") || serviceText.includes("birthday");
  const walkIn = value.includes("walk") || value.includes("walkin") || value.includes("walk_in");
  const online = value.includes("online");
  if (birthday && walkIn) return BookingType.WALKIN_BIRTHDAY;
  if (birthday && online) return BookingType.ONLINE_BIRTHDAY;
  if (birthday) return BookingType.ONLINE_BIRTHDAY;
  if (walkIn) return BookingType.WALKIN_PLAYHOUSE;
  if (online) return BookingType.ONLINE_PLAYHOUSE;
  return BookingType.UNKNOWN;
}

function parseDate(value: string): Date | null {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function POST(request: NextRequest) {
  const staff = await getCurrentStaff(request);
  if (!staff) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const qrHash = extractQrHash(body?.qr_hash);
  if (!qrHash) {
    return NextResponse.json(
      { success: false, error: { code: "INVALID_QR", message: "A valid booking QR is required" } },
      { status: 400 },
    );
  }

  const apiUrl = process.env.JASKIDS_API_URL?.replace(/\/$/, "");
  if (!apiUrl) {
    return NextResponse.json(
      { success: false, error: { code: "CONFIGURATION_ERROR", message: "JAS Kids ticket service is not configured" } },
      { status: 500 },
    );
  }

  let ticket: PublicTicket;
  try {
    const response = await axios.get<{ ticket: PublicTicket }>(
      `${apiUrl}/api/public/ticket`,
      { params: { qr_hash: qrHash }, timeout: 10_000 },
    );
    ticket = response.data.ticket;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      const message = error.response.data?.error ?? "Ticket could not be loaded";
      return NextResponse.json(
        { success: false, error: { code: "TICKET_LOOKUP_FAILED", message } },
        { status: error.response.status },
      );
    }
    return NextResponse.json(
      { success: false, error: { code: "TICKET_SERVICE_UNAVAILABLE", message: "JAS Kids ticket service is unavailable" } },
      { status: 502 },
    );
  }

  if (!ticket?.booking_id || !ticket.reference_no || !ticket.qr_hash) {
    return NextResponse.json(
      { success: false, error: { code: "INVALID_TICKET", message: "JAS Kids returned an incomplete ticket" } },
      { status: 502 },
    );
  }
  if (ticket.qr_status !== "issued") {
    const alreadyUsed = ticket.qr_status === "used";
    return NextResponse.json(
      {
        success: false,
        error: {
          code: alreadyUsed ? "ALREADY_USED" : "INVALID_QR_STATUS",
          message: alreadyUsed ? "This QR has already been used" : "This QR is not valid for entry",
        },
      },
      { status: 422 },
    );
  }

  const branch = staff.branch_id
    ? await prisma.branch.findUnique({ where: { id: staff.branch_id } })
    : await prisma.branch.findFirst({
        where: { is_active: true, name: { equals: ticket.branch_name, mode: "insensitive" } },
      });

  if (!branch) {
    return NextResponse.json(
      { success: false, error: { code: "BRANCH_NOT_CONFIGURED", message: "This ticket branch is not configured in POS" } },
      { status: 422 },
    );
  }
  const nameMismatch = branch.name.trim().toLowerCase() !== ticket.branch_name.trim().toLowerCase();
  if (nameMismatch) {
    return NextResponse.json(
      { success: false, error: { code: "BRANCH_NOT_PERMITTED", message: "This booking belongs to a different branch" } },
      { status: 403 },
    );
  }

  const bookingDate = parseDate(ticket.date);
  if (!bookingDate) {
    return NextResponse.json(
      { success: false, error: { code: "INVALID_TICKET", message: "The ticket contains an invalid booking date" } },
      { status: 502 },
    );
  }

  const children = Array.isArray(ticket.children) ? ticket.children : [];
  const bookingType = parseBookingType(ticket);
  const bookingData = {
    external_booking_id: ticket.booking_id,
    reference_no: ticket.reference_no,
    qr_hash: ticket.qr_hash,
    booking_type: bookingType,
    branch_id: branch.id,
    parent_name: ticket.parent_name,
    parent_phone: ticket.parent_phone ?? null,
    baby_name: ticket.baby_name,
    child_count: Number(ticket.child_count ?? children.length ?? 1),
    booking_date: bookingDate,
    start_time: ticket.start_time,
    end_time: ticket.end_time,
    slot_name: ticket.slot_name,
    service_name: ticket.service_name,
    total_price: Number(ticket.total_price ?? 0),
    amount_paid_at_import: Number(ticket.amount_paid ?? 0),
    amount_due_at_import: Number(ticket.amount_due ?? 0),
    external_payment_status: ticket.payment_status ?? "unknown",
    external_payment_method: ticket.payment_method,
    external_status: ticket.status ?? "unknown",
    external_qr_status: ticket.qr_status,
    source_payload: ticket as Prisma.InputJsonValue,
    imported_by: staff.id,
  };

  try {
    const savedBooking = await prisma.$transaction(async (transaction) => {
      const existing = await transaction.booking.findFirst({
        where: {
          OR: [
            { external_booking_id: ticket.booking_id },
            { qr_hash: ticket.qr_hash },
            { reference_no: ticket.reference_no },
          ],
        },
      });
      const booking = existing
        ? await transaction.booking.update({ where: { id: existing.id }, data: bookingData })
        : await transaction.booking.create({ data: bookingData });

      await transaction.bookingChild.deleteMany({ where: { booking_id: booking.id } });
      if (children.length > 0) {
        await transaction.bookingChild.createMany({
          data: children.map((child, index) => ({
            booking_id: booking.id,
            position: index + 1,
            name: child.name || ticket.baby_name || `Child ${index + 1}`,
            date_of_birth: child.date_of_birth ? parseDate(child.date_of_birth) : null,
            age_category: child.age_category,
          })),
        });
      }

      await transaction.auditLog.create({
        data: {
          staff_id: staff.id,
          branch_id: branch.id,
          action: existing ? "BOOKING_REFRESHED" : "BOOKING_IMPORTED",
          entity_type: "Booking",
          entity_id: booking.id,
          new_value: {
            external_booking_id: ticket.booking_id,
            reference_no: ticket.reference_no,
            qr_hash: ticket.qr_hash,
          },
        },
      });
      return booking;
    });

    return NextResponse.json({
      success: true,
      booking: {
        id: ticket.booking_id,
        pos_booking_id: savedBooking.id,
        is_walk_in: bookingType === BookingType.WALKIN_PLAYHOUSE || bookingType === BookingType.WALKIN_BIRTHDAY,
        booking_type: bookingType,
        branch_id: branch.id,
        branch_name: branch.name,
        qr_hash: ticket.qr_hash,
        reference_no: ticket.reference_no,
        parent_name: ticket.parent_name,
        parent_phone: ticket.parent_phone ?? null,
        baby_name: ticket.baby_name,
        child_count: Number(ticket.child_count ?? 0),
        children,
        date: ticket.date,
        start_time: ticket.start_time,
        end_time: ticket.end_time,
        slot_name: ticket.slot_name,
        service_name: ticket.service_name,
        total_price: Number(ticket.total_price ?? 0),
        amount_paid: Number(ticket.amount_paid ?? 0),
        amount_due: Number(ticket.amount_due ?? 0),
        payment_status: ticket.payment_status,
        payment_method: ticket.payment_method,
        membership_id: null,
        membership_value_lkr: null,
      },
    });
  } catch {
    return NextResponse.json(
      { success: false, error: { code: "IMPORT_FAILED", message: "Ticket was found but could not be saved in POS" } },
      { status: 500 },
    );
  }
}
