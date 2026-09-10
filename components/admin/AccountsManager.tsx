"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import styles from "./Financial.module.css";

type Branch = { id: string; name: string };
type ExpenseType = { id: string; name: string };
type Summary = { revenue?: number; product_revenue?: number; booking_revenue?: number; product_cost?: number; gross_profit?: number; wastage_loss?: number; expenses?: number; net_operating?: number; supplier_paid?: number; supplier_outstanding?: number; transaction_count?: number; overall_income?: number; overall_expenses?: number; net_revenue?: number; expense_loss?: number; supplier_purchase_cost?: number; cafe_revenue?: number };
type Expense = { id: string; description: string; amount: string; incurred_at: string; branch: { name: string }; expense_type: ExpenseType; staff: { name: string }; payments: Array<{ method: string; reference: string | null }> };
type Data = {
  can_select_branch: boolean;
  can_record_expense: boolean;
  can_manage_expense_types: boolean;
  branches: Branch[];
  expense_types: ExpenseType[];
  summary: Summary;
  expenses: Expense[];
};

const money = new Intl.NumberFormat("en-LK", { style: "currency", currency: "LKR" });
const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => `${today().slice(0, 8)}01`;
const expenseDate = (value?: string) => value ? new Date(value).toISOString().slice(0, 10) : today();

export function AccountsManager() {
  const [data, setData] = useState<Data | null>(null);
  const [branchId, setBranchId] = useState("");
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [expenseModal, setExpenseModal] = useState<Expense | "new" | null>(null);
  const [typeModal, setTypeModal] = useState(false);
  const [editingType, setEditingType] = useState<ExpenseType | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const query = new URLSearchParams({ from, to });
    if (branchId) query.set("branch_id", branchId);
    try {
      const response = await fetch(`/api/admin/accounts?${query}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Accounts could not be loaded");
      setData(payload);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Accounts could not be loaded");
    } finally {
      setLoading(false);
    }
  }, [branchId, from, to]);

  useEffect(() => { void load(); }, [load]);

  const selectedBranch = branchId || data?.branches?.[0]?.id || "";
  const expenses = data?.expenses ?? [];
  const branches = data?.branches ?? [];
  const expenseTypes = data?.expense_types ?? [];
  const expenseTotal = useMemo(() => expenses.reduce((sum, item) => sum + Number(item.amount), 0), [expenses]);
  const operatingResult = data?.summary.net_operating ?? data?.summary.net_revenue ?? 0;

  async function submitExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(""); setMessage("");
    const form = new FormData(event.currentTarget);
    const editing = expenseModal !== "new" && expenseModal !== null;
    try {
      const response = await fetch("/api/admin/accounts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: editing ? "update_expense" : "record_expense", id: editing ? expenseModal.id : undefined, branch_id: form.get("branch_id"), expense_type_id: form.get("expense_type_id"), description: form.get("description"), amount: form.get("amount"), payment_method: form.get("payment_method"), reference: form.get("reference"), incurred_at: form.get("incurred_at") }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Expense could not be saved");
      setExpenseModal(null);
      setMessage(editing ? "Expense updated." : "Expense recorded.");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Expense could not be saved");
    } finally {
      setBusy(false);
    }
  }

  async function deleteExpense(expense: Expense) {
    if (!confirm(`Delete expense "${expense.description}"?`)) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/admin/accounts", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete_expense", id: expense.id }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Expense could not be deleted");
      setMessage("Expense deleted.");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Expense could not be deleted");
    } finally {
      setBusy(false);
    }
  }

  async function saveExpenseType(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(""); setMessage("");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      const response = await fetch("/api/admin/accounts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: editingType ? "update_expense_type" : "create_expense_type", id: editingType?.id, name: form.get("name") }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Expense type could not be saved");
      formElement.reset();
      setEditingType(null);
      setMessage(editingType ? "Expense type updated." : "Expense type added.");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Expense type could not be saved");
    } finally {
      setBusy(false);
    }
  }

  async function deleteExpenseType(type: ExpenseType) {
    if (!confirm(`Delete expense type "${type.name}"? Used types cannot be deleted.`)) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/admin/accounts", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: type.id }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Expense type could not be deleted");
      setMessage("Expense type deleted.");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Expense type could not be deleted");
    } finally {
      setBusy(false);
    }
  }

  if (loading || !data) return <p className={error ? styles.error : styles.state} role={error ? "alert" : "status"}>{error || "Loading expenses…"}</p>;

  return <div className={styles.layout}>
    <div className={styles.filters}>
      {data.can_select_branch ? <label>Branch<select value={branchId} onChange={event => setBranchId(event.target.value)}><option value="">All branches</option>{branches.map(branch => <option value={branch.id} key={branch.id}>{branch.name}</option>)}</select></label> : <label>Branch<input value={branches[0]?.name ?? "Assigned branch"} readOnly /></label>}
      <label>From<input type="date" value={from} onChange={event => setFrom(event.target.value)} /></label>
      <label>To<input type="date" value={to} onChange={event => setTo(event.target.value)} /></label>
      <div className={styles.filterActions}>
        {data.can_manage_expense_types && <button type="button" onClick={() => setTypeModal(true)}>Expense Types</button>}
        {data.can_record_expense && <button type="button" onClick={() => setExpenseModal("new")}>Add Expense</button>}
      </div>
    </div>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {message && <p className={styles.message} role="status">{message}</p>}
    <section className={styles.metrics}><Metric label="Expense records" value={expenses.length} plain /><Metric label="Expense total" value={expenseTotal} /><Metric label="Operating result" value={operatingResult} featured /></section>
    <section className={styles.card}>
      <div className={styles.cardHeader}><div><p>EXPENSE LEDGER</p><h2>Recorded expenses</h2></div></div>
      {expenses.length === 0 ? <p className={styles.state}>No expenses in this period.</p> : <div className={styles.tableWrap}><table><thead><tr><th>Date</th><th>Branch</th><th>Expense</th><th>Description</th><th>Method</th><th data-numeric>Amount</th>{data.can_record_expense && <th>Actions</th>}</tr></thead><tbody>{expenses.map(item => <tr key={item.id}><td>{new Date(item.incurred_at).toLocaleDateString("en-GB")}</td><td>{item.branch.name}</td><td>{item.expense_type.name}</td><td>{item.description}<small>By {item.staff.name}</small>{item.payments[0]?.reference && <small>Ref: {item.payments[0].reference}</small>}</td><td>{item.payments[0]?.method ?? "—"}</td><td data-numeric>{money.format(Number(item.amount))}</td>{data.can_record_expense && <td><div className={styles.rowActions}><button type="button" disabled={busy} onClick={() => setExpenseModal(item)}>Edit</button><button type="button" disabled={busy} className={styles.danger} onClick={() => void deleteExpense(item)}>Delete</button></div></td>}</tr>)}</tbody></table></div>}
    </section>
    {expenseModal && <ExpenseModal expense={expenseModal === "new" ? null : expenseModal} branches={branches} expenseTypes={expenseTypes} selectedBranch={selectedBranch} busy={busy} close={() => setExpenseModal(null)} submit={submitExpense} />}
    {typeModal && <ExpenseTypeModal expenseTypes={expenseTypes} editingType={editingType} busy={busy} setEditingType={setEditingType} close={() => { setTypeModal(false); setEditingType(null); }} submit={saveExpenseType} remove={deleteExpenseType} />}
  </div>;
}

function Metric({ label, value, featured = false, plain = false }: { label: string; value: number; featured?: boolean; plain?: boolean }) {
  return <div className={featured ? styles.featured : ""}><span>{label}</span><strong>{plain ? value : money.format(value)}</strong></div>;
}

function ExpenseModal({ expense, branches, expenseTypes, selectedBranch, busy, close, submit }: { expense: Expense | null; branches: Branch[]; expenseTypes: ExpenseType[]; selectedBranch: string; busy: boolean; close: () => void; submit: (event: FormEvent<HTMLFormElement>) => void }) {
  const payment = expense?.payments[0];
  return <div className={styles.modalBackdrop} role="presentation"><section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="expense-modal-title"><div className={styles.modalHeader}><div><p>{expense ? "EDIT EXPENSE" : "NEW EXPENSE"}</p><h2 id="expense-modal-title">{expense ? expense.description : "Expense details"}</h2></div><button type="button" onClick={close} disabled={busy} aria-label="Close expense form">×</button></div><form className={styles.form} onSubmit={submit}><label>Branch<select name="branch_id" required defaultValue={selectedBranch} disabled={branches.length <= 1}><option value="" disabled>Select branch</option>{branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label><label>Expense type<select name="expense_type_id" required defaultValue={expense?.expense_type.id ?? ""} autoFocus><option value="" disabled>Select expense type</option>{expenseTypes.map(type => <option key={type.id} value={type.id}>{type.name}</option>)}</select></label><label>Description<input name="description" required defaultValue={expense?.description ?? ""} placeholder="e.g. Monthly electricity bill" /></label><div className={styles.formRow}><label>Amount<input name="amount" type="number" min="0.01" step="0.01" required defaultValue={expense?.amount ?? ""} /></label><label>Date<input name="incurred_at" type="date" required defaultValue={expenseDate(expense?.incurred_at)} /></label></div><div className={styles.formRow}><label>Payment method<select name="payment_method" required defaultValue={payment?.method ?? "CASH"}><option value="CASH">Cash</option><option value="CARD">Card</option><option value="UPI">UPI</option><option value="ONLINE">Online</option></select></label><label>Reference<input name="reference" defaultValue={payment?.reference ?? ""} placeholder="Optional" /></label></div><div className={styles.modalActions}><button type="button" onClick={close} disabled={busy}>Cancel</button><button className={styles.primary} disabled={busy || expenseTypes.length === 0}>{busy ? "Saving…" : expense ? "Save expense" : "Record expense"}</button></div></form></section></div>;
}

function ExpenseTypeModal({ expenseTypes, editingType, busy, setEditingType, close, submit, remove }: { expenseTypes: ExpenseType[]; editingType: ExpenseType | null; busy: boolean; setEditingType: (value: ExpenseType | null) => void; close: () => void; submit: (event: FormEvent<HTMLFormElement>) => void; remove: (type: ExpenseType) => Promise<void> }) {
  return <div className={styles.modalBackdrop} role="presentation"><section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="expense-type-modal-title"><div className={styles.modalHeader}><div><p>EXPENSE TYPES</p><h2 id="expense-type-modal-title">Maintain expense names</h2></div><button type="button" onClick={close} disabled={busy} aria-label="Close expense type manager">×</button></div><form className={styles.form} key={editingType?.id ?? "new"} onSubmit={submit}><label>Expense type name<input name="name" required autoFocus defaultValue={editingType?.name ?? ""} placeholder="e.g. Electricity" /></label><div className={styles.modalActions}>{editingType && <button type="button" disabled={busy} onClick={() => setEditingType(null)}>Cancel edit</button>}<button className={styles.primary} disabled={busy}>{busy ? "Saving…" : editingType ? "Save type" : "Add type"}</button></div></form>{expenseTypes.length === 0 ? <p className={styles.state}>No expense types yet.</p> : <ul className={styles.modalList}>{expenseTypes.map(type => <li key={type.id}><span>{type.name}</span><div className={styles.rowActions}><button type="button" disabled={busy} onClick={() => setEditingType(type)}>Edit</button><button type="button" disabled={busy} className={styles.danger} onClick={() => void remove(type)}>Delete</button></div></li>)}</ul>}</section></div>;
}
