"use client";

import { Printer } from "lucide-react";
import styles from "../bookings.module.css";

export function PrintBookingReceiptButton() {
  return (
    <button className={styles.printButton} type="button" onClick={() => window.print()}>
      <Printer size={18} aria-hidden="true" />
      Print receipt
    </button>
  );
}
