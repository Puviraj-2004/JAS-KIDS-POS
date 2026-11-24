import { NextRequest, NextResponse } from "next/server";
import { getCurrentStaff } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { BookingType } from "@prisma/client";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const staff = await getCurrentStaff(request);
  if (!staff) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const booking = await prisma.booking.findUnique({
    where: { id },
    include: { checkin: true },
  });
  if (!booking) return NextResponse.json({ success: false, error: "Booking not found" }, { status: 404 });
  if (staff.branch_id && booking.branch_id !== staff.branch_id) {
    return NextResponse.json({ success: false, error: "This booking belongs to a different branch" }, { status: 403 });
  }
  const isPlayhouseBooking = booking.booking_type === BookingType.ONLINE_PLAYHOUSE
    || booking.booking_type === BookingType.WALKIN_PLAYHOUSE
    || booking.service_name?.toLowerCase().includes("playhouse")
    || booking.slot_name?.toLowerCase().includes("playhouse");
  if (!isPlayhouseBooking) {
    return NextResponse.json({ success: false, error: "Walk out is available only for playhouse bookings" }, { status: 409 });
  }
  if (!booking.checkin) return NextResponse.json({ success: false, error: "Only checked-in bookings can be walked out" }, { status: 409 });
  if (booking.checkin.walked_out_at) {
    return NextResponse.json({ success: false, error: "This booking has already been walked out" }, { status: 409 });
  }

  const walkedOutAt = new Date();
  try {
    const result = await prisma.$transaction(async (transaction) => {
      const changed = await transaction.checkIn.updateMany({
        where: { id: booking.checkin!.id, walked_out_at: null },
        data: { walked_out_at: walkedOutAt, walked_out_by: staff.id },
      });
      if (changed.count !== 1) throw new Error("ALREADY_WALKED_OUT");
      await transaction.auditLog.create({
        data: {
          staff_id: staff.id,
          branch_id: booking.branch_id,
          action: "BOOKING_WALKED_OUT",
          entity_type: "CheckIn",
          entity_id: booking.checkin!.id,
          new_value: { booking_id: booking.id, reference_no: booking.reference_no, walked_out_at: walkedOutAt.toISOString() },
        },
      });
      return walkedOutAt;
    });

    return NextResponse.json({ success: true, walked_out_at: result.toISOString() });
  } catch (error) {
    if (error instanceof Error && error.message === "ALREADY_WALKED_OUT") {
      return NextResponse.json({ success: false, error: "This booking has already been walked out" }, { status: 409 });
    }
    return NextResponse.json({ success: false, error: "Walk out could not be recorded" }, { status: 500 });
  }
}
