"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import styles from "./ControlPanel.module.css";

type Branch = {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  is_active: boolean;
  _count: { staff: number; bookings: number; sales: number; stock_batches: number };
};

export function BranchManager() {
  const confirm = useConfirm();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [editing, setEditing] = useState<Branch | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/branches", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Branches could not be loaded");
      setBranches(data.branches);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Branches could not be loaded");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    setMessage("");

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const payload = { id: editing?.id, name: form.get("name"), address: form.get("address"), phone: form.get("phone") };

    try {
      const response = await fetch("/api/admin/branches", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Branch could not be saved");
      setBranches(current => editing ? current.map(branch => branch.id === data.branch.id ? data.branch : branch) : [data.branch, ...current]);
      setMessage(editing ? "Branch updated." : "Branch created.");
      setEditing(null);
      setModalOpen(false);
      formElement.reset();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Branch could not be saved");
    } finally {
      setSaving(false);
    }
  }

  async function action(branch: Branch, actionName: "toggle_active" | "delete") {
    const confirmed = await confirm({
      title: actionName === "delete" ? "Delete branch?" : "Change branch status?",
      description: actionName === "delete" ? `Delete ${branch.name}? Only branches with no history can be deleted.` : `${branch.is_active ? "Deactivate" : "Activate"} ${branch.name}?`,
      confirmLabel: actionName === "delete" ? "Delete branch" : "Confirm",
      danger: actionName === "delete",
    });
    if (!confirmed) return;

    setBusyId(branch.id);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/branches", {
        method: actionName === "delete" ? "DELETE" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: branch.id, action: actionName }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Branch could not be updated");
      if (actionName === "delete") {
        setBranches(current => current.filter(item => item.id !== branch.id));
        setMessage("Branch deleted.");
      } else {
        setBranches(current => current.map(item => item.id === data.branch.id ? data.branch : item));
        setMessage(data.branch.is_active ? "Branch activated." : "Branch deactivated.");
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Branch could not be updated");
    } finally {
      setBusyId(null);
    }
  }

  function addBranch() {
    setEditing(null);
    setModalOpen(true);
  }

  return <div className={styles.columns}>{(error || message) && <p className={error ? styles.error : styles.message} role={error ? "alert" : "status"}>{error || message}</p>}<section className={styles.card}><div className={styles.cardHeader}><div><p>BRANCHES</p><h2>All POS branches</h2></div><div className={styles.headerActions}><span>{branches.length}</span><button type="button" onClick={addBranch}>Add Branch</button></div></div>{loading ? <p className={styles.state}>Loading branches...</p> : branches.length === 0 ? <p className={styles.state}>No branches yet. Use Add Branch to create the first one.</p> : <div className={styles.tableWrap}><table><thead><tr><th>Branch name</th><th>Usage</th><th>Status</th><th>Actions</th></tr></thead><tbody>{branches.map(branch => { const busy = busyId === branch.id; const hasHistory = branch._count.staff + branch._count.bookings + branch._count.sales + branch._count.stock_batches > 0; return <tr key={branch.id}><td data-label="Branch"><strong>{branch.name}</strong><small>{branch.address || "No address"}{branch.phone ? ` · ${branch.phone}` : ""}</small></td><td data-label="Usage"><small>{branch._count.staff} staff · {branch._count.bookings} bookings<br />{branch._count.sales} sales · {branch._count.stock_batches} stock batches</small></td><td data-label="Status"><span className={branch.is_active ? styles.good : styles.bad}>{branch.is_active ? "Active" : "Inactive"}</span></td><td data-label="Actions"><div className={styles.actions}><button disabled={busy} type="button" onClick={() => { setEditing(branch); setModalOpen(true); }}>Edit</button><Link className={styles.actionLink} href={`/admin/reports?branch_id=${branch.id}`} aria-label={`View reports for ${branch.name}`}><BarChart3 size={16} aria-hidden="true"/>Reports</Link><button disabled={busy} className={hasHistory ? undefined : styles.danger} type="button" onClick={() => void action(branch, hasHistory ? "toggle_active" : "delete")}>{busy ? "Working..." : hasHistory ? branch.is_active ? "Disable" : "Enable" : "Delete"}</button></div></td></tr>; })}</tbody></table></div>}</section>{modalOpen && <div className={styles.modalBackdrop} role="presentation"><section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="branch-modal-title"><div className={styles.modalHeader}><div><p>{editing ? "EDIT BRANCH" : "NEW BRANCH"}</p><h2 id="branch-modal-title">{editing ? editing.name : "Branch details"}</h2></div><button type="button" onClick={() => { setModalOpen(false); setEditing(null); }} disabled={saving} aria-label="Close branch form">×</button></div><form className={styles.form} key={editing?.id ?? "new"} onSubmit={submit}><label>Branch name<input name="name" defaultValue={editing?.name} required placeholder="e.g. Vaddukodai" autoFocus /></label><label>Address<textarea name="address" defaultValue={editing?.address ?? ""} placeholder="Optional" /></label><label>Phone<input name="phone" type="tel" defaultValue={editing?.phone ?? ""} placeholder="Optional" /></label><div className={styles.modalActions}><button type="button" onClick={() => { setModalOpen(false); setEditing(null); }} disabled={saving}>Cancel</button><button className={styles.primary} disabled={saving}>{saving ? "Saving..." : editing ? "Save branch" : "Create branch"}</button></div></form></section></div>}</div>;
}
