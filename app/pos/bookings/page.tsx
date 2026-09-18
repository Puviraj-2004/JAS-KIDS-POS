import { CalendarClock, Plus, QrCode } from "lucide-react";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { BookingType, Prisma, Role } from "@prisma/client";
import { getCurrentStaff } from "@/lib/auth";
import { formatDateOnly, formatSriLankaDate, todaySriLanka } from "@/lib/date";
import { prisma } from "@/lib/prisma";
import styles from "./bookings.module.css";

const money = new Intl.NumberFormat("en-LK", { style: "currency", currency: "LKR" });
const bookingTypeOptions = [
  { value: BookingType.ONLINE_PLAYHOUSE, label: "Online Playhouse" },
  { value: BookingType.WALKIN_PLAYHOUSE, label: "Walk-in Playhouse" },
  { value: BookingType.ONLINE_BIRTHDAY, label: "Online Birthday" },
  { value: BookingType.WALKIN_BIRTHDAY, label: "Walk-in Birthday" },
  { value: BookingType.UNKNOWN, label: "Unknown" },
];

function typeLabel(value: BookingType) {
  return bookingTypeOptions.find((option) => option.value === value)?.label ?? value.replaceAll("_", " ");
}

function today() {
  return todaySriLanka();
}

export default async function BookingsPage({ searchParams }: { searchParams: Promise<{ q?: string; type?: string; state?: string; branch_id?: string }> }) {
  const staff = await getCurrentStaff(new Request("http://localhost", { headers: await headers() }));
  if (!staff) redirect("/login");
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const isSuperAdmin = staff.role === Role.SUPER_ADMIN;
  const canCreateBooking = staff.role === Role.BRANCH_ADMIN || staff.role === Role.CASHIER;
  const selectedBranchId = isSuperAdmin && typeof params.branch_id === "string" ? params.branch_id : staff.branch_id ?? "";
  const bookingType = Object.values(BookingType).includes(params.type as BookingType) ? params.type as BookingType : undefined;
  const where: Prisma.BookingWhereInput = {
    ...(selectedBranchId ? { branch_id: selectedBranchId } : {}),
    ...(bookingType ? { booking_type: bookingType } : {}),
    ...(params.state === "checked_in" ? { checkin: { isNot: null } } : params.state === "pending" ? { checkin: null } : {}),
    ...(q ? { OR: [{ reference_no: { contains: q, mode: "insensitive" } }, { parent_name: { contains: q, mode: "insensitive" } }, { qr_hash: { contains: q, mode: "insensitive" } }] } : {}),
  };
  const [bookings, branches] = await Promise.all([
    prisma.booking.findMany({ where, include: { branch: true, checkin: true }, orderBy: [{ booking_date: "desc" }, { start_time: "desc" }], take: 200 }),
    isSuperAdmin ? prisma.branch.findMany({ where: { is_active: true }, orderBy: { name: "asc" } }) : Promise.resolve([]),
  ]);
  const todayKey = today();
  const checkedInCount = bookings.filter((booking) => booking.checkin).length;
  const todayCount = bookings.filter((booking) => formatDateOnly(booking.booking_date) === todayKey).length;
  const revenue = bookings.reduce((sum, booking) => sum + Number(booking.total_price), 0);
  const slotRows = Object.values(bookings.reduce<Record<string, { key: string; date: Date; start: string; end: string; type: BookingType; count: number }>>((result, booking) => {
    const key = `${formatDateOnly(booking.booking_date)}-${booking.start_time}-${booking.end_time}-${booking.booking_type}`;
    result[key] ??= { key, date: booking.booking_date, start: booking.start_time, end: booking.end_time, type: booking.booking_type, count: 0 };
    result[key].count += 1;
    return result;
  }, {})).slice(0, 6);

  return <main className={styles.page}><div className={styles.shell}>
    <header className={styles.heading}><div><p>BOOKING RECORDS</p><h1>Bookings</h1><span>Review booking records, scan QR tickets, and create walk-in bookings.</span></div>{canCreateBooking && <div className={styles.headerActions}><Link className={styles.primary} href="/pos/bookings/new"><Plus size={18} aria-hidden="true"/>New Booking</Link><Link href="/pos/scan"><QrCode size={18} aria-hidden="true"/>Scan QR</Link></div>}</header>
    <form className={styles.filters}>{isSuperAdmin && <select name="branch_id" defaultValue={selectedBranchId} aria-label="Branch"><option value="">All branches</option>{branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select>}<input name="q" defaultValue={q} aria-label="Search bookings" placeholder="Reference, parent, or QR code" /><select name="type" defaultValue={params.type ?? ""} aria-label="Booking type"><option value="">All booking types</option>{bookingTypeOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select><select name="state" defaultValue={params.state ?? ""} aria-label="Check-in status"><option value="">All statuses</option><option value="pending">Awaiting check-in</option><option value="checked_in">Checked in</option></select><button type="submit">Filter</button></form>
    <section className={styles.metrics} aria-label="Booking summary"><div><strong>{bookings.length}</strong><span>Visible bookings</span></div><div><strong>{todayCount}</strong><span>Today</span></div><div><strong>{bookings.length - checkedInCount}</strong><span>Awaiting check-in</span></div><div><strong>{money.format(revenue)}</strong><span>Booking value</span></div></section>
    <section className={styles.slotCard}><div className={styles.cardHeader}><div><p>SLOT OVERVIEW</p><h2>Booking count by slot</h2></div><CalendarClock size={20} aria-hidden="true"/></div>{slotRows.length === 0 ? <p className={styles.empty}>No slot activity for the current filters.</p> : <div className={styles.slotGrid}>{slotRows.map(slot => <div key={slot.key}><strong>{formatSriLankaDate(slot.date)}</strong><span>{slot.start.slice(0, 5)}–{slot.end.slice(0, 5)}</span><small>{typeLabel(slot.type)} · {slot.count} booking{slot.count === 1 ? "" : "s"}</small></div>)}</div>}</section>
    <section className={styles.tableCard}><div className={styles.cardHeader}><div><p>BOOKING TABLE</p><h2>Records</h2></div><span>{bookings.length} shown</span></div>{bookings.length === 0 ? <p className={styles.empty}>No bookings match these filters.</p> : <div className={styles.tableWrap}><table><thead><tr><th>Booking</th><th>Customer</th>{isSuperAdmin && <th>Branch</th>}<th>Schedule</th><th>Type</th><th data-numeric>Discount</th><th data-numeric>Total</th><th>Status</th></tr></thead><tbody>{bookings.map((booking) => <tr key={booking.id}><td><Link href={`/pos/bookings/${booking.id}`}>{booking.reference_no}</Link><small>{booking.qr_hash}</small></td><td><strong>{booking.parent_name}</strong><small>{booking.baby_name || `${booking.child_count} child`}</small></td>{isSuperAdmin && <td>{booking.branch.name}</td>}<td>{booking.booking_date.toLocaleDateString("en-GB")}<small>{booking.start_time.slice(0,5)}–{booking.end_time.slice(0,5)}</small></td><td><span className={styles.badge}>{typeLabel(booking.booking_type)}</span></td><td data-numeric>{money.format(Number(booking.discount) + Number(booking.external_discount))}</td><td data-numeric>{money.format(Number(booking.total_price))}</td><td><span className={booking.checkin ? styles.complete : styles.pending}>{booking.checkin ? "Checked in" : "Awaiting"}</span></td></tr>)}</tbody></table></div>}</section>
  </div></main>;
}
