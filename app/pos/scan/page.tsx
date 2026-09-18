"use client";
import { DiscountFields } from "@/components/pos/DiscountFields";
import { previewPricing, discountLabel, type DiscountType } from "@/lib/pricing";

import {
  AlertCircle,
  Baby,
  CalendarDays,
  CheckCircle2,
  Clock3,
  CreditCard,
  Keyboard,
  LoaderCircle,
  Phone,
  ReceiptText,
  RotateCcw,
  UserRound,
} from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";
import { QRScanner } from "@/components/pos/QRScanner";
import { BookingReceipt } from "@/components/pos/Receipt";
import { formatSriLankaDate, parseDateOnly } from "@/lib/date";
import styles from "./scan.module.css";

type Booking = {
  id: string;
  is_walk_in: boolean;
  booking_type: "ONLINE_PLAYHOUSE" | "WALKIN_PLAYHOUSE" | "ONLINE_BIRTHDAY" | "WALKIN_BIRTHDAY" | "UNKNOWN";
  branch_name?: string;
  qr_hash: string;
  reference_no: string;
  parent_name: string;
  parent_phone?: string | null;
  baby_name?: string | null;
  child_count: number;
  date: string;
  start_time: string;
  end_time: string;
  slot_name?: string | null;
  service_name?: string | null;
  already_checked_in?: boolean;
  subtotal: number | null;
  discount: number;
  discount_type: DiscountType;
  discount_value: number;
  external_discount: number;
  total_price: number;
  amount_paid: number;
  amount_due: number;
  payment_status: string;
  payment_method: string;
  membership_id?: string | null;
  membership_value_lkr?: number | null;
};

type CompletedCheckIn = {
  receiptNo: string;
  referenceNo: string;
  bookingType: string;
  amountCollected: number;
  booking: Booking;
  receipt: {
    branch_name: string;
    branch_address?: string | null;
    branch_phone?: string | null;
    served_by: string;
    issued_at: string;
    payment_method: string;
  };
  paymentStatus: string;
};

const currency = new Intl.NumberFormat("en-LK", {
  style: "currency",
  currency: "LKR",
  minimumFractionDigits: 2,
});

function displayDate(value: string) {
  const date = parseDateOnly(value);
  return Number.isNaN(date.getTime())
    ? value
    : formatSriLankaDate(date);
}

function displayTime(value: string) {
  return value ? value.slice(0, 5) : "—";
}

function displayBookingType(value: Booking["booking_type"]) {
  if (value === "ONLINE_PLAYHOUSE") return "Online Playhouse";
  if (value === "WALKIN_PLAYHOUSE") return "Walk-in Playhouse";
  if (value === "ONLINE_BIRTHDAY") return "Online Birthday";
  if (value === "WALKIN_BIRTHDAY") return "Walk-in Birthday";
  return "Booking";
}

function isWalkInBooking(value: Booking["booking_type"]) {
  return value === "WALKIN_PLAYHOUSE" || value === "WALKIN_BIRTHDAY";
}

function durationMinutes(start: string, end: string) {
  const [startHour, startMinute] = start.split(":").map(Number);
  const [endHour, endMinute] = end.split(":").map(Number);
  return Math.max(0, endHour * 60 + endMinute - (startHour * 60 + startMinute));
}

export default function ScanPage() {
  const [qrHash, setQrHash] = useState("");
  const [booking, setBooking] = useState<Booking | null>(null);
  const [completed, setCompleted] = useState<CompletedCheckIn | null>(null);
  const [counterPaymentMethod, setCounterPaymentMethod] = useState("CASH");
  const [discountType, setDiscountType] = useState<DiscountType>("NONE");
  const [discount, setDiscount] = useState("0");
  const pricing = previewPricing(booking?.amount_due ?? 0, discountType, discount);
  const [error, setError] = useState("");
  const [fetching, setFetching] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);
  const previewRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (booking || completed) {
      previewRef.current?.focus({ preventScroll: true });
      previewRef.current?.scrollIntoView({ block: "start" });
    }
  }, [booking, completed]);

  async function loadBooking(value: string) {
    const normalizedValue = value.trim();
    if (!normalizedValue || fetching || checkingIn) return;

    setError("");
    setBooking(null);
    setCompleted(null);
    setFetching(true);

    try {
      const response = await fetch("/api/pos/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qr_hash: normalizedValue }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error?.message ?? data.error ?? "Failed to fetch booking details");
        return;
      }
      setQrHash(normalizedValue);
      setBooking(data.booking);
      setDiscountType("NONE"); setDiscount("0");
      setCounterPaymentMethod("CASH");
    } catch {
      setError("Could not reach the booking service. Check the connection and try again.");
    } finally {
      setFetching(false);
    }
  }

  function fetchDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void loadBooking(qrHash);
  }

  function handleCameraScan(value: string) {
    setQrHash(value);
    void loadBooking(value);
  }

  async function confirmCheckIn() {
    if (!booking || checkingIn) return;
    if (pricing.error) { setError(pricing.error); return; }
    setError("");
    setCheckingIn(true);

    try {
      const response = await fetch("/api/pos/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          qr_hash: booking.qr_hash,
          discount_type: discountType, discount_value: discount,
          counter_payment_method: counterPaymentMethod,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error?.message ?? data.error ?? "Failed to confirm check-in");
        return;
      }
      setCompleted({
        receiptNo: data.receipt_no,
        referenceNo: booking.reference_no,
        bookingType: displayBookingType(booking.booking_type),
        amountCollected: Number(data.amount_collected ?? 0),
        booking: { ...booking, subtotal: data.subtotal, total_price: data.total_price, discount: data.discount, discount_type: data.discount_type, discount_value: data.discount_value, external_discount: data.external_discount, amount_paid: data.paid_before },
        receipt: data.receipt,
        paymentStatus: data.payment_status,
      });
      setBooking(null);
    } catch {
      setError("Could not complete the check-in. Check the connection and try again.");
    } finally {
      setCheckingIn(false);
    }
  }

  function resetScanner() {
    setQrHash("");
    setBooking(null);
    setCompleted(null);
    setError("");
  }

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div className={styles.headerCopy}>
            <p className={styles.eyebrow}>COUNTER</p>
            <h1>Booking check-in</h1>
            <p>Scan a customer QR, verify the booking, and complete check-in.</p>
          </div>
        </header>
        <ol className={styles.workflow} aria-label="Check-in progress">
          <li aria-current={!booking && !completed ? "step" : undefined}><b>1</b>Scan QR</li>
          <li aria-current={booking ? "step" : undefined}><b>2</b>Review & pay</li>
          <li aria-current={completed ? "step" : undefined}><b>3</b>Receipt</li>
        </ol>

        {error && (
          <div className={styles.errorBanner} role="alert">
            <AlertCircle size={20} aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        <div className={styles.workspace}>
          <div className={booking || completed ? styles.captureHidden : styles.captureColumn}>
            {!booking && !completed && <QRScanner disabled={fetching || checkingIn} onScan={handleCameraScan} />}

            <form className={styles.manualCard} onSubmit={fetchDetails}>
              <div className={styles.manualHeading}>
                <Keyboard size={20} aria-hidden="true" />
                <div>
                  <h2>Enter code manually</h2>
                  <p>Use this if the camera is unavailable or the QR is damaged.</p>
                </div>
              </div>
              <label htmlFor="qr-hash" className={styles.label}>Booking QR value</label>
              <div className={styles.inputRow}>
                <input
                  id="qr-hash"
                  className={styles.input}
                  required
                  autoComplete="off"
                  spellCheck={false}
                  value={qrHash}
                  onChange={(event) => setQrHash(event.target.value)}
                  placeholder="Scan or enter booking code"
                  disabled={fetching || checkingIn}
                />
                <button className={styles.lookupButton} type="submit" disabled={fetching || checkingIn || !qrHash.trim()}>
                  {fetching ? <LoaderCircle className={styles.spinner} size={18} /> : null}
                  {fetching ? "Checking…" : "Find booking"}
                </button>
              </div>
            </form>
          </div>

          <aside ref={previewRef} tabIndex={-1} className={styles.previewColumn} aria-label="Booking review" aria-busy={fetching || checkingIn}>
            {fetching && (
              <section className={styles.stateCard} role="status">
                <LoaderCircle className={styles.largeSpinner} size={36} aria-hidden="true" />
                <h2>Finding booking</h2>
                <p>Validating the QR with JAS Kids…</p>
              </section>
            )}

            {!fetching && completed && (
              <section className={`${styles.stateCard} ${styles.successCard}`}>
                <div className={styles.successIcon}><CheckCircle2 size={34} aria-hidden="true" /></div>
                <p className={styles.eyebrow}>CHECK-IN COMPLETE</p>
                <h2>{completed.referenceNo}</h2>
                <p>{completed.bookingType} checked in successfully.</p>
                <div className={styles.receiptSummary}>
                  <span>Receipt</span>
                  <strong>{completed.receiptNo}</strong>
                  <span>Collected now</span>
                  <strong>{currency.format(completed.amountCollected)}</strong>
                </div>
                <div className={styles.successActions}>
                  <button className={styles.primaryButton} type="button" onClick={() => window.print()}>
                    <ReceiptText size={18} />
                    Print receipt
                  </button>
                  <button className={styles.secondaryButton} type="button" onClick={resetScanner}>
                    <RotateCcw size={18} />
                    Scan next booking
                  </button>
                </div>
              </section>
            )}

            {!fetching && booking && (
              <section className={styles.bookingCard} aria-labelledby="booking-preview-title">
                <div className={styles.bookingHeader}>
                  <div>
                    <p className={styles.eyebrow}>BOOKING FOUND</p>
                    <h2 id="booking-preview-title">{booking.reference_no}</h2>
                    <p>{booking.branch_name || "JAS Kids branch"}</p>
                  </div>
                  <span className={isWalkInBooking(booking.booking_type) ? styles.walkInBadge : styles.onlineBadge}>
                    {displayBookingType(booking.booking_type)}
                  </span>
                </div>

                <div className={styles.detailGrid}>
                  <div className={styles.detailItem}>
                    <UserRound size={18} aria-hidden="true" />
                    <span>Parent</span>
                    <strong>{booking.parent_name}</strong>
                  </div>
                  <div className={styles.detailItem}>
                    <Phone size={18} aria-hidden="true" />
                    <span>Phone</span>
                    <strong>{booking.parent_phone || "Not provided"}</strong>
                  </div>
                  <div className={styles.detailItem}>
                    <Baby size={18} aria-hidden="true" />
                    <span>Children</span>
                    <strong>{booking.child_count} child{booking.child_count === 1 ? "" : "ren"}{booking.baby_name ? ` · ${booking.baby_name}` : ""}</strong>
                  </div>
                  <div className={styles.detailItem}>
                    <CalendarDays size={18} aria-hidden="true" />
                    <span>Date</span>
                    <strong>{displayDate(booking.date)}</strong>
                  </div>
                  <div className={styles.detailItem}>
                    <Clock3 size={18} aria-hidden="true" />
                    <span>Time</span>
                    <strong>{displayTime(booking.start_time)}–{displayTime(booking.end_time)} · {durationMinutes(booking.start_time, booking.end_time)} min</strong>
                  </div>
                  <div className={styles.detailItem}>
                    <ReceiptText size={18} aria-hidden="true" />
                    <span>Slot</span>
                    <strong>{booking.slot_name || "Custom time"}</strong>
                  </div>
                </div>

                <div className={styles.paymentSummary}>
                  {booking.external_discount > 0 && <div><span>Website benefits already applied</span><strong>{currency.format(booking.external_discount)}</strong></div>}<div><span>Total</span><strong>{currency.format(booking.total_price - pricing.discount)}</strong></div>
                  <div><span>Already paid</span><strong>{currency.format(booking.amount_paid)}</strong></div>
                  <div className={styles.amountDue}><span>Amount due</span><strong>{currency.format(pricing.total)}</strong></div>
                </div>

                {booking.amount_due > 0 && <div className={styles.discountPanel}>
                  <p>Additional discount on the outstanding balance, after website benefits.</p>
                  <DiscountFields type={discountType} value={discount} subtotal={booking.amount_due} error={pricing.error} disabled={checkingIn} onTypeChange={setDiscountType} onValueChange={setDiscount} />
                  <p>{discountLabel(discountType, discount)}: -{currency.format(pricing.discount)}</p>
                </div>}
                {pricing.total > 0 ? (
                  <div className={styles.paymentPanel}>
                    <div className={styles.paymentHeading}>
                      <CreditCard size={20} aria-hidden="true" />
                      <div>
                        <h3>Collect outstanding payment</h3>
                        <p>Select how the customer is paying at the counter.</p>
                      </div>
                    </div>
                    <label htmlFor="counter-payment-method" className={styles.label}>Payment method</label>
                    <select
                      id="counter-payment-method"
                      className={styles.select}
                      value={counterPaymentMethod}
                      onChange={(event) => setCounterPaymentMethod(event.target.value)}
                      disabled={checkingIn || Boolean(pricing.error)}
                    >
                      <option value="CASH">Cash</option>
                      <option value="CARD">Card</option>
                      <option value="UPI">UPI</option>
                    </select>
                  </div>
                ) : (
                  <div className={styles.paidNotice}>
                    <CheckCircle2 size={20} aria-hidden="true" />
                    <div><strong>Payment complete</strong><span>No additional payment will be collected.</span></div>
                  </div>
                )}

                <button className={styles.confirmButton} type="button" disabled={checkingIn || Boolean(pricing.error)} onClick={confirmCheckIn}>
                  {checkingIn && <LoaderCircle className={styles.spinner} size={19} />}
                  {checkingIn
                    ? "Completing check-in…"
                    : booking.already_checked_in ? "Show saved receipt" : pricing.total > 0
                      ? `Collect ${currency.format(pricing.total)} & check in`
                      : "Confirm check-in"}
                </button>
              </section>
            )}

            {booking && <button type="button" className={styles.restart} disabled={checkingIn} onClick={resetScanner}>Back to scanner</button>}

            {!fetching && !booking && !completed && (
              <section className={styles.emptyCard}>
                <div className={styles.emptyIcon}><ReceiptText size={30} aria-hidden="true" /></div>
                <h2>Booking preview</h2>
                <p>Customer, schedule, payment, and booking type will appear here after a successful scan.</p>
                <div className={styles.steps}>
                  <span><b>1</b> Scan QR</span>
                  <span><b>2</b> Verify details</span>
                  <span><b>3</b> Check in</span>
                </div>
              </section>
            )}
          </aside>
        </div>
      </div>
      {completed && <BookingReceipt
        receiptNo={completed.receiptNo}
        referenceNo={completed.referenceNo}
        bookingType={completed.booking.booking_type}
        serviceName={completed.booking.service_name}
        slotName={completed.booking.slot_name}
        childCount={completed.booking.child_count}
        bookingDate={completed.booking.date}
        startTime={completed.booking.start_time}
        endTime={completed.booking.end_time}
        durationMinutes={durationMinutes(completed.booking.start_time, completed.booking.end_time)}
        subtotal={completed.booking.subtotal}
        discount={completed.booking.discount}
        discountType={completed.booking.discount_type}
        discountValue={completed.booking.discount_value}
        externalDiscount={completed.booking.external_discount}
        total={completed.booking.total_price}
        paidBefore={completed.booking.amount_paid}
        collectedNow={completed.amountCollected}
        paymentMethod={completed.receipt.payment_method}
        paymentStatus={completed.paymentStatus}
        branchName={completed.receipt.branch_name}
        branchAddress={completed.receipt.branch_address}
        branchPhone={completed.receipt.branch_phone}
        servedBy={completed.receipt.served_by}
        issuedAt={completed.receipt.issued_at}
      />}
    </main>
  );
}
