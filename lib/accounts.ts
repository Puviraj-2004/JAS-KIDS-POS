import { BookingType, SaleStatus, StockMovementType } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export function dateRange(url: URL) {
  const now = new Date();
  const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1);
  const fromValue = url.searchParams.get("from");
  const toValue = url.searchParams.get("to");
  const from = fromValue ? localDateBoundary(fromValue, false) : defaultFrom;
  const to = toValue ? localDateBoundary(toValue, true) : new Date();
  return {
    from: Number.isNaN(from.getTime()) ? defaultFrom : from,
    to: Number.isNaN(to.getTime()) ? new Date() : to,
  };
}

function localDateBoundary(value: string, endOfDay: boolean) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return new Date(Number.NaN);
  const sriLankaOffsetMinutes = 5 * 60 + 30;
  const utcBoundary = endOfDay
    ? Date.UTC(year, month - 1, day, 23, 59, 59, 999)
    : Date.UTC(year, month - 1, day, 0, 0, 0, 0);
  return new Date(utcBoundary - sriLankaOffsetMinutes * 60 * 1000);
}

function emptyBookingBreakdown() {
  return {
    online_playhouse: { amount: 0, count: 0 },
    walkin_playhouse: { amount: 0, count: 0 },
    online_birthday: { amount: 0, count: 0 },
    walkin_birthday: { amount: 0, count: 0 },
    unknown: { amount: 0, count: 0 },
  };
}

function bookingKey(type: BookingType) {
  if (type === BookingType.ONLINE_PLAYHOUSE) return "online_playhouse";
  if (type === BookingType.WALKIN_PLAYHOUSE) return "walkin_playhouse";
  if (type === BookingType.ONLINE_BIRTHDAY) return "online_birthday";
  if (type === BookingType.WALKIN_BIRTHDAY) return "walkin_birthday";
  return "unknown";
}

export async function financialData(branchId: string | null, from: Date, to: Date) {
  const branchWhere = branchId ? { branch_id: branchId } : {};
  const [checkins, sales, wastage, expenses, purchases] = await Promise.all([
    prisma.checkIn.findMany({
      where: { ...branchWhere, checked_in_at: { gte: from, lte: to } },
      include: { booking: { select: { booking_type: true, total_price: true } } },
      orderBy: { checked_in_at: "asc" },
    }),
    prisma.sale.findMany({
      where: { ...branchWhere, status: SaleStatus.COMPLETED, created_at: { gte: from, lte: to } },
      select: { total: true, created_at: true },
      orderBy: { created_at: "asc" },
    }),
    prisma.stockMovement.findMany({
      where: { ...branchWhere, type: StockMovementType.WASTAGE, created_at: { gte: from, lte: to } },
      select: { quantity: true, unit_cost: true, created_at: true },
      orderBy: { created_at: "asc" },
    }),
    prisma.branchExpense.findMany({
      where: { ...branchWhere, incurred_at: { gte: from, lte: to } },
      select: { amount: true, incurred_at: true },
      orderBy: { incurred_at: "asc" },
    }),
    prisma.supplierPurchase.findMany({
      where: { ...branchWhere, purchased_at: { gte: from, lte: to } },
      select: { total: true, purchased_at: true },
      orderBy: { purchased_at: "asc" },
    }),
  ]);

  const bookingBreakdown = emptyBookingBreakdown();
  for (const checkin of checkins) {
    const key = bookingKey(checkin.booking.booking_type);
    bookingBreakdown[key].amount += Number(checkin.booking.total_price);
    bookingBreakdown[key].count += 1;
  }

  const cafeRevenue = sales.reduce((sum, sale) => sum + Number(sale.total), 0);
  const wastageLoss = wastage.reduce((sum, item) => sum + Number(item.quantity) * Number(item.unit_cost ?? 0), 0);
  const expenseLoss = expenses.reduce((sum, item) => sum + Number(item.amount), 0);
  const supplierPurchaseCost = purchases.reduce((sum, purchase) => sum + Number(purchase.total), 0);
  const playhouseRevenue = bookingBreakdown.online_playhouse.amount + bookingBreakdown.walkin_playhouse.amount;
  const birthdayRevenue = bookingBreakdown.online_birthday.amount + bookingBreakdown.walkin_birthday.amount;
  const overallIncome = playhouseRevenue + birthdayRevenue + cafeRevenue;
  const overallExpenses = wastageLoss + expenseLoss + supplierPurchaseCost;

  return {
    summary: {
      overall_income: overallIncome,
      overall_expenses: overallExpenses,
      net_revenue: overallIncome - overallExpenses,
      playhouse_revenue: playhouseRevenue,
      birthday_revenue: birthdayRevenue,
      cafe_revenue: cafeRevenue,
      wastage_loss: wastageLoss,
      expense_loss: expenseLoss,
      supplier_purchase_cost: supplierPurchaseCost,
    },
    booking_breakdown: bookingBreakdown,
    counts: {
      bookings: checkins.length,
      sales: sales.length,
      wastage_records: wastage.length,
      expenses: expenses.length,
      supplier_purchases: purchases.length,
    },
  };
}
