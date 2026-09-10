import type { ReactNode } from "react";
import { Role } from "@prisma/client";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/layout/AppHeader";
import { getCurrentStaff } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const staff = await getCurrentStaff(new Request("http://localhost", { headers: headers() }));
  if (!staff) redirect("/login");
  if (staff.role !== Role.SUPER_ADMIN && staff.role !== Role.BRANCH_ADMIN) redirect("/pos/dashboard");
  const branch = staff.role === Role.BRANCH_ADMIN && staff.branch_id ? await prisma.branch.findUnique({ where: { id: staff.branch_id }, select: { name: true } }) : null;
  return <div className="admin-workspace"><AppHeader name={staff.name} role={staff.role} branchName={staff.role === Role.SUPER_ADMIN ? "All branches" : branch?.name ?? "Assigned branch"} isAdmin/><div id="workspace-content" className="workspace-content" tabIndex={-1}>{children}</div></div>;
}
