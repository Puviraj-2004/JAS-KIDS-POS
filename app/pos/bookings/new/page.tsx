"use client";

import { ArrowLeft, CalendarDays, CheckCircle2, LoaderCircle, MinusCircle, PackageCheck, Plus, Printer } from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { BookingReceipt } from "@/components/pos/Receipt";
import styles from "../bookings.module.css";

type BookingType = "WALKIN_PLAYHOUSE" | "WALKIN_BIRTHDAY";
type PaymentMethod = "CASH" | "CARD" | "UPI" | "ONLINE";
type ProductOption = { id: string; name: string; item_category: string; selling_price: number };
type BookingLine = { rowId: string; productId: string; quantity: string };
type ReceiptItem = { id: string; product_name: string; quantity: number; unit_price: number; line_total: number };
type CompletedBooking = {
  reference_no: string;
  receipt_no: string;
  booking_type: BookingType;
  child_count: number;
  booking_date: string;
  start_time: string;
  end_time: string;
  slot_name: string | null;
  service_name: string | null;
  total_price: number;
  amount_collected: number;
  amount_received: number;
  change_given: number;
  payment_method: PaymentMethod;
  payment_status: string;
  items: ReceiptItem[];
  receipt: {
    branch_name: string;
    branch_address?: string | null;
    branch_phone?: string | null;
    served_by: string;
    issued_at: string;
    payment_method: PaymentMethod;
  };
};

const money = new Intl.NumberFormat("en-LK", { style: "currency", currency: "LKR" });

function rowId() {
  return Math.random().toString(36).slice(2);
}

function categoryLabel(value: string) {
  return value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function durationMinutes(start: string, end: string) {
  const [startHour, startMinute] = start.split(":").map(Number);
  const [endHour, endMinute] = end.split(":").map(Number);
  return Math.max(0, endHour * 60 + endMinute - (startHour * 60 + startMinute));
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function NewBookingPage() {
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [bookingType, setBookingType] = useState<BookingType>("WALKIN_PLAYHOUSE");
  const [lines, setLines] = useState<BookingLine[]>([{ rowId: rowId(), productId: "", quantity: "1" }]);
  const [childCount, setChildCount] = useState("1");
  const [bookingDate, setBookingDate] = useState(today());
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [amountReceived, setAmountReceived] = useState("");
  const [note, setNote] = useState("");
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [completed, setCompleted] = useState<CompletedBooking | null>(null);

  useEffect(() => {
    let mounted = true;
    async function loadOptions() {
      setLoadingOptions(true);
      setError("");
      try {
        const response = await fetch("/api/pos/walkin");
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Booking options could not be loaded");
        if (mounted) setProducts(data.products ?? []);
      } catch (caught) {
        if (mounted) setError(caught instanceof Error ? caught.message : "Booking options could not be loaded");
      } finally {
        if (mounted) setLoadingOptions(false);
      }
    }
    void loadOptions();
    return () => { mounted = false; };
  }, []);

  const filteredProducts = useMemo(() => {
    if (bookingType === "WALKIN_BIRTHDAY") {
      return products.filter((product) => ["BIRTHDAY_PACKAGE", "BIRTHDAY_ITEM", "SERVICE_ITEM", "OTHER_ITEM", "OTHER_PACKAGE", "CAFE_ITEM"].includes(product.item_category));
    }
    return products.filter((product) => product.item_category === "PLAYHOUSE_PACKAGE");
  }, [bookingType, products]);
  const productMap = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const pricedLines = lines.map((line) => {
    const product = productMap.get(line.productId);
    const quantity = Math.max(0, Number(line.quantity || 0));
    const lineTotal = product ? Math.round(product.selling_price * quantity * 100) / 100 : 0;
    return { ...line, product, quantity, lineTotal };
  });
  const total = Math.round(pricedLines.reduce((sum, line) => sum + line.lineTotal, 0) * 100) / 100;
  const received = Number(amountReceived || 0);
  const change = Math.max(0, Math.round((received - total) * 100) / 100);

  useEffect(() => {
    setLines([{ rowId: rowId(), productId: "", quantity: "1" }]);
    setAmountReceived("");
  }, [bookingType]);

  useEffect(() => {
    if (total > 0) setAmountReceived(String(total));
  }, [total]);

  function updateLine(index: number, nextLine: Partial<BookingLine>) {
    setLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, ...nextLine } : line));
  }

  function addLine() {
    setLines((current) => [...current, { rowId: rowId(), productId: "", quantity: "1" }]);
  }

  function removeLine(index: number) {
    setLines((current) => current.length === 1 ? current : current.filter((_, lineIndex) => lineIndex !== index));
  }

  async function submitBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const selectedItems = pricedLines.filter((line) => line.product && line.quantity > 0).map((line) => ({ product_id: line.product!.id, quantity: line.quantity }));
    if (selectedItems.length === 0) {
      setError("Add at least one package, service, or item.");
      return;
    }
    setSaving(true);
    setError("");
    setCompleted(null);
    try {
      const response = await fetch("/api/pos/walkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          booking_type: bookingType,
          items: selectedItems,
          child_count: Number(childCount),
          booking_date: bookingDate,
          start_time: startTime,
          end_time: endTime,
          contact_name: contactName,
          contact_phone: contactPhone,
          payment_method: paymentMethod,
          amount_received: Number(amountReceived),
          note,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Booking could not be completed");
        return;
      }
      setCompleted(data);
    } catch {
      setError("Booking could not be completed. Check the connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  function resetForm() {
    setCompleted(null);
    setLines([{ rowId: rowId(), productId: "", quantity: "1" }]);
    setChildCount("1");
    setBookingDate(today());
    setStartTime("");
    setEndTime("");
    setContactName("");
    setContactPhone("");
    setAmountReceived("");
    setNote("");
    setPaymentMethod("CASH");
    setError("");
  }

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <nav className={styles.top}>
          <Link href="/pos/bookings"><ArrowLeft size={18} aria-hidden="true" />Bookings</Link>
          <Link className={styles.primary} href="/pos/scan">Scan QR</Link>
        </nav>
        <header className={styles.heading}>
          <div>
            <p>COUNTER BOOKING</p>
            <h1>New walk-in booking</h1>
            <span>Add multiple packages, services, or items, then collect payment and print.</span>
          </div>
        </header>

        {error && <div className={styles.errorBanner} role="alert">{error}</div>}

        {completed ? (
          <section className={styles.completeScreen}>
            <div className={styles.successMark}><CheckCircle2 size={36} aria-hidden="true" /></div>
            <p>BOOKING COMPLETE</p>
            <h2>{completed.reference_no}</h2>
            <span>Receipt {completed.receipt_no} · {money.format(completed.amount_collected)} collected</span>
            <div className={styles.completeItems}>
              {completed.items.map((item) => (
                <div key={item.id}>
                  <span>{item.product_name}</span>
                  <strong>{item.quantity} × {money.format(item.unit_price)} = {money.format(item.line_total)}</strong>
                </div>
              ))}
            </div>
            <div className={styles.completeGrid}>
              <div><small>Booking type</small><strong>{completed.booking_type === "WALKIN_BIRTHDAY" ? "Walk-in Birthday" : "Walk-in Playhouse"}</strong></div>
              <div><small>Date & time</small><strong>{completed.booking_date} · {completed.start_time}–{completed.end_time}</strong></div>
              <div><small>Total</small><strong>{money.format(completed.total_price)}</strong></div>
              <div><small>Change</small><strong>{money.format(completed.change_given)}</strong></div>
            </div>
            <div className={styles.completeActions}>
              <button type="button" className={styles.primaryButton} onClick={() => window.print()}><Printer size={18} aria-hidden="true" />Print receipt</button>
              <button type="button" className={styles.secondaryButton} onClick={resetForm}><Plus size={18} aria-hidden="true" />New booking</button>
            </div>
          </section>
        ) : (
          <form className={styles.bookingForm} onSubmit={submitBooking}>
            <section className={styles.typePicker} aria-label="Booking type">
              <button type="button" aria-pressed={bookingType === "WALKIN_PLAYHOUSE"} onClick={() => setBookingType("WALKIN_PLAYHOUSE")}>
                <PackageCheck size={22} aria-hidden="true" />
                <strong>Walk-in Playhouse</strong>
                <span>Counter playhouse booking</span>
              </button>
              <button type="button" aria-pressed={bookingType === "WALKIN_BIRTHDAY"} onClick={() => setBookingType("WALKIN_BIRTHDAY")}>
                <CalendarDays size={22} aria-hidden="true" />
                <strong>Walk-in Birthday</strong>
                <span>Birthday items, hall, services, and packages</span>
              </button>
            </section>

            <section className={styles.formCard}>
              <div className={styles.cardHeader}>
                <div>
                  <p>BOOKING ITEMS</p>
                  <h2>Add packages, services, or items</h2>
                </div>
                <button type="button" className={styles.smallAction} onClick={addLine}><Plus size={16} aria-hidden="true" />Add item</button>
              </div>
              <div className={styles.bookingItems}>
                {lines.map((line, index) => {
                  const selectedProduct = productMap.get(line.productId);
                  return (
                    <div className={styles.bookingItemRow} key={line.rowId}>
                      <label>
                        <span>Item</span>
                        <select required value={line.productId} onChange={(event) => updateLine(index, { productId: event.target.value })} disabled={loadingOptions}>
                          <option value="">{loadingOptions ? "Loading..." : "Select item"}</option>
                          {filteredProducts.map((product) => <option key={product.id} value={product.id}>{product.name} · {categoryLabel(product.item_category)} · {money.format(product.selling_price)}</option>)}
                        </select>
                      </label>
                      <label>
                        <span>Qty</span>
                        <input required type="number" min="0.001" step="0.001" value={line.quantity} onChange={(event) => updateLine(index, { quantity: event.target.value })} />
                      </label>
                      <div className={styles.lineTotal}>
                        <span>Line total</span>
                        <strong>{money.format(selectedProduct ? selectedProduct.selling_price * Number(line.quantity || 0) : 0)}</strong>
                      </div>
                      <button type="button" className={styles.iconAction} disabled={lines.length === 1} onClick={() => removeLine(index)} aria-label="Remove item">
                        <MinusCircle size={20} aria-hidden="true" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className={styles.formCard}>
              <div className={styles.cardHeader}>
                <div>
                  <p>BOOKING DETAILS</p>
                  <h2>{bookingType === "WALKIN_BIRTHDAY" ? "Birthday booking" : "Playhouse booking"}</h2>
                </div>
              </div>
              <div className={styles.formGrid}>
                <label>
                  <span>Children</span>
                  <input type="number" min="1" value={childCount} onChange={(event) => setChildCount(event.target.value)} disabled={bookingType === "WALKIN_BIRTHDAY"} />
                </label>
                <label>
                  <span>Date</span>
                  <input required type="date" value={bookingDate} onChange={(event) => setBookingDate(event.target.value)} />
                </label>
                <label>
                  <span>Start time</span>
                  <input required type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} />
                </label>
                <label>
                  <span>End time</span>
                  <input required type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} />
                </label>
                <label>
                  <span>Customer name</span>
                  <input value={contactName} onChange={(event) => setContactName(event.target.value)} placeholder="Optional" />
                </label>
                <label>
                  <span>Phone</span>
                  <input type="tel" value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} placeholder="Optional" />
                </label>
                <label>
                  <span>Payment method</span>
                  <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod)}>
                    <option value="CASH">Cash</option>
                    <option value="CARD">Card</option>
                    <option value="UPI">UPI</option>
                    <option value="ONLINE">Online</option>
                  </select>
                </label>
                <label>
                  <span>Amount received</span>
                  <input required type="number" min={total} step="0.01" value={amountReceived} onChange={(event) => setAmountReceived(event.target.value)} />
                </label>
                <label className={styles.fullField}>
                  <span>Note</span>
                  <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional note" />
                </label>
              </div>
            </section>

            <aside className={styles.paymentPreview}>
              <div><span>Items</span><strong>{pricedLines.filter((line) => line.product && line.quantity > 0).length}</strong></div>
              <div><span>Total</span><strong>{money.format(total)}</strong></div>
              <div><span>Amount received</span><strong>{money.format(received)}</strong></div>
              <div><span>Change</span><strong>{money.format(change)}</strong></div>
              <button type="submit" disabled={saving || loadingOptions || total <= 0}>
                {saving && <LoaderCircle className={styles.spinner} size={18} aria-hidden="true" />}
                {saving ? "Completing booking..." : "Complete booking"}
              </button>
            </aside>
          </form>
        )}
      </div>
      {completed && (
        <BookingReceipt
          receiptNo={completed.receipt_no}
          referenceNo={completed.reference_no}
          bookingType={completed.booking_type}
          serviceName={completed.service_name}
          slotName={completed.slot_name}
          childCount={completed.child_count}
          bookingDate={completed.booking_date}
          startTime={completed.start_time}
          endTime={completed.end_time}
          durationMinutes={durationMinutes(completed.start_time, completed.end_time)}
          total={completed.total_price}
          paidBefore={0}
          collectedNow={completed.amount_collected}
          paymentMethod={completed.payment_method}
          paymentStatus={completed.payment_status}
          items={completed.items}
          branchName={completed.receipt.branch_name}
          branchAddress={completed.receipt.branch_address}
          branchPhone={completed.receipt.branch_phone}
          servedBy={completed.receipt.served_by}
          issuedAt={completed.receipt.issued_at}
        />
      )}
    </main>
  );
}
