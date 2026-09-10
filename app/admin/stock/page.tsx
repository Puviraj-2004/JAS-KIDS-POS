import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { StockTable } from "@/components/admin/StockTable";
import { getCurrentStaff } from "@/lib/auth";
import { Role } from "@prisma/client";
import styles from "../admin.module.css";

export default async function StockPage() {
  const staff = await getCurrentStaff(new Request("http://localhost", { headers: headers() }));
  if (!staff) redirect("/login");
  if (staff.role !== Role.BRANCH_ADMIN) redirect(staff.role === Role.CASHIER ? "/pos/stock" : "/admin");
  return <main className={styles.page}><div className={styles.shell}><header className={styles.header}><p>STOCK CONTROL</p><h1>Stock and wastage</h1><span>Manage branch stock quantities, wastage records, and stock movement history.</span></header><StockTable initialView="stock" visibleViews={["stock", "waste", "movements"]}/></div></main>;
}
