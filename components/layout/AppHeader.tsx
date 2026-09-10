"use client";
import Image from "next/image";
import Link from "next/link";
import { BarChart3, BookOpenCheck, Boxes, Building2, ChevronLeft, ChevronRight, LayoutDashboard, LogOut, Menu, PackageOpen, ReceiptText, ShoppingCart, Store, Truck, UsersRound, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import styles from "./AppHeader.module.css";

type Props = { name: string; role: string; branchName: string; isAdmin: boolean };
const superAdminLinks = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/branches", label: "Branches & Reports", icon: Building2 },
  { href: "/admin/staff", label: "Staff & access", icon: UsersRound },
  { href: "/admin/suppliers", label: "Suppliers & Accounts", icon: Truck },
  { href: "/admin/items", label: "Items, Services & Packages", icon: PackageOpen },
  { href: "/admin/expenses", label: "Expenses", icon: ReceiptText },
];
const branchAdminLinks = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/pos/bookings", label: "Bookings", icon: BookOpenCheck },
  { href: "/pos/sales", label: "Sales", icon: ShoppingCart },
  { href: "/admin/suppliers", label: "Suppliers & Accounts", icon: Truck },
  { href: "/admin/items", label: "Items, Services & Packages", icon: PackageOpen },
  { href: "/admin/stock", label: "Stock & Wastage", icon: Boxes },
  { href: "/admin/expenses", label: "Expenses", icon: ReceiptText },
  { href: "/admin/reports", label: "Reports & Analytics", icon: BarChart3 },
];
const cashierLinks = [
  { href: "/pos/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/pos/bookings", label: "Bookings", icon: BookOpenCheck },
  { href: "/pos/sales", label: "Sales", icon: ShoppingCart },
  { href: "/pos/stock", label: "Stock & Wastage", icon: Boxes },
];

export function AppHeader({ name, role, branchName, isAdmin }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const confirm = useConfirm();
  const [signingOut, setSigningOut] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { setMenuOpen(false); }, [pathname]);
  useEffect(() => {
    const saved = window.localStorage.getItem("jaskids-pos-sidebar");
    if (saved === "collapsed") setCollapsed(true);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.sidebar = collapsed ? "collapsed" : "expanded";
    window.localStorage.setItem("jaskids-pos-sidebar", collapsed ? "collapsed" : "expanded");
    return () => { delete document.documentElement.dataset.sidebar; };
  }, [collapsed]);
  const sidebarLinks = role === "SUPER_ADMIN" ? superAdminLinks : role === "BRANCH_ADMIN" ? branchAdminLinks : cashierLinks;
  async function logout() {
    if (signingOut || !await confirm({ title: "Log out of POS?", description: "You will need to sign in again to continue working.", confirmLabel: "Log out" })) return;
    setSigningOut(true); setError("");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error();
      router.replace("/login"); router.refresh();
    } catch { setError("Logout failed. Please try again."); setSigningOut(false); }
  }
  const overviewHref = role === "CASHIER" ? "/pos/dashboard" : "/admin";
  const active = (href: string) => href === "/admin" ? pathname === "/admin" : href === "/admin/branches" ? pathname === "/admin/branches" || pathname === "/admin/reports" : pathname === href || pathname.startsWith(href + "/");
  return <>
    <a className="skip-link" href="#workspace-content">Skip to content</a>
    <header className={styles.header + (isAdmin ? " " + styles.adminHeader : "")}>
      <div className={styles.bar}>
        <Link className={styles.logoLink} href={overviewHref} aria-label="JAS Kids POS home"><Image className={styles.logo} src="/Jaskids_Logo.png" alt="JAS Kids" width={210} height={68} priority/><span>POS</span></Link>
        <button type="button" className={styles.menuButton} aria-expanded={menuOpen} aria-controls="app-navigation" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X size={18} aria-hidden="true"/> : <Menu size={18} aria-hidden="true"/>}Menu</button>
        <div className={styles.account}>
          <div className={styles.branch} title={branchName}><Store size={16} aria-hidden="true"/><span>{branchName}</span></div>
          <div className={styles.identity}><strong>{name}</strong><small>{role.replaceAll("_", " ").toLowerCase()}</small></div>
          <button className={styles.logout} type="button" onClick={() => void logout()} disabled={signingOut} aria-label="Log out"><LogOut size={17} aria-hidden="true"/><span>{signingOut ? "Logging out…" : "Logout"}</span></button>
        </div>
      </div>
      {error && <p className={styles.error} role="alert">{error}</p>}
    </header>
    <aside id="app-navigation" className={styles.sidebar + (menuOpen ? " " + styles.menuOpen : "") + (collapsed ? " " + styles.collapsed : "")}>
      <Link className={styles.sidebarBrand} href={overviewHref}><Image src="/Jaskids_Logo.png" alt="JAS Kids POS" width={150} height={49} priority/><span>POS</span></Link>
      <button type="button" className={styles.collapseButton} onClick={() => setCollapsed(current => !current)} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} title={collapsed ? "Expand sidebar" : "Collapse sidebar"}>{collapsed ? <ChevronRight size={18} aria-hidden="true"/> : <ChevronLeft size={18} aria-hidden="true"/>}<span>{collapsed ? "Expand" : "Collapse"}</span></button>
      <p className={styles.sectionLabel}>{role === "SUPER_ADMIN" ? "Super Admin" : role === "BRANCH_ADMIN" ? "Branch Admin" : "Cashier"}</p>
      <nav aria-label={`${role.replaceAll("_", " ").toLowerCase()} navigation`}>{sidebarLinks.map(({ href, label, icon: Icon }) => <Link href={href} key={href} title={collapsed ? label : undefined} aria-label={label} aria-current={active(href) ? "page" : undefined} className={active(href) ? styles.active : undefined}><Icon size={18} aria-hidden="true"/><span>{label}</span></Link>)}</nav>
      <div className={styles.sidebarFooter}><div className={styles.sidebarBranch}><Store size={16} aria-hidden="true"/><span>{branchName}</span></div><small>JASKIDS · Point of sale</small></div>
    </aside>
  </>;
}
