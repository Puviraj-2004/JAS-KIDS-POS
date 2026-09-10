"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./Operations.module.css";

type Branch = { id: string; name: string };
type Supplier = { id: string; name: string; phone: string | null; address: string | null; branch: Branch | null };
type Product = { id: string; name: string };
type Purchase = {
  id: string;
  purchase_no: string;
  status: string;
  total: string;
  amount_paid: string;
  balance_due: string;
  note: string | null;
  purchased_at: string;
  branch: Branch;
  items: { id: string; quantity: string; unit_cost: string; selling_price: string; line_total: string; product: { name: string } }[];
};
type Payment = { id: string; amount: string; method: string; reference: string | null; note: string | null; created_at: string; purchase: { purchase_no: string } | null };

const money = new Intl.NumberFormat("en-LK", { style: "currency", currency: "LKR" });

function formatDate(value: string) {
  return new Date(value).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

export function SupplierAccountDetail(props: { supplier: Supplier; canManage: boolean; products: Product[]; purchases: Purchase[]; payments: Payment[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const purchases = props.purchases ?? [];
  const payments = props.payments ?? [];

  const totals = useMemo(() => ({
    purchased: purchases.reduce((sum, purchase) => sum + Number(purchase.total), 0),
    paid: purchases.reduce((sum, purchase) => sum + Number(purchase.amount_paid), 0),
    due: purchases.reduce((sum, purchase) => sum + Number(purchase.balance_due), 0),
  }), [purchases]);
  const openPurchases = purchases.filter(purchase => Number(purchase.balance_due) > 0);

  async function post(payload: Record<string, unknown>, success: string, busyLabel: string) {
    if (busy) return false;
    setBusy(busyLabel);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/suppliers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Supplier operation failed");
        return false;
      }
      setMessage(success);
      router.refresh();
      return true;
    } catch {
      setError("Connection failed. Please try again.");
      return false;
    } finally {
      setBusy("");
    }
  }

  async function submitPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const purchase = openPurchases.find(item => item.id === form.get("purchase_id"));
    const ok = await post({ action: "record_payment", branch_id: purchase?.branch.id, purchase_id: form.get("purchase_id"), amount: form.get("amount"), method: form.get("method"), reference: form.get("reference"), note: form.get("note") }, "Supplier payment recorded.", "payment");
    if (ok) event.currentTarget.reset();
  }

  return <div className={styles.layout}>
    <section className={styles.summary}>
      <div className={styles.metric}><strong>{money.format(totals.purchased)}</strong><span>Total purchases</span></div>
      <div className={styles.metric}><strong>{money.format(totals.paid)}</strong><span>Total paid</span></div>
      <div className={styles.metric}><strong className={totals.due > 0 ? styles.amountDue : ""}>{money.format(totals.due)}</strong><span>Outstanding balance</span></div>
    </section>

    {(error || message) && <p role={error ? "alert" : "status"} className={error ? styles.error : styles.notice}>{error || message}</p>}

    <section className={styles.card}>
      <div className={styles.cardHeader}><div><h2>Supplier details</h2><p>{props.supplier.branch?.name ?? "Unassigned branch"}</p></div></div>
      <div className={styles.detailGrid}>
        <div><span>Name</span><strong>{props.supplier.name}</strong></div>
        <div><span>Phone</span><strong>{props.supplier.phone || "—"}</strong></div>
        <div><span>Address</span><strong>{props.supplier.address || "—"}</strong></div>
      </div>
    </section>

    {props.canManage && <div className={styles.grid}>
      <section className={styles.card}>
        <div className={styles.cardHeader}><div><h2>Pay outstanding</h2><p>Apply payment to one unpaid purchase.</p></div></div>
        <form className={styles.form} onSubmit={submitPayment}>
          <label>Outstanding purchase<select name="purchase_id" required defaultValue=""><option value="" disabled>Select purchase</option>{openPurchases.map(purchase => <option key={purchase.id} value={purchase.id}>{purchase.purchase_no} · {money.format(Number(purchase.balance_due))}</option>)}</select></label>
          <div className={styles.formRow}><label>Amount<input name="amount" type="number" min="0.01" step="0.01" required /></label><label>Method<select name="method" defaultValue="CASH"><option value="CASH">Cash</option><option value="CARD">Card</option><option value="UPI">UPI</option><option value="ONLINE">Online</option></select></label></div>
          <label>Reference<input name="reference" /></label>
          <label>Note<textarea name="note" /></label>
          <button className={styles.button} disabled={busy === "payment" || openPurchases.length === 0}>{busy === "payment" ? "Saving…" : "Record payment"}</button>
        </form>
      </section>
    </div>}

    <section className={styles.card}>
      <div className={styles.cardHeader}><div><h2>Date-wise activity</h2><p>Purchases, items, payments, and balances.</p></div></div>
      {purchases.length === 0 ? <p className={styles.empty}>No purchase activity yet.</p> : <div className={styles.tableWrap}><table><thead><tr><th>Date</th><th>Purchase</th><th>Items</th><th data-numeric>Total</th><th data-numeric>Paid</th><th data-numeric>Balance</th></tr></thead><tbody>{purchases.map(purchase => <tr key={purchase.id}><td data-label="Date">{formatDate(purchase.purchased_at)}</td><td data-label="Purchase"><strong>{purchase.purchase_no}</strong><small>{purchase.status}</small></td><td data-label="Items">{purchase.items.map(item => <small key={item.id}>{item.product.name} · {Number(item.quantity)} × buy {money.format(Number(item.unit_cost))} · sell {money.format(Number(item.selling_price))}</small>)}</td><td data-label="Total" data-numeric>{money.format(Number(purchase.total))}</td><td data-label="Paid" data-numeric>{money.format(Number(purchase.amount_paid))}</td><td data-label="Balance" data-numeric><span className={Number(purchase.balance_due) > 0 ? styles.low : styles.ok}>{money.format(Number(purchase.balance_due))}</span></td></tr>)}</tbody></table></div>}
    </section>

    <section className={styles.card}>
      <div className={styles.cardHeader}><div><h2>Payment history</h2><p>All payments recorded for this supplier.</p></div></div>
      {payments.length === 0 ? <p className={styles.empty}>No payments recorded.</p> : <div className={styles.tableWrap}><table><thead><tr><th>Date</th><th>Purchase</th><th>Method</th><th>Reference</th><th data-numeric>Amount</th></tr></thead><tbody>{payments.map(payment => <tr key={payment.id}><td data-label="Date">{formatDate(payment.created_at)}</td><td data-label="Purchase">{payment.purchase?.purchase_no ?? "General"}</td><td data-label="Method">{payment.method}</td><td data-label="Reference">{payment.reference || "—"}</td><td data-label="Amount" data-numeric>{money.format(Number(payment.amount))}</td></tr>)}</tbody></table></div>}
    </section>
  </div>;
}
