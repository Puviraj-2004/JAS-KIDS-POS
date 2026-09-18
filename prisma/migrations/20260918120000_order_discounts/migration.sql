CREATE TYPE "DiscountType" AS ENUM ('NONE', 'PERCENTAGE', 'FIXED');
ALTER TABLE "bookings"
  ADD COLUMN "subtotal" DECIMAL(12,2),
  ADD COLUMN "discount_type" "DiscountType" NOT NULL DEFAULT 'NONE',
  ADD COLUMN "discount_value" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "external_discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "idempotency_key" TEXT;
CREATE UNIQUE INDEX "bookings_idempotency_key_key" ON "bookings"("idempotency_key");
-- Imported historical totals are preserved; unknown original subtotals stay null.
UPDATE "bookings" SET "subtotal" = "total_price"
WHERE "external_booking_id" IS NULL;
ALTER TABLE "sales"
  ADD COLUMN "discount_type" "DiscountType" NOT NULL DEFAULT 'NONE',
  ADD COLUMN "discount_value" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "transactions"
  ADD COLUMN "discount_type" "DiscountType" NOT NULL DEFAULT 'NONE',
  ADD COLUMN "discount_value" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ALTER COLUMN "subtotal" TYPE DECIMAL(12,2),
  ALTER COLUMN "discount" TYPE DECIMAL(12,2),
  ALTER COLUMN "total" TYPE DECIMAL(12,2),
  ALTER COLUMN "amount_received" TYPE DECIMAL(12,2),
  ALTER COLUMN "change_given" TYPE DECIMAL(12,2);
UPDATE "sales" SET "discount_type" = 'FIXED', "discount_value" = "discount" WHERE "discount" > 0;
UPDATE "transactions" SET "discount_type" = 'FIXED', "discount_value" = "discount" WHERE "discount" > 0;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_discount_valid" CHECK (
  "discount_value" >= 0 AND "discount" >= 0
  AND ("discount_type" <> 'NONE' OR ("discount_value" = 0 AND "discount" = 0))
  AND ("discount_type" <> 'PERCENTAGE' OR "discount_value" <= 100)
  AND ("discount_type" <> 'FIXED' OR "discount_value" = "discount")
  AND ("subtotal" IS NULL OR "discount" <= "subtotal")
);
ALTER TABLE "sales" ADD CONSTRAINT "sales_discount_valid" CHECK (
  "discount_value" >= 0 AND "discount" >= 0
  AND ("discount_type" <> 'NONE' OR ("discount_value" = 0 AND "discount" = 0))
  AND ("discount_type" <> 'PERCENTAGE' OR "discount_value" <= 100)
  AND ("discount_type" <> 'FIXED' OR "discount_value" = "discount")
  AND ("subtotal" IS NULL OR "discount" <= "subtotal")
);
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_discount_valid" CHECK (
  "discount_value" >= 0 AND "discount" >= 0
  AND ("discount_type" <> 'NONE' OR ("discount_value" = 0 AND "discount" = 0))
  AND ("discount_type" <> 'PERCENTAGE' OR "discount_value" <= 100)
  AND ("discount_type" <> 'FIXED' OR "discount_value" = "discount")
  AND ("subtotal" IS NULL OR "discount" <= "subtotal")
);