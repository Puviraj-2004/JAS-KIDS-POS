"use client";
import { useId } from "react";
import type { DiscountType } from "@/lib/pricing";

export function DiscountFields({ type, value, subtotal, error, disabled, onTypeChange, onValueChange }: {
  type: DiscountType; value: string; subtotal: number; error: string; disabled?: boolean;
  onTypeChange: (type: DiscountType) => void; onValueChange: (value: string) => void;
}) {
  const id = useId();
  return <>
    <label>Discount type<select disabled={disabled} value={type} onChange={event => { onTypeChange(event.target.value as DiscountType); onValueChange("0"); }}>
      <option value="NONE">No discount</option><option value="PERCENTAGE">Percentage (%)</option><option value="FIXED">Fixed amount (LKR)</option>
    </select></label>
    {type !== "NONE" && <label>Discount · {type === "PERCENTAGE" ? "%" : "LKR"}<input disabled={disabled} required type="number" min="0" max={type === "PERCENTAGE" ? 100 : subtotal} step="0.01" value={value} aria-invalid={Boolean(error)} aria-describedby={error ? id : undefined} onChange={event => onValueChange(event.target.value)} />{error && <small id={id} role="alert">{error}</small>}</label>}
  </>;
}
