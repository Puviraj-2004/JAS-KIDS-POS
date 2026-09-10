import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { StockTable } from "@/components/admin/StockTable";
import { getCurrentStaff } from "@/lib/auth";
import styles from "../admin.module.css";

export default async function ItemsPage() {
  const staff = await getCurrentStaff(new Request("http://localhost", { headers: headers() }));
  if (!staff) redirect("/login");
  return <main className={styles.page}><div className={styles.shell}><header className={styles.header}><p>CATALOGUE CONTROL</p><h1>Items, services, and packages</h1><span>Use category-only setup for products, service charges, and package prices.</span></header><StockTable initialView="products" visibleViews={["products", "services", "packages"]}/></div></main>;
}
