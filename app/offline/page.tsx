import Link from "next/link";
import styles from "./offline.module.css";

export default function OfflinePage() {
  return (
    <main className={styles.page}>
      <section className={styles.card} aria-labelledby="offline-title">
        <span className={styles.badge}>JAS KIDS POS</span>
        <h1 id="offline-title">You&apos;re offline</h1>
        <p>Reconnect to the internet to load bookings, payments, stock, and live POS data safely.</p>
        <Link href="/pos/dashboard" className={styles.button}>Try again</Link>
      </section>
    </main>
  );
}
