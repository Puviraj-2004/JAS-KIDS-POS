import { NextRequest, NextResponse } from "next/server";
import { getCurrentStaff } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { BookingType, CheckInStatus, Role } from "@prisma/client";
import { todaySriLanka, sriLankaDateBoundary, formatDateOnly } from "@/lib/date";

export const dynamic = "force-dynamic";

/**
 * Parses a slot date string (YYYY-MM-DD) and a time string (HH:mm or HH:mm:ss)
 * into a valid Date object anchored to Sri Lanka timezone (+05:30).
 */
function parseSlotDateTime(dateStr: string, timeStr: string): Date | null {
  if (!dateStr || !timeStr) return null;
  const parts = timeStr.trim().split(":");
  if (parts.length < 2) return null;
  const hour = parseInt(parts[0], 10);
  const min = parseInt(parts[1], 10);
  if (isNaN(hour) || isNaN(min)) return null;

  const hStr = hour.toString().padStart(2, "0");
  const mStr = min.toString().padStart(2, "0");
  const isoStr = `${dateStr}T${hStr}:${mStr}:00+05:30`;
  const parsed = new Date(isoStr);
  return isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Formats a 24-hour time string ("10:00" or "10:00:00") into a friendly 12-hour label ("10:00 AM").
 */
function formatTime12(timeStr: string): string {
  if (!timeStr) return "";
  const [h, m] = timeStr.trim().split(":").map(Number);
  if (isNaN(h) || isNaN(m)) return timeStr;
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 || 12;
  return `${hour12}:${m.toString().padStart(2, "0")} ${period}`;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const requestedBranchId = searchParams.get("branch_id") || searchParams.get("branch");

    const staff = await getCurrentStaff(request);
    let branch = null;

    // Strict role & branch authorization
    if (staff) {
      if (staff.role === Role.SUPER_ADMIN) {
        // Super admin can inspect requested branch or fallback to assigned/first active
        if (requestedBranchId) {
          branch = await prisma.branch.findUnique({
            where: { id: requestedBranchId },
            select: { id: true, name: true, is_active: true },
          });
        }
        if (!branch && staff.branch_id) {
          branch = await prisma.branch.findUnique({
            where: { id: staff.branch_id },
            select: { id: true, name: true, is_active: true },
          });
        }
      } else {
        // Cashiers and Branch Admins are locked strictly to their assigned branch
        if (staff.branch_id) {
          branch = await prisma.branch.findUnique({
            where: { id: staff.branch_id },
            select: { id: true, name: true, is_active: true },
          });
        }
      }
    } else {
      // Unauthenticated display mode (e.g. wall TV / Android TV kiosk display)
      if (requestedBranchId) {
        branch = await prisma.branch.findUnique({
          where: { id: requestedBranchId },
          select: { id: true, name: true, is_active: true },
        });
      }
    }

    // Default fallback to first active branch if none resolved
    if (!branch) {
      branch = await prisma.branch.findFirst({
        where: { is_active: true },
        select: { id: true, name: true, is_active: true },
      });
    }

    if (!branch) {
      return NextResponse.json(
        { success: false, error: "No active branch found" },
        { status: 404 }
      );
    }

    // Sri Lanka start of today
    const today = todaySriLanka();
    const startOfToday = sriLankaDateBoundary(today, false);

    // Fetch checked-in playhouse bookings for today
    const checkins = await prisma.checkIn.findMany({
      where: {
        branch_id: branch.id,
        status: CheckInStatus.CHECKED_IN,
        checked_in_at: { gte: startOfToday },
        booking: {
          OR: [
            {
              booking_type: {
                in: [BookingType.ONLINE_PLAYHOUSE, BookingType.WALKIN_PLAYHOUSE],
              },
            },
            {
              service_name: {
                contains: "playhouse",
                mode: "insensitive",
              },
            },
            {
              slot_name: {
                contains: "playhouse",
                mode: "insensitive",
              },
            },
          ],
        },
      },
      include: {
        booking: {
          include: {
            children: { orderBy: { position: "asc" } },
            items: true,
          },
        },
      },
      orderBy: {
        checked_in_at: "asc",
      },
    });

    const now = Date.now();
    const GRACE_PERIOD_MS = 15 * 60 * 1000; // Keep showing for 15 minutes after session expiration

    const activeChildren = [];

    for (const checkin of checkins) {
      const booking = checkin.booking;
      if (!booking) continue;

      let sessionStartDate: Date;
      let sessionEndDate: Date;
      let durationMinutes = 60;
      let slotTimeLabel = "";

      const isOnlineScheduled = booking.booking_type === BookingType.ONLINE_PLAYHOUSE;

      if (isOnlineScheduled && booking.start_time && booking.end_time) {
        // Scheduled Online Booking: anchored to scheduled start_time and end_time
        const bookingDateStr = formatDateOnly(booking.booking_date) || today;
        const slotStart = parseSlotDateTime(bookingDateStr, booking.start_time);
        const slotEnd = parseSlotDateTime(bookingDateStr, booking.end_time);

        if (slotStart && slotEnd && slotEnd.getTime() > slotStart.getTime()) {
          sessionStartDate = slotStart;
          sessionEndDate = slotEnd;
          durationMinutes = Math.round((slotEnd.getTime() - slotStart.getTime()) / 60000);
          slotTimeLabel = `${formatTime12(booking.start_time)} – ${formatTime12(booking.end_time)}`;
        } else {
          // Fallback if parsing failed
          sessionStartDate = checkin.checked_in_at;
          sessionEndDate = new Date(checkin.checked_in_at.getTime() + durationMinutes * 60000);
          slotTimeLabel = `${durationMinutes} Mins Pass`;
        }
      } else {
        // Walk-in Booking: anchored to actual counter check-in timestamp
        if (booking.start_time && booking.end_time) {
          const [sh, sm] = booking.start_time.split(":").map(Number);
          const [eh, em] = booking.end_time.split(":").map(Number);
          if (!isNaN(sh) && !isNaN(eh)) {
            const diff = (eh * 60 + (em || 0)) - (sh * 60 + (sm || 0));
            if (diff > 0 && diff <= 480) durationMinutes = diff;
          }
        } else if (booking.slot_name) {
          const match = booking.slot_name.match(/(\d+)\s*(min|hr|hour)/i);
          if (match) {
            const val = parseInt(match[1], 10);
            const unit = match[2].toLowerCase();
            durationMinutes = unit.startsWith("hr") || unit.startsWith("hour") ? val * 60 : val;
          }
        }

        sessionStartDate = checkin.checked_in_at;
        sessionEndDate = new Date(checkin.checked_in_at.getTime() + durationMinutes * 60000);
        slotTimeLabel = `${durationMinutes} Mins Session`;
      }

      // Filter out sessions that expired more than 15 minutes ago
      if (now > sessionEndDate.getTime() + GRACE_PERIOD_MS) {
        continue;
      }

      const childCount = Math.max(1, booking.child_count || 1);
      const childNames = booking.children.map((c) => c.name.trim()).filter(Boolean);

      for (let i = 0; i < childCount; i++) {
        const displayName =
          childNames[i] ||
          (i === 0 ? booking.baby_name?.trim() || "" : "") ||
          `Child ${i + 1}`;

        activeChildren.push({
          childKey: `${booking.id}-${i}`,
          bookingId: booking.id,
          referenceNo: booking.reference_no,
          displayName,
          childNumber: i + 1,
          totalChildren: childCount,
          sessionStart: sessionStartDate.toISOString(),
          sessionEnd: sessionEndDate.toISOString(),
          checkinAt: checkin.checked_in_at.toISOString(),
          durationMinutes,
          slotTimeLabel,
          bookingType: booking.booking_type,
          parentName: booking.parent_name,
        });
      }
    }

    // Available branches for switcher (Super Admin or Unauthenticated setup)
    const canSwitchBranches = !staff || staff.role === Role.SUPER_ADMIN;
    let availableBranches: Array<{ id: string; name: string }> = [];
    if (canSwitchBranches) {
      availableBranches = await prisma.branch.findMany({
        where: { is_active: true },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      });
    }

    return NextResponse.json({
      success: true,
      branch: {
        id: branch.id,
        name: branch.name,
      },
      availableBranches,
      count: activeChildren.length,
      children: activeChildren,
      refreshedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("TV API error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to load TV active sessions" },
      { status: 500 }
    );
  }
}
