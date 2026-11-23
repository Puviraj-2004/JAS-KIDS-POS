-- Run this only against the POS database when starting fresh.
-- Preserves: branches, staff accounts (including super/branch admins), and seeded expense_types.
-- Removes: demo bookings, payments, sales, stock, suppliers, products, expenses, audit logs, and sessions.

BEGIN;

DELETE FROM payments;
DELETE FROM receipts;
DELETE FROM transactions;
DELETE FROM checkins;
DELETE FROM booking_items;
DELETE FROM booking_children;
DELETE FROM bookings;
DELETE FROM sale_items;
DELETE FROM sales;
DELETE FROM stock_movements;
DELETE FROM stock_batches;
DELETE FROM supplier_purchase_items;
DELETE FROM supplier_purchases;
DELETE FROM branch_expenses;
DELETE FROM suppliers;
DELETE FROM products;
DELETE FROM audit_logs;
DELETE FROM sessions;

COMMIT;

-- Intentionally preserved:
-- branches
-- staff
-- expense_types
