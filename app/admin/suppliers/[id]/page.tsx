import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ItemCategory, PaymentSource, Role } from "@prisma/client";
import { SupplierAccountDetail } from "@/components/admin/SupplierAccountDetail";
import { getCurrentStaff } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import styles from "../../admin.module.css";

const stockCategories = [ItemCategory.CAFE_ITEM, ItemCategory.BIRTHDAY_ITEM, ItemCategory.OTHER_ITEM];

export default async function SupplierAccountPage({ params }: { params: { id: string } }) {
  const staff = await getCurrentStaff(new Request("http://localhost", { headers: headers() }));
  if (!staff) redirect("/login");
  if (staff.role !== Role.SUPER_ADMIN && staff.role !== Role.BRANCH_ADMIN) redirect("/pos/dashboard");
  if (staff.role === Role.BRANCH_ADMIN && !staff.branch_id) redirect("/admin");

  const supplier = await prisma.supplier.findFirst({
    where: { id: params.id, is_active: true, ...(staff.role === Role.BRANCH_ADMIN ? { branch_id: staff.branch_id! } : {}) },
    include: { branch: { select: { id: true, name: true } } },
  });
  if (!supplier) notFound();

  const [purchases, payments, products] = await Promise.all([
    prisma.supplierPurchase.findMany({
      where: { supplier_id: supplier.id, ...(staff.role === Role.BRANCH_ADMIN ? { branch_id: staff.branch_id! } : {}) },
      include: { branch: { select: { id: true, name: true } }, items: { include: { product: { select: { name: true } } } } },
      orderBy: { purchased_at: "desc" },
    }),
    prisma.payment.findMany({
      where: { source: PaymentSource.PURCHASE, purchase: { supplier_id: supplier.id }, ...(staff.role === Role.BRANCH_ADMIN ? { branch_id: staff.branch_id! } : {}) },
      include: { purchase: { select: { purchase_no: true } } },
      orderBy: { paid_at: "desc" },
    }),
    prisma.product.findMany({
      where: { is_active: true, item_category: { in: stockCategories }, ...(supplier.branch?.id ? { branch_id: supplier.branch.id } : {}) },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return <main className={styles.page}><div className={styles.shell}><header className={styles.header}><p>SUPPLIER ACCOUNT</p><h1>{supplier.name}</h1><span>Review purchase history, payments, and outstanding balance.</span></header><SupplierAccountDetail supplier={{ id: supplier.id, name: supplier.name, phone: supplier.phone, address: supplier.address, branch: supplier.branch }} canManage={staff.role === Role.BRANCH_ADMIN} products={products.map(product => ({ id: product.id, name: product.name }))} purchases={purchases.map(purchase => ({ id: purchase.id, purchase_no: purchase.purchase_no, status: purchase.status, total: purchase.total.toString(), amount_paid: purchase.amount_paid.toString(), balance_due: purchase.balance_due.toString(), note: purchase.note, purchased_at: purchase.purchased_at.toISOString(), branch: purchase.branch, items: purchase.items.map(item => ({ id: item.id, quantity: item.quantity.toString(), unit_cost: item.unit_cost.toString(), selling_price: item.selling_price.toString(), line_total: item.line_total.toString(), product: item.product })) }))} payments={payments.map(payment => ({ id: payment.id, amount: payment.amount.toString(), method: payment.method, reference: payment.reference, note: payment.note, created_at: payment.paid_at.toISOString(), purchase: payment.purchase }))} /></div></main>;
}
