"use client";

import { LogOut, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import styles from "../bookings.module.css";

export function WalkOutButton({ bookingId, referenceNo }: { bookingId: string; referenceNo: string }) {
  const confirm = useConfirm();
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function walkOut() {
    if (saving) return;
    const approved = await confirm({
      title: "Mark customer as walked out?",
      description: `${referenceNo} will be removed from the Live TV screen. Payment and booking records will remain unchanged.`,
      confirmLabel: "Confirm walk out",
      danger: true,
    });
    if (!approved) return;

    setSaving(true);
    try {
      const response = await fetch(`/api/pos/bookings/${bookingId}/walkout`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Walk out could not be recorded");
      router.refresh();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Walk out could not be recorded");
    } finally {
      setSaving(false);
    }
  }

  return <button type="button" className={styles.walkOutButton} disabled={saving} onClick={() => void walkOut()}>
    {saving ? <LoaderCircle className={styles.spinner} size={18} aria-hidden="true" /> : <LogOut size={18} aria-hidden="true" />}
    {saving ? "Recording…" : "Walk out"}
  </button>;
}
