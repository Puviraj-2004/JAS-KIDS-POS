import { Role } from "@prisma/client";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { BranchManager } from "@/components/admin/BranchManager";
import { getCurrentStaff } from "@/lib/auth";
import styles from "../admin.module.css";

export default async function BranchesPage() {
  const staff = await getCurrentStaff(new Request("http://localhost", { headers: await headers() }));
  if (!staff) redirect("/login");
  if (staff.role !== Role.SUPER_ADMIN) redirect("/admin");
  return <main className={styles.page}><div className={styles.shell}><header className={styles.header}><p>BRANCHES & REPORTS</p><h1>Branches & reports</h1><span>Manage branches and open branch-level reports from one table.</span></header><BranchManager/></div></main>;
}
