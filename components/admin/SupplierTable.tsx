"use client";

import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import styles from "./Operations.module.css";

type Branch = { id: string; name: string };
type Supplier = { id: string; name: string; phone: string | null; address: string | null; branch: { name: string } | null };
type Purchase = { id: string; total: string; amount_paid: string; balance_due: string; supplier: Supplier };
type SupplierData = {
  can_manage: boolean;
  can_select_branch: boolean;
  selected_branch_id: string | null;
  suppliers: Supplier[];
  purchases: Purchase[];
  branches: Branch[];
};
type SupplierForm = { id: string; name: string; phone: string; address: string };

const money = new Intl.NumberFormat("en-LK", { style: "currency", currency: "LKR" });
const emptySupplier: SupplierForm = { id: "", name: "", phone: "", address: "" };

export function SupplierTable() {
  const confirm = useConfirm();
  const [data, setData] = useState<SupplierData | null>(null);
  const [branchId, setBranchId] = useState("");
  const [supplierForm, setSupplierForm] = useState<SupplierForm>(emptySupplier);
  const [modalOpen, setModalOpen] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async (selected = branchId) => {
    setError("");
    try {
      const response = await fetch(`/api/admin/suppliers${selected ? `?branch_id=${encodeURIComponent(selected)}` : ""}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Supplier accounts could not be loaded");
        return;
      }
      setData(result);
      if (result.selected_branch_id) setBranchId(result.selected_branch_id);
    } catch {
      setError("Supplier accounts could not be loaded. Check your connection and refresh.");
    }
  }, [branchId]);

  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const supplierAccounts = useMemo(() => {
    if (!data) return [];
    const suppliers = data.suppliers ?? [];
    const purchases = data.purchases ?? [];
    return suppliers.map(supplier => {
      const supplierPurchases = purchases.filter(purchase => purchase.supplier.id === supplier.id);
      return {
        supplier,
        purchases: supplierPurchases.length,
        total: supplierPurchases.reduce((sum, purchase) => sum + Number(purchase.total), 0),
        paid: supplierPurchases.reduce((sum, purchase) => sum + Number(purchase.amount_paid), 0),
        due: supplierPurchases.reduce((sum, purchase) => sum + Number(purchase.balance_due), 0),
      };
    }).sort((first, second) => second.due - first.due || first.supplier.name.localeCompare(second.supplier.name));
  }, [data]);
  const outstanding = supplierAccounts.reduce((sum, account) => sum + account.due, 0);

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
      await load();
      return true;
    } catch {
      setError("Connection failed. Please try again.");
      return false;
    } finally {
      setBusy("");
    }
  }

  async function submitSupplier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const action = supplierForm.id ? "update_supplier" : "create_supplier";
    const success = supplierForm.id ? "Supplier updated." : "Supplier created.";
    const ok = await post({ action, id: supplierForm.id, name: supplierForm.name, phone: supplierForm.phone, address: supplierForm.address }, success, "supplier");
    if (ok) {
      setSupplierForm(emptySupplier);
      setModalOpen(false);
    }
  }

  async function deleteSupplier(supplier: Supplier) {
    const approved = await confirm({ title: "Delete supplier?", description: `This will remove ${supplier.name} from active supplier lists. Existing purchase/payment history will stay safe.`, confirmLabel: "Delete supplier", danger: true });
    if (!approved) return;
    await post({ action: "delete_supplier", id: supplier.id }, "Supplier removed from active list.", `delete-${supplier.id}`);
  }

  function startCreate() {
    setSupplierForm(emptySupplier);
    setModalOpen(true);
  }

  function startEdit(supplier: Supplier) {
    setSupplierForm({ id: supplier.id, name: supplier.name, phone: supplier.phone ?? "", address: supplier.address ?? "" });
    setModalOpen(true);
  }

  if (!data) return <p className={error ? styles.error : styles.empty} role={error ? "alert" : "status"}>{error || "Loading supplier accounts…"}</p>;

  return <div className={styles.layout}>
    <div className={styles.toolbar}>
      <div />
      {data.can_select_branch && <label>Branch<select value={branchId} onChange={event => { setBranchId(event.target.value); void load(event.target.value); }}><option value="">All branches</option>{(data.branches ?? []).map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>}
    </div>

    <section className={styles.summary}>
      <div className={styles.metric}><strong>{(data.suppliers ?? []).length}</strong><span>Active suppliers</span></div>
      <div className={styles.metric}><strong>{(data.purchases ?? []).length}</strong><span>Purchase records</span></div>
      <div className={styles.metric}><strong>{money.format(outstanding)}</strong><span>Supplier balance due</span></div>
    </section>

    {(error || message) && <p role={error ? "alert" : "status"} className={error ? styles.error : styles.notice}>{error || message}</p>}

    <section className={styles.card}>
      <div className={styles.cardHeader}><div><h2>Supplier list</h2><p>{data.can_manage ? "Manage suppliers for your branch." : "View supplier accounts across branches."}</p></div>{data.can_manage && <button className={styles.button} type="button" onClick={startCreate}>Add Supplier</button>}</div>
      {supplierAccounts.length === 0 ? <p className={styles.empty}>No suppliers found.</p> : <div className={styles.tableWrap}><table><thead><tr><th>Supplier</th><th>Phone</th><th>Address</th><th>Branch</th><th data-numeric>Total</th><th data-numeric>Balance</th><th>Actions</th></tr></thead><tbody>{supplierAccounts.map(account => { const supplier = account.supplier; return <tr key={supplier.id}><td data-label="Supplier"><strong>{supplier.name}</strong><small>{account.purchases} purchase records</small></td><td data-label="Phone">{supplier.phone || "—"}</td><td data-label="Address">{supplier.address || "—"}</td><td data-label="Branch">{supplier.branch?.name ?? "Unassigned"}</td><td data-label="Total" data-numeric>{money.format(account.total)}</td><td data-label="Balance" data-numeric><span className={account.due > 0 ? styles.low : styles.ok}>{money.format(account.due)}</span></td><td data-label="Actions"><div className={styles.actions}><Link className={styles.actionLink} href={`/admin/suppliers/${supplier.id}`} aria-label={`Open accounts for ${supplier.name}`}><BarChart3 size={16} aria-hidden="true" />Accounts</Link>{data.can_manage && <><button className={styles.secondary} type="button" onClick={() => startEdit(supplier)}>Edit</button><button className={styles.danger} type="button" disabled={busy === `delete-${supplier.id}`} onClick={() => void deleteSupplier(supplier)}>{busy === `delete-${supplier.id}` ? "Deleting…" : "Delete"}</button></>}</div></td></tr>; })}</tbody></table></div>}
    </section>

    {modalOpen && <div className={styles.modalBackdrop} role="presentation"><section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="supplier-modal-title"><div className={styles.modalHeader}><div><p>{supplierForm.id ? "EDIT SUPPLIER" : "NEW SUPPLIER"}</p><h2 id="supplier-modal-title">{supplierForm.id ? supplierForm.name : "Supplier details"}</h2></div><button type="button" onClick={() => { setModalOpen(false); setSupplierForm(emptySupplier); }} disabled={busy === "supplier"} aria-label="Close supplier form">×</button></div><form className={styles.form} onSubmit={submitSupplier}><label>Supplier name<input value={supplierForm.name} required autoFocus onChange={event => setSupplierForm(current => ({ ...current, name: event.target.value }))} /></label><label>Phone number<input type="tel" value={supplierForm.phone} onChange={event => setSupplierForm(current => ({ ...current, phone: event.target.value }))} /></label><label>Address<textarea value={supplierForm.address} onChange={event => setSupplierForm(current => ({ ...current, address: event.target.value }))} /></label><div className={styles.modalActions}><button type="button" onClick={() => { setModalOpen(false); setSupplierForm(emptySupplier); }} disabled={busy === "supplier"}>Cancel</button><button className={styles.button} disabled={busy === "supplier"}>{busy === "supplier" ? "Saving…" : supplierForm.id ? "Save supplier" : "Create supplier"}</button></div></form></section></div>}
  </div>;
}
