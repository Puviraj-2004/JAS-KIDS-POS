import type { ReactNode } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/layout/AppHeader";
import { getCurrentStaff } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function PosLayout({ children }: { children: ReactNode }) {
  const staff = await getCurrentStaff(new Request("http://localhost", { headers: headers() }));
  if (!staff) redirect("/login");
  const branch = staff.branch_id ? await prisma.branch.findUnique({ where: { id: staff.branch_id } }) : null;
  return <div className="admin-workspace"><AppHeader name={staff.name} role={staff.role} branchName={branch?.name ?? "All branches"} isAdmin={false}/><div id="workspace-content" className="workspace-content" tabIndex={-1}>{children}</div></div>;
}
