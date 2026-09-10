CREATE TYPE "StockMovementType" AS ENUM ('PURCHASE', 'SALE', 'WASTAGE', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'TRANSFER_IN', 'TRANSFER_OUT');
CREATE TYPE "PurchaseStatus" AS ENUM ('RECEIVED', 'PARTIALLY_PAID', 'PAID');

CREATE TABLE "product_categories" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "name" TEXT NOT NULL, "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "product_categories_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "products" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "sku" TEXT NOT NULL, "name" TEXT NOT NULL, "category_id" UUID NOT NULL,
  "unit" TEXT NOT NULL, "buying_price" DECIMAL(12,2) NOT NULL, "selling_price" DECIMAL(12,2) NOT NULL,
  "low_stock_threshold" DECIMAL(12,3) NOT NULL DEFAULT 0, "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "branch_inventory" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "branch_id" UUID NOT NULL, "product_id" UUID NOT NULL,
  "quantity" DECIMAL(12,3) NOT NULL DEFAULT 0, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "branch_inventory_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "stock_movements" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "branch_id" UUID NOT NULL, "product_id" UUID NOT NULL,
  "type" "StockMovementType" NOT NULL, "quantity" DECIMAL(12,3) NOT NULL, "unit_cost" DECIMAL(12,2),
  "reference_type" TEXT, "reference_id" TEXT, "note" TEXT, "performed_by" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "suppliers" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "name" TEXT NOT NULL, "contact_person" TEXT, "phone" TEXT, "email" TEXT,
  "address" TEXT, "is_active" BOOLEAN NOT NULL DEFAULT true, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL, CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "supplier_purchases" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "purchase_no" TEXT NOT NULL, "supplier_id" UUID NOT NULL, "branch_id" UUID NOT NULL,
  "status" "PurchaseStatus" NOT NULL DEFAULT 'RECEIVED', "total" DECIMAL(12,2) NOT NULL,
  "amount_paid" DECIMAL(12,2) NOT NULL DEFAULT 0, "balance_due" DECIMAL(12,2) NOT NULL, "note" TEXT,
  "purchased_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "created_by" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "supplier_purchases_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "supplier_purchase_items" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "purchase_id" UUID NOT NULL, "product_id" UUID NOT NULL,
  "quantity" DECIMAL(12,3) NOT NULL, "unit_cost" DECIMAL(12,2) NOT NULL, "line_total" DECIMAL(12,2) NOT NULL,
  CONSTRAINT "supplier_purchase_items_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "supplier_payments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "supplier_id" UUID NOT NULL, "purchase_id" UUID, "branch_id" UUID NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL, "method" "PaymentMethod" NOT NULL, "reference" TEXT, "note" TEXT,
  "paid_by" UUID NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "supplier_payments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "product_categories_name_key" ON "product_categories"("name");
CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku");
CREATE INDEX "products_category_id_is_active_idx" ON "products"("category_id", "is_active");
CREATE UNIQUE INDEX "branch_inventory_branch_id_product_id_key" ON "branch_inventory"("branch_id", "product_id");
CREATE INDEX "branch_inventory_product_id_idx" ON "branch_inventory"("product_id");
CREATE INDEX "stock_movements_branch_id_created_at_idx" ON "stock_movements"("branch_id", "created_at");
CREATE INDEX "stock_movements_product_id_created_at_idx" ON "stock_movements"("product_id", "created_at");
CREATE INDEX "suppliers_name_idx" ON "suppliers"("name");
CREATE UNIQUE INDEX "supplier_purchases_purchase_no_key" ON "supplier_purchases"("purchase_no");
CREATE INDEX "supplier_purchases_supplier_id_purchased_at_idx" ON "supplier_purchases"("supplier_id", "purchased_at");
CREATE INDEX "supplier_purchases_branch_id_purchased_at_idx" ON "supplier_purchases"("branch_id", "purchased_at");
CREATE INDEX "supplier_purchase_items_purchase_id_idx" ON "supplier_purchase_items"("purchase_id");
CREATE INDEX "supplier_purchase_items_product_id_idx" ON "supplier_purchase_items"("product_id");
CREATE INDEX "supplier_payments_supplier_id_created_at_idx" ON "supplier_payments"("supplier_id", "created_at");
CREATE INDEX "supplier_payments_branch_id_created_at_idx" ON "supplier_payments"("branch_id", "created_at");

ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "product_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "branch_inventory" ADD CONSTRAINT "branch_inventory_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "branch_inventory" ADD CONSTRAINT "branch_inventory_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_performed_by_fkey" FOREIGN KEY ("performed_by") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_purchases" ADD CONSTRAINT "supplier_purchases_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_purchases" ADD CONSTRAINT "supplier_purchases_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_purchases" ADD CONSTRAINT "supplier_purchases_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_purchase_items" ADD CONSTRAINT "supplier_purchase_items_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "supplier_purchases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "supplier_purchase_items" ADD CONSTRAINT "supplier_purchase_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "supplier_purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_paid_by_fkey" FOREIGN KEY ("paid_by") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
