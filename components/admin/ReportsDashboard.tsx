"use client";

import { Download, FileSpreadsheet, FileText, LoaderCircle, TrendingDown, TrendingUp, WalletCards } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./Financial.module.css";
import { todaySriLanka } from "@/lib/date";

type Branch = { id: string; name: string };
type MoneyCount = { amount: number; count: number };
type Data = {
  can_select_branch: boolean;
  branches: Branch[];
  selected_branch_id: string | null;
  summary: {
    gross_amount: number;
    total_discounts: number;
    booking_discounts: number;
    sale_discounts: number;
    overall_income: number;
    overall_expenses: number;
    net_revenue: number;
    playhouse_revenue: number;
    birthday_revenue: number;
    cafe_revenue: number;
    wastage_loss: number;
    expense_loss: number;
    supplier_purchase_cost: number;
  };
  booking_breakdown: {
    online_playhouse: MoneyCount;
    walkin_playhouse: MoneyCount;
    online_birthday: MoneyCount;
    walkin_birthday: MoneyCount;
    unknown: MoneyCount;
  };
  counts: {
    bookings: number;
    sales: number;
    wastage_records: number;
    expenses: number;
    supplier_purchases: number;
  };
};

const money = new Intl.NumberFormat("en-LK", { style: "currency", currency: "LKR" });
const today = () => todaySriLanka();
const currentMonth = () => today().slice(0, 7);

function monthRange(month: string) {
  const [year, monthIndex] = month.split("-").map(Number);
  const from = `${month}-01`;
  const lastDay = new Date(year, monthIndex, 0).getDate();
  return { from, to: `${month}-${String(lastDay).padStart(2, "0")}` };
}

function SummaryCard({ label, value, tone, icon }: { label: string; value: number; tone?: "income" | "expense" | "net"; icon: React.ReactNode }) {
  return <div className={`${styles.reportMetric} ${tone ? styles[tone] : ""}`}>{icon}<span>{label}</span><strong>{money.format(value)}</strong></div>;
}

function AmountRow({ label, amount, count }: { label: string; amount: number; count?: number }) {
  return <li><span>{label}{typeof count === "number" && <small>{count} record{count === 1 ? "" : "s"}</small>}</span><strong>{money.format(amount)}</strong></li>;
}

export function ReportsDashboard() {
  const [data, setData] = useState<Data | null>(null);
  const [branchId, setBranchId] = useState("");
  const [mode, setMode] = useState<"day" | "month">("day");
  const [day, setDay] = useState(today);
  const [month, setMonth] = useState(currentMonth);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState<"xlsx" | "pdf" | "csv" | null>(null);
  const [exportError, setExportError] = useState("");
  const range = useMemo(() => mode === "day" ? { from: day, to: day } : monthRange(month), [day, mode, month]);
  const query = useMemo(() => {
    const value = new URLSearchParams(range);
    value.set("mode", mode);
    if (branchId) value.set("branch_id", branchId);
    return value.toString();
  }, [branchId, mode, range]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/reports?${query}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Report could not be loaded");
      setData(payload);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Report could not be loaded");
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => { void load(); }, [load]);

  const downloadReport = useCallback(async (format: "xlsx" | "pdf" | "csv") => {
    setExporting(format);
    setExportError("");
    try {
      const parameters = new URLSearchParams(query);
      parameters.set("format", format);
      const response = await fetch(`/api/admin/reports?${parameters.toString()}`, { cache: "no-store" });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error ?? "Export could not be created");
      }
      const disposition = response.headers.get("content-disposition") ?? "";
      const filename = disposition.match(/filename="([^"]+)"/)?.[1] ?? `jaskids-report.${format}`;
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (reason) {
      setExportError(reason instanceof Error ? reason.message : "Export could not be created");
    } finally {
      setExporting(null);
    }
  }, [query]);

  return <div className={styles.layout}>
    <div className={styles.filters}>
      {data?.can_select_branch !== false ? <label>Branch<select value={branchId} onChange={event => setBranchId(event.target.value)}><option value="">All branches</option>{data?.branches.map(branch => <option value={branch.id} key={branch.id}>{branch.name}</option>)}</select></label> : <label>Branch<input value={data?.branches[0]?.name ?? "Assigned branch"} readOnly /></label>}
      <label>Report type<select value={mode} onChange={event => setMode(event.target.value as "day" | "month")}><option value="day">Day-wise</option><option value="month">Month-wise</option></select></label>
      {mode === "day" ? <label>Date<input type="date" value={day} onChange={event => setDay(event.target.value)} /></label> : <label>Month<input type="month" value={month} onChange={event => setMonth(event.target.value)} /></label>}
      <div className={styles.exportActions} aria-label="Report downloads">
        <button className={styles.exportPrimary} type="button" onClick={() => void downloadReport("xlsx")} disabled={exporting !== null || loading}>
          {exporting === "xlsx" ? <LoaderCircle className={styles.spin} size={17} aria-hidden="true" /> : <FileSpreadsheet size={17} aria-hidden="true" />}
          {exporting === "xlsx" ? "Preparing Excel…" : "Export Excel"}
        </button>
        <button className={styles.export} type="button" onClick={() => void downloadReport("pdf")} disabled={exporting !== null || loading}>
          {exporting === "pdf" ? <LoaderCircle className={styles.spin} size={17} aria-hidden="true" /> : <FileText size={17} aria-hidden="true" />}
          {exporting === "pdf" ? "Preparing PDF…" : "Download PDF"}
        </button>
        <button className={styles.exportQuiet} type="button" onClick={() => void downloadReport("csv")} disabled={exporting !== null || loading} title="Download the compact summary as CSV">
          {exporting === "csv" ? <LoaderCircle className={styles.spin} size={17} aria-hidden="true" /> : <Download size={17} aria-hidden="true" />}
          CSV
        </button>
      </div>
    </div>

    <p className={styles.exportHelp}><strong>Excel</strong> includes detailed, filterable transaction sheets. <strong>PDF</strong> is a formatted management summary for printing and sharing.</p>

    {error && <p className={styles.error}>{error}</p>}
    {exportError && <p className={styles.error} role="alert">{exportError}. Check the filters and try the export again.</p>}
    <span className={styles.srOnly} aria-live="polite">{exporting ? `Preparing ${exporting.toUpperCase()} report` : ""}</span>
    {loading || !data ? <p className={styles.state}>{error ? "Report unavailable. Adjust the filters or refresh to retry." : "Building report…"}</p> : <>
      <section className={styles.reportHero} aria-label="Overall financial summary">
        <SummaryCard label="Overall Income" value={data.summary.overall_income} tone="income" icon={<TrendingUp size={21} aria-hidden="true" />} />
        <SummaryCard label="Overall Expenses" value={data.summary.overall_expenses} tone="expense" icon={<TrendingDown size={21} aria-hidden="true" />} />
        <SummaryCard label="Net Revenue" value={data.summary.net_revenue} tone="net" icon={<WalletCards size={21} aria-hidden="true" />} />
      </section>

      <section className={styles.card}>
        <div className={styles.cardHeader}><div><p>DISCOUNTS</p><h2>Pricing breakdown</h2></div></div>
        <ul className={styles.list}>
          <AmountRow label="Gross amount (known discounts)" amount={data.summary.gross_amount} />
          <AmountRow label="Booking discounts and website benefits" amount={data.summary.booking_discounts} />
          <AmountRow label="Sales discounts" amount={data.summary.sale_discounts} />
          <AmountRow label="Total discounts" amount={data.summary.total_discounts} />
          <AmountRow label="Net income" amount={data.summary.overall_income} />
        </ul>
        <p>Older imported bookings may not include their original website discount breakdown.</p>
      </section>
      <div className={styles.reportGrid}>
        <section className={styles.card}>
          <div className={styles.cardHeader}><div><p>INCOME</p><h2>Revenue summary</h2></div></div>
          <ul className={styles.list}>
            <AmountRow label="Playhouse Revenue" amount={data.summary.playhouse_revenue} count={data.booking_breakdown.online_playhouse.count + data.booking_breakdown.walkin_playhouse.count} />
            <AmountRow label="Birthday Revenue" amount={data.summary.birthday_revenue} count={data.booking_breakdown.online_birthday.count + data.booking_breakdown.walkin_birthday.count} />
            <AmountRow label="Cafe Revenue" amount={data.summary.cafe_revenue} count={data.counts.sales} />
          </ul>
        </section>
        <section className={styles.card}>
          <div className={styles.cardHeader}><div><p>BOOKINGS</p><h2>Booking revenue split</h2></div></div>
          <ul className={styles.list}>
            <AmountRow label="Online Playhouse" amount={data.booking_breakdown.online_playhouse.amount} count={data.booking_breakdown.online_playhouse.count} />
            <AmountRow label="Walk-in Playhouse" amount={data.booking_breakdown.walkin_playhouse.amount} count={data.booking_breakdown.walkin_playhouse.count} />
            <AmountRow label="Online Birthday" amount={data.booking_breakdown.online_birthday.amount} count={data.booking_breakdown.online_birthday.count} />
            <AmountRow label="Walk-in Birthday" amount={data.booking_breakdown.walkin_birthday.amount} count={data.booking_breakdown.walkin_birthday.count} />
          </ul>
        </section>
        <section className={styles.card}>
          <div className={styles.cardHeader}><div><p>OUTGOING</p><h2>Loss and cost summary</h2></div></div>
          <ul className={styles.list}>
            <AmountRow label="Wastage Loss" amount={data.summary.wastage_loss} count={data.counts.wastage_records} />
            <AmountRow label="Expense Loss" amount={data.summary.expense_loss} count={data.counts.expenses} />
            <AmountRow label="Supplier Purchase Cost" amount={data.summary.supplier_purchase_cost} count={data.counts.supplier_purchases} />
          </ul>
        </section>
      </div>
    </>}
  </div>;
}
