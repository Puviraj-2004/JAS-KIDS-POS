import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { StaffTable } from "@/components/admin/StaffTable";
import { getCurrentStaff } from "@/lib/auth";
import styles from "../admin.module.css";

export default async function StaffPage() {
  const staff = await getCurrentStaff(new Request("http://localhost", { headers: headers() }));
  if (!staff) redirect("/login");
  if (staff.role !== Role.SUPER_ADMIN) redirect("/pos/dashboard");
  return <main className={styles.page}><div className={styles.shell}><header className={styles.header}><p>ACCESS CONTROL</p><h1>POS users</h1><span>Create Super Admin, Branch Admin, and Cashier accounts for this POS only.</span></header><StaffTable/></div></main>;
}
