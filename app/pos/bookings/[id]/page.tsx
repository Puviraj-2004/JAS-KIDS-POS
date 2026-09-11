import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { BookingReceipt } from "@/components/pos/Receipt";
import { getCurrentStaff } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import styles from "../bookings.module.css";
import { PrintBookingReceiptButton } from "./PrintBookingReceiptButton";

const money = new Intl.NumberFormat("en-LK", { style: "currency", currency: "LKR" });
const Field = ({ label, value }: { label: string; value: string | number }) => <div className={styles.field}><span>{label}</span><strong>{value}</strong></div>;
const durationMinutes = (start: string, end: string) => {
  const [startHour, startMinute] = start.split(":").map(Number);
  const [endHour, endMinute] = end.split(":").map(Number);
  return Math.max(0, endHour * 60 + endMinute - (startHour * 60 + startMinute));
};
const bookingTypeLabel = (value: string) => {
  if (value === "ONLINE_PLAYHOUSE") return "Online Playhouse";
  if (value === "WALKIN_PLAYHOUSE") return "Walk-in Playhouse";
  if (value === "ONLINE_BIRTHDAY") return "Online Birthday";
  if (value === "WALKIN_BIRTHDAY") return "Walk-in Birthday";
  return "Booking";
};
type BookingItemRow = { id: string; item_name: string; quantity: string; unit_price: string; line_total: string };

export default async function BookingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const staff = await getCurrentStaff(new Request("http://localhost", { headers: await headers() }));
  if (!staff) redirect("/login");
  const booking = await prisma.booking.findFirst({ where: { id, ...(staff.branch_id ? { branch_id: staff.branch_id } : {}) }, include: { branch: true, children: { orderBy: { position: "asc" } }, checkin: { include: { staff: true, transaction: { include: { receipt: true } } } } } });
  if (!booking) notFound();
  const bookingItems = await prisma.$queryRaw<BookingItemRow[]>`
    SELECT "id"::text, "item_name", "quantity"::text, "unit_price"::text, "line_total"::text
    FROM "booking_items"
    WHERE "booking_id" = ${booking.id}::uuid
    ORDER BY "created_at" ASC
  `;
  const receiptNo = booking.checkin?.transaction?.receipt?.receipt_no ?? null;
  return <main className={styles.page}><div className={styles.shell}><nav className={styles.top}><Link href="/pos/bookings">← All bookings</Link><Link className={styles.primary} href="/pos/scan">Scan another</Link></nav><header className={styles.heading}><p>{bookingTypeLabel(booking.booking_type).toUpperCase()}</p><h1>{booking.reference_no}</h1><span>Imported {booking.imported_at.toLocaleString("en-GB")} · {booking.branch.name}</span></header><div className={styles.detail}><section className={styles.panel}><h2>Booking details</h2><div className={styles.grid}><Field label="Parent" value={booking.parent_name}/><Field label="Phone" value={booking.parent_phone || "Not provided"}/><Field label="Child" value={booking.baby_name || "Not provided"}/><Field label="Children" value={booking.child_count}/><Field label="Date" value={booking.booking_date.toLocaleDateString("en-GB")}/><Field label="Time" value={`${booking.start_time.slice(0,5)}–${booking.end_time.slice(0,5)}`}/><Field label="Slot" value={booking.slot_name || "Custom time"}/><Field label="Service" value={booking.service_name || "Not provided"}/><Field label="QR code" value={booking.qr_hash}/><Field label="Website status" value={booking.external_status}/></div>{bookingItems.length > 0 && <><h2>Booking items</h2><div className={styles.itemList}>{bookingItems.map((item) => <div key={item.id}><span>{item.item_name}</span><strong>{Number(item.quantity)} × {money.format(Number(item.unit_price))}</strong><b>{money.format(Number(item.line_total))}</b></div>)}</div></>}{booking.children.length > 0 && <><h2>Children</h2><ul className={styles.children}>{booking.children.map((child) => <li key={child.id}><strong>{child.name}</strong>{child.age_category && <small> · {child.age_category}</small>}</li>)}</ul></>}</section><aside className={styles.panel}><h2>Payment snapshot</h2><div className={styles.summary}><div><span>Total</span><strong>{money.format(Number(booking.total_price))}</strong></div><div><span>Paid before import</span><strong>{money.format(Number(booking.amount_paid_at_import))}</strong></div><div><span>Due at import</span><strong>{money.format(Number(booking.amount_due_at_import))}</strong></div><div><span>Website payment</span><strong>{booking.external_payment_status}</strong></div>{booking.checkin && <><div><span>Collected by POS</span><strong>{money.format(Number(booking.checkin.amount_collected))}</strong></div><div><span>Receipt</span><strong>{receiptNo ?? "—"}</strong></div></>}</div><div className={styles.statusBox}><strong>{booking.checkin ? "Checked in" : "Awaiting check-in"}</strong>{booking.checkin && <div>{booking.checkin.checked_in_at.toLocaleString("en-GB")} by {booking.checkin.staff.name}</div>}</div>{booking.checkin && receiptNo && <div className={styles.panelActions}><PrintBookingReceiptButton /></div>}</aside></div></div>{booking.checkin && receiptNo && <BookingReceipt receiptNo={receiptNo} referenceNo={booking.reference_no} bookingType={booking.booking_type} serviceName={booking.service_name} slotName={booking.slot_name} items={bookingItems.map(item => ({ id: item.id, product_name: item.item_name, quantity: Number(item.quantity), unit_price: Number(item.unit_price), line_total: Number(item.line_total) }))} childCount={booking.child_count} bookingDate={booking.booking_date.toISOString().slice(0,10)} startTime={booking.start_time} endTime={booking.end_time} durationMinutes={durationMinutes(booking.start_time, booking.end_time)} total={Number(booking.total_price)} paidBefore={Number(booking.amount_paid_at_import)} collectedNow={Number(booking.checkin.amount_collected)} paymentMethod={booking.checkin.payment_method ?? booking.external_payment_method ?? "ONLINE"} paymentStatus={booking.checkin.transaction?.payment_status ?? booking.external_payment_status} branchName={booking.branch.name} branchAddress={booking.branch.address} branchPhone={booking.branch.phone} servedBy={booking.checkin.staff.name} issuedAt={booking.checkin.checked_in_at}/>}</main>;
}
