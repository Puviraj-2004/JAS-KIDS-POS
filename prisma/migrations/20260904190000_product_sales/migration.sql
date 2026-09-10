ALTER TYPE "TransactionType" ADD VALUE 'PRODUCT_SALE';
ALTER TYPE "StockMovementType" ADD VALUE 'SALE_REVERSAL';

CREATE TYPE "SaleStatus" AS ENUM ('COMPLETED', 'CANCELLED');

ALTER TABLE "transactions" ADD COLUMN "sale_id" UUID;

CREATE TABLE "sales" (
    "id" UUID NOT NULL,
    "sale_no" TEXT NOT NULL,
    "branch_id" UUID NOT NULL,
    "cashier_id" UUID NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL,
    "amount_received" DECIMAL(12,2) NOT NULL,
    "change_given" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "payment_method" "PaymentMethod" NOT NULL,
    "status" "SaleStatus" NOT NULL DEFAULT 'COMPLETED',
    "idempotency_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelled_at" TIMESTAMP(3),
    "cancelled_by" UUID,
    "cancellation_reason" TEXT,
    CONSTRAINT "sales_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sale_items" (
    "id" UUID NOT NULL,
    "sale_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "product_name" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "unit_cost" DECIMAL(12,2) NOT NULL,
    "line_total" DECIMAL(12,2) NOT NULL,
    CONSTRAINT "sale_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sales_sale_no_key" ON "sales"("sale_no");
CREATE UNIQUE INDEX "sales_idempotency_key_key" ON "sales"("idempotency_key");
CREATE INDEX "sales_branch_id_created_at_idx" ON "sales"("branch_id", "created_at");
CREATE INDEX "sales_cashier_id_created_at_idx" ON "sales"("cashier_id", "created_at");
CREATE INDEX "sale_items_sale_id_idx" ON "sale_items"("sale_id");
CREATE INDEX "sale_items_product_id_idx" ON "sale_items"("product_id");
CREATE UNIQUE INDEX "transactions_sale_id_key" ON "transactions"("sale_id");

ALTER TABLE "sales" ADD CONSTRAINT "sales_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales" ADD CONSTRAINT "sales_cashier_id_fkey" FOREIGN KEY ("cashier_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales" ADD CONSTRAINT "sales_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;
