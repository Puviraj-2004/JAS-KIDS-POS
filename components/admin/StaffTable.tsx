"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import styles from "./StaffTable.module.css";

type Branch = { id: string; name: string };
type StaffRole = "SUPER_ADMIN" | "BRANCH_ADMIN" | "CASHIER";
type StaffItem = { id: string; name: string; email: string; role: StaffRole; is_active: boolean; branch: Branch | null; branch_id: string | null };

export function StaffTable() {
  const confirm = useConfirm();
  const [staff, setStaff] = useState<StaffItem[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [editing, setEditing] = useState<StaffItem | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [role, setRole] = useState<StaffRole>("CASHIER");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/staff", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not load staff");
      setStaff(data.staff);
      setBranches(data.branches);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load staff");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function submitStaff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    setMessage("");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const payload = editing
      ? { id: editing.id, action: "update_details", name: form.get("name"), email: form.get("email"), role, branch_id: role === "SUPER_ADMIN" ? null : form.get("branch_id") }
      : { name: form.get("name"), email: form.get("email"), password: form.get("password"), role, branch_id: role === "SUPER_ADMIN" ? null : form.get("branch_id") };

    try {
      const response = await fetch("/api/admin/staff", { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Account could not be saved");
      setStaff(current => editing ? current.map(item => item.id === data.staff.id ? data.staff : item) : [data.staff, ...current]);
      setMessage(editing ? "Staff account updated." : "Staff account created.");
      setEditing(null);
      setRole("CASHIER");
      setModalOpen(false);
      formElement.reset();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Account could not be saved");
    } finally {
      setSaving(false);
    }
  }

  async function update(id: string, action: "toggle_active" | "reset_password") {
    const password = action === "reset_password" ? await confirm({ title: "Reset staff password", description: "Existing sessions will be signed out.", inputLabel: "New password", inputType: "password", minLength: 8, confirmLabel: "Reset password" }) : undefined;
    if (action === "reset_password" && !password) return;
    setBusyId(id);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/staff", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action, password }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Account could not be updated");
      if (data.staff) setStaff(current => current.map(item => item.id === data.staff.id ? data.staff : item));
      setMessage(action === "reset_password" ? "Password reset." : "Account status updated.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Account could not be updated");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(item: StaffItem) {
    if (!await confirm({ title: "Delete staff account?", description: `Delete ${item.name}? Accounts with history must be disabled instead.`, confirmLabel: "Delete account", danger: true })) return;
    setBusyId(item.id);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/staff", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Account could not be deleted");
      setStaff(current => current.filter(row => row.id !== item.id));
      setMessage("Staff account deleted.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Account could not be deleted");
    } finally {
      setBusyId(null);
    }
  }

  function startEdit(item: StaffItem) {
    setEditing(item);
    setRole(item.role);
    setModalOpen(true);
  }

  function startCreate() {
    setEditing(null);
    setRole("CASHIER");
    setModalOpen(true);
  }

  const roleLabel = (value: StaffRole) => value === "SUPER_ADMIN" ? "Super admin" : value === "BRANCH_ADMIN" ? "Branch admin" : "Cashier";
  return <div className={styles.layout}>{(error || message) && <p className={error ? styles.error : styles.message} role={error ? "alert" : "status"}>{error || message}</p>}<section className={styles.card} aria-labelledby="staff-list-title"><div className={styles.cardHeader}><div><p>STAFF</p><h2 id="staff-list-title">POS users</h2></div><div className={styles.headerActions}><span>{staff.length}</span><button type="button" onClick={startCreate}>Add Staff</button></div></div>{loading ? <p className={styles.state}>Loading accounts...</p> : staff.length === 0 ? <p className={styles.state}>No staff accounts yet. Use Add Staff to create the first one.</p> : <div className={styles.tableWrap}><table><thead><tr><th>Name</th><th>Role</th><th>Branch</th><th>Status</th><th>Actions</th></tr></thead><tbody>{staff.map((item) => { const busy = busyId === item.id; return <tr key={item.id}><td data-label="Staff"><strong>{item.name}</strong><small>{item.email}</small></td><td data-label="Role">{roleLabel(item.role)}</td><td data-label="Branch">{item.branch?.name ?? "All branches"}</td><td data-label="Status"><span className={item.is_active ? styles.active : styles.inactive}>{item.is_active ? "Active" : "Disabled"}</span></td><td data-label="Actions"><div className={styles.actions}><button disabled={busy} type="button" onClick={() => startEdit(item)}>Edit</button><button disabled={busy} type="button" onClick={() => void update(item.id, "reset_password")}>Reset password</button><button disabled={busy} type="button" onClick={() => void update(item.id, "toggle_active")}>{busy ? "Working..." : item.is_active ? "Disable" : "Enable"}</button><button disabled={busy} className={styles.delete} type="button" onClick={() => void remove(item)}>Delete</button></div></td></tr>; })}</tbody></table></div>}</section>{modalOpen && <div className={styles.modalBackdrop} role="presentation"><section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="staff-modal-title"><div className={styles.modalHeader}><div><p>{editing ? "EDIT ACCOUNT" : "NEW ACCOUNT"}</p><h2 id="staff-modal-title">{editing ? editing.name : "Staff details"}</h2></div><button type="button" onClick={() => { setModalOpen(false); setEditing(null); setRole("CASHIER"); }} disabled={saving} aria-label="Close staff form">×</button></div><form className={styles.form} key={editing?.id ?? "new"} onSubmit={submitStaff}><label>Full name<input name="name" required autoComplete="name" defaultValue={editing?.name ?? ""} autoFocus /></label><label>Email<input name="email" type="email" required autoComplete="email" defaultValue={editing?.email ?? ""} /></label>{!editing && <label>Password<input name="password" type="password" required minLength={8} autoComplete="new-password" /><small>Use at least 8 characters.</small></label>}<label>Role<select name="role" value={role} onChange={(event) => setRole(event.target.value as StaffRole)}><option value="CASHIER">Cashier</option><option value="BRANCH_ADMIN">Branch admin</option><option value="SUPER_ADMIN">Super admin</option></select></label>{role !== "SUPER_ADMIN" && <label>Branch<select name="branch_id" required defaultValue={editing?.branch_id ?? ""}><option value="" disabled>Select branch</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>}<div className={styles.modalActions}><button type="button" onClick={() => { setModalOpen(false); setEditing(null); setRole("CASHIER"); }} disabled={saving}>Cancel</button><button className={styles.primary} type="submit" disabled={saving}>{saving ? "Saving..." : editing ? "Save account" : "Create account"}</button></div></form></section></div>}</div>;
}
