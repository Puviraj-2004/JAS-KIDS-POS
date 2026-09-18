"use client";
import { discountLabel } from "@/lib/pricing";

import { Eye, Plus, Printer, Search } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { dateInputFromTimestamp, todaySriLanka } from "@/lib/date";
import { SaleReceipt } from "@/components/pos/Receipt";
import styles from "@/app/pos/sales/history/history.module.css";

type Branch = { id: string; name: string; address?: string | null; phone?: string | null };
type SaleStatus = "COMPLETED" | "CANCELLED";
type PaymentMethod = "CASH" | "CARD" | "UPI" | "ONLINE";
type Sale = {
  id: string;
  sale_no: string;
  status: SaleStatus;
  subtotal: string;
  discount_type: string; discount_value: string; discount: string;
  total: string;
  payment_method: PaymentMethod;
  created_at: string;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  branch: Branch;
  cashier: { name: string };
  cancelled_by_staff: { name: string } | null;
  amount_received: string;
  change_given: string;
  items: Array<{ id: string; product_name: string; quantity: string; unit_price: string; unit_cost: string; line_total: string }>;
  transaction: { receipt: { receipt_no: string } | null } | null;
};
type Summary = { total_sales: number; total_transactions: number; cash_sales: number; digital_sales: number };
type Payload = { selected_branch: Branch; branches: Branch[]; viewer_role: string; can_select_branch: boolean; summary: Summary; sales: Sale[] };

const money = new Intl.NumberFormat("en-LK", { style: "currency", currency: "LKR" });
const dateInput = (date: Date) => dateInputFromTimestamp(date);
const today = () => todaySriLanka();
const yesterday = () => { const date = new Date(`${today()}T00:00:00.000Z`); date.setUTCDate(date.getUTCDate() - 1); return dateInput(date); };
const weekStart = () => { const date = new Date(`${today()}T00:00:00.000Z`); const day = date.getUTCDay() || 7; date.setUTCDate(date.getUTCDate() - day + 1); return dateInput(date); };
const monthStart = () => `${today().slice(0, 8)}01`;

function rangeForPreset(value: string) {
  if (value === "YESTERDAY") return { from: yesterday(), to: yesterday() };
  if (value === "WEEK") return { from: weekStart(), to: today() };
  if (value === "MONTH") return { from: monthStart(), to: today() };
  return { from: today(), to: today() };
}

export function SalesHistory() {
  const [data, setData] = useState<Payload | null>(null);
  const [search, setSearch] = useState("");
  const [datePreset, setDatePreset] = useState("TODAY");
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [paymentMethod, setPaymentMethod] = useState("");
  const [status, setStatus] = useState("");
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const query = useMemo(() => {
    const params = new URLSearchParams({ mode: "history", from, to });
    if (search.trim()) params.set("q", search.trim());
    if (paymentMethod) params.set("payment_method", paymentMethod);
    if (status) params.set("status", status);
    return params.toString();
  }, [from, paymentMethod, search, status, to]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/pos/sales?${query}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Sales could not be loaded");
      setData(payload);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Sales could not be loaded");
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => { void load(); }, [load]);

  function changePreset(value: string) {
    setDatePreset(value);
    if (value === "CUSTOM") return;
    const range = rangeForPreset(value);
    setFrom(range.from);
    setTo(range.to);
  }

  const sales = data?.sales ?? [];
  const summary = data?.summary ?? { total_sales: 0, total_transactions: 0, cash_sales: 0, digital_sales: 0 };
  const showCashier = data?.viewer_role !== "CASHIER";

  return <main className={styles.page}>
    <div className={styles.shell}>
      <header className={styles.title}>
        <div>
          <p>BRANCH SALES</p>
          <h1>Sales</h1>
          <span>View and manage branch sales transactions.</span>
        </div>
        <Link className={styles.primaryAction} href="/pos/sales/new"><Plus size={18} aria-hidden="true" />New Sale</Link>
      </header>

      <section className={styles.filterBar} aria-label="Sales filters">
        <label className={styles.search}><Search size={18} aria-hidden="true" /><span className={styles.srOnly}>Search sales</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search sales..." /></label>
        <label>Date<select value={datePreset} onChange={(event) => changePreset(event.target.value)}><option value="TODAY">Today</option><option value="YESTERDAY">Yesterday</option><option value="WEEK">This week</option><option value="MONTH">This month</option><option value="CUSTOM">Custom</option></select></label>
        {datePreset === "CUSTOM" && <><label>From<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label><label>To<input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label></>}
        <label>Payment<select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}><option value="">All</option><option value="CASH">Cash</option><option value="CARD">Card</option><option value="UPI">UPI</option><option value="ONLINE">Online</option></select></label>
        <label>Status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All</option><option value="COMPLETED">Completed</option><option value="CANCELLED">Cancelled</option></select></label>
      </section>

      {error && <p className={styles.error} role="alert">{error}</p>}

      <section className={styles.metrics} aria-label="Sales summary">
        <Metric label="Sales total" value={money.format(summary.total_sales)} />
        <Metric label="Transactions" value={String(summary.total_transactions)} />
        <Metric label="Cash sales" value={money.format(summary.cash_sales)} />
        <Metric label="Card / digital" value={money.format(summary.digital_sales)} />
      </section>

      <section className={styles.card}>
        <div className={styles.cardHeader}><div><p>SALES TABLE</p><h2>Transactions</h2></div><span>{loading ? "Loading..." : `${sales.length} shown`}</span></div>
        {loading ? <p className={styles.state}>Loading sales...</p> : sales.length === 0 ? <div className={styles.empty}><h3>No sales found</h3><p>Sales transactions will appear here once a sale is completed.</p><Link href="/pos/sales/new">Start new sale</Link></div> : <div className={styles.tableWrap}><table><thead><tr><th>Sale No</th><th>Date & Time</th>{showCashier && <th>Cashier</th>}<th>Items</th><th data-numeric>Subtotal</th><th data-numeric>Discount</th><th data-numeric>Total</th><th>Payment</th><th>Status</th><th>Actions</th></tr></thead><tbody>{sales.map(sale => <tr key={sale.id}><td><button className={styles.textButton} type="button" onClick={() => setSelectedSale(sale)}>{sale.sale_no}</button><small>{sale.transaction?.receipt?.receipt_no ?? "Receipt pending"}</small></td><td>{new Date(sale.created_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</td>{showCashier && <td>{sale.cashier.name}</td>}<td>{sale.items.length} item{sale.items.length === 1 ? "" : "s"}<small>{sale.items.slice(0, 2).map(item => item.product_name).join(", ")}{sale.items.length > 2 ? "..." : ""}</small></td><td data-numeric>{money.format(Number(sale.subtotal))}</td><td data-numeric>{money.format(Number(sale.discount))}</td><td data-numeric><strong>{money.format(Number(sale.total))}</strong></td><td>{sale.payment_method}</td><td><span className={sale.status === "CANCELLED" ? styles.cancelled : styles.complete}>{sale.status === "CANCELLED" ? "Cancelled" : "Completed"}</span>{sale.status === "CANCELLED" && <small>{sale.cancelled_at ? new Date(sale.cancelled_at).toLocaleDateString("en-GB") : ""}{sale.cancelled_by_staff?.name ? ` · ${sale.cancelled_by_staff.name}` : ""}</small>}</td><td><div className={styles.actions}><button type="button" onClick={() => setSelectedSale(sale)}><Eye size={16} aria-hidden="true" />View</button></div></td></tr>)}</tbody></table></div>}
      </section>
      {selectedSale && <SaleModal sale={selectedSale} showCashier={showCashier} close={() => setSelectedSale(null)} />}
    </div>
  </main>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}

function SaleModal({ sale, showCashier, close }: { sale: Sale; showCashier: boolean; close: () => void }) {
  const receiptNo = sale.transaction?.receipt?.receipt_no ?? "Receipt pending";
  async function print() {
    window.print();
    void fetch(`/api/pos/sales/${sale.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "mark_printed" }) });
  }
  return <div className={styles.modalBackdrop} role="presentation"><section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="sale-modal-title"><div className={styles.modalHeader}><div><p>SALE DETAILS</p><h2 id="sale-modal-title">{sale.sale_no}</h2><span>{new Date(sale.created_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</span></div><button type="button" onClick={close} aria-label="Close sale details">×</button></div><div className={styles.detailGrid}><section className={styles.detailCard}><h3>Sale information</h3><dl><div><dt>Receipt</dt><dd>{receiptNo}</dd></div><div><dt>Status</dt><dd><span className={sale.status === "CANCELLED" ? styles.cancelled : styles.complete}>{sale.status === "CANCELLED" ? "Cancelled" : "Completed"}</span></dd></div><div><dt>Payment</dt><dd>{sale.payment_method}</dd></div>{showCashier && <div><dt>Cashier</dt><dd>{sale.cashier.name}</dd></div>}</dl>{sale.cancellation_reason && <p className={styles.cancelNote}><strong>Cancellation:</strong> {sale.cancellation_reason}</p>}</section><section className={styles.detailCard}><h3>Payment summary</h3><dl><div><dt>Subtotal</dt><dd>{money.format(Number(sale.subtotal))}</dd></div><div><dt>{discountLabel(sale.discount_type, sale.discount_value)}</dt><dd>−{money.format(Number(sale.discount))}</dd></div><div className={styles.totalLine}><dt>Total</dt><dd>{money.format(Number(sale.total))}</dd></div><div><dt>Amount received</dt><dd>{money.format(Number(sale.amount_received))}</dd></div><div><dt>Change given</dt><dd>{money.format(Number(sale.change_given))}</dd></div></dl></section></div><section className={styles.detailCard}><h3>Items</h3><div className={styles.modalTable}><table><thead><tr><th>Product</th><th data-numeric>Qty</th><th data-numeric>Unit price</th><th data-numeric>Unit cost</th><th data-numeric>Total</th></tr></thead><tbody>{sale.items.map(item => <tr key={item.id}><td>{item.product_name}</td><td data-numeric>{Number(item.quantity)}</td><td data-numeric>{money.format(Number(item.unit_price))}</td><td data-numeric>{money.format(Number(item.unit_cost))}</td><td data-numeric>{money.format(Number(item.line_total))}</td></tr>)}</tbody></table></div></section><div className={styles.modalActions}><button type="button" onClick={close}>Close</button><button className={styles.printButton} type="button" onClick={() => void print()}><Printer size={17} aria-hidden="true" />Print receipt</button></div><SaleReceipt receiptNo={receiptNo} saleNo={sale.sale_no} status={sale.status} branchName={sale.branch.name} branchAddress={sale.branch.address} branchPhone={sale.branch.phone} servedBy={sale.cashier.name} issuedAt={sale.created_at} items={sale.items} subtotal={sale.subtotal} discount={sale.discount} discountType={sale.discount_type} discountValue={sale.discount_value} total={sale.total} amountReceived={sale.amount_received} changeGiven={sale.change_given} paymentMethod={sale.payment_method} /></section></div>;
}
