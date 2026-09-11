import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { SupplierTable } from "@/components/admin/SupplierTable";
import { getCurrentStaff } from "@/lib/auth";
import styles from "../admin.module.css";

export default async function SuppliersPage() {
  const staff = await getCurrentStaff(new Request("http://localhost", { headers: await headers() }));
  if (!staff) redirect("/login");
  return <main className={styles.page}><div className={styles.shell}><header className={styles.header}><p>SUPPLIER ACCOUNTS</p><h1>Suppliers, purchases, and balances</h1><span>Add simple supplier records, receive stock from any supplier, and track outstanding payments by branch.</span></header><SupplierTable/></div></main>;
}
