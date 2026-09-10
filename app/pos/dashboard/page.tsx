import { BookOpenCheck, Boxes, ShoppingCart } from "lucide-react";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentStaff } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import styles from "../pos.module.css";

export default async function DashboardPage() {
  const staff = await getCurrentStaff(new Request("http://localhost", { headers: headers() }));
  if (!staff) redirect("/login");
  const branch = staff.branch_id ? await prisma.branch.findUnique({ where: { id: staff.branch_id } }) : null;
  return <main className={styles.page}><div className={styles.shell}><header className={styles.hero}><p>{branch?.name ?? "ASSIGNED BRANCH"}</p><h1>Overview</h1><span>Choose a counter task for your branch.</span></header><section className={styles.cards}><Link href="/pos/bookings"><BookOpenCheck/><h2>Bookings</h2><p>Review imported bookings and continue check-in work.</p><strong>Open →</strong></Link><Link href="/pos/sales"><ShoppingCart aria-hidden="true"/><h2>Sales</h2><p>Add products, collect payment, update stock, and print a receipt.</p><strong>Open →</strong></Link><Link href="/pos/stock"><Boxes/><h2>Stock & waste</h2><p>Review branch stock and record wastage clearly.</p><strong>Open →</strong></Link></section></div></main>;
}
