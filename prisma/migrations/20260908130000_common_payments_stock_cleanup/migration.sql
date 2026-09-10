CREATE TYPE "PaymentDirection" AS ENUM ('INCOME', 'OUTGOING');

CREATE TYPE "PaymentSource" AS ENUM ('BOOKING', 'EXPENSE', 'PURCHASE', 'SALE', 'WASTAGE');

CREATE TABLE "payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "branch_id" UUID NOT NULL,
    "direction" "PaymentDirection" NOT NULL,
    "source" "PaymentSource" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "reference" TEXT,
    "note" TEXT,
    "booking_id" UUID,
    "checkin_id" UUID,
    "expense_id" UUID,
    "purchase_id" UUID,
    "sale_id" UUID,
    "wastage_id" UUID,
    "paid_by" UUID NOT NULL,
    "paid_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payments_single_source_chk" CHECK (
      num_nonnulls("booking_id", "expense_id", "purchase_id", "sale_id", "wastage_id") = 1
    )
);

INSERT INTO "payments" (
  "id", "branch_id", "direction", "source", "amount", "method", "reference", "note", "purchase_id", "paid_by", "paid_at", "created_at"
)
SELECT
  "id", "branch_id", 'OUTGOING'::"PaymentDirection", 'PURCHASE'::"PaymentSource", "amount", "method", "reference", "note", "purchase_id", "paid_by", "created_at", "created_at"
FROM "supplier_payments";

INSERT INTO "payments" (
  "branch_id", "direction", "source", "amount", "method", "reference", "note", "expense_id", "paid_by", "paid_at", "created_at"
)
SELECT
  "branch_id", 'OUTGOING'::"PaymentDirection", 'EXPENSE'::"PaymentSource", "amount", "payment_method", "reference", "description", "id", "recorded_by", "incurred_at", "created_at"
FROM "branch_expenses";

INSERT INTO "payments" (
  "branch_id", "direction", "source", "amount", "method", "sale_id", "paid_by", "paid_at", "created_at"
)
SELECT
  "branch_id", 'INCOME'::"PaymentDirection", 'SALE'::"PaymentSource", "total", "payment_method", "id", "cashier_id", "created_at", "created_at"
FROM "sales"
WHERE "status" = 'COMPLETED';

INSERT INTO "payments" (
  "branch_id", "direction", "source", "amount", "method", "booking_id", "checkin_id", "paid_by", "paid_at", "created_at"
)
SELECT
  c."branch_id", 'INCOME'::"PaymentDirection", 'BOOKING'::"PaymentSource", c."amount_collected", c."payment_method", c."booking_id", c."id", c."checked_in_by", c."checked_in_at", c."checked_in_at"
FROM "checkins" c
WHERE c."amount_collected" > 0 AND c."payment_method" IS NOT NULL;

INSERT INTO "payments" (
  "branch_id", "direction", "source", "amount", "method", "note", "wastage_id", "paid_by", "paid_at", "created_at"
)
SELECT
  "branch_id",
  'OUTGOING'::"PaymentDirection",
  'WASTAGE'::"PaymentSource",
  ROUND(("quantity" * COALESCE("unit_cost", 0))::numeric, 2),
  'CASH'::"PaymentMethod",
  "note",
  "id",
  "performed_by",
  "created_at",
  "created_at"
FROM "stock_movements"
WHERE "type" = 'WASTAGE' AND "unit_cost" IS NOT NULL AND "quantity" * "unit_cost" > 0;

ALTER TABLE "payments" ADD CONSTRAINT "payments_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_checkin_id_fkey" FOREIGN KEY ("checkin_id") REFERENCES "checkins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "branch_expenses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "supplier_purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_wastage_id_fkey" FOREIGN KEY ("wastage_id") REFERENCES "stock_movements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_paid_by_fkey" FOREIGN KEY ("paid_by") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "payments_branch_id_paid_at_idx" ON "payments"("branch_id", "paid_at");
CREATE INDEX "payments_source_paid_at_idx" ON "payments"("source", "paid_at");
CREATE INDEX "payments_booking_id_idx" ON "payments"("booking_id");
CREATE INDEX "payments_expense_id_idx" ON "payments"("expense_id");
CREATE INDEX "payments_purchase_id_idx" ON "payments"("purchase_id");
CREATE INDEX "payments_sale_id_idx" ON "payments"("sale_id");
CREATE INDEX "payments_wastage_id_idx" ON "payments"("wastage_id");

ALTER TABLE "branch_expenses" DROP COLUMN "payment_method";
ALTER TABLE "branch_expenses" DROP COLUMN "reference";

ALTER TABLE "sale_items" DROP COLUMN "sku";

DROP TABLE "branch_inventory";
DROP TABLE "supplier_payments";
