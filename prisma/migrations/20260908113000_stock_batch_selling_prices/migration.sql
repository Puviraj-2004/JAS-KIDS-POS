ALTER TABLE "products" ALTER COLUMN "selling_price" DROP NOT NULL;

ALTER TABLE "supplier_purchase_items" ADD COLUMN "selling_price" DECIMAL(12,2);

UPDATE "supplier_purchase_items" AS "item"
SET "selling_price" = COALESCE("product"."selling_price", 0)
FROM "products" AS "product"
WHERE "product"."id" = "item"."product_id";

ALTER TABLE "supplier_purchase_items" ALTER COLUMN "selling_price" SET NOT NULL;

ALTER TABLE "stock_movements" ADD COLUMN "selling_price" DECIMAL(12,2);

CREATE TABLE "stock_batches" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "branch_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "supplier_purchase_item_id" UUID,
  "quantity_received" DECIMAL(12,3) NOT NULL,
  "quantity_remaining" DECIMAL(12,3) NOT NULL,
  "buying_price" DECIMAL(12,2) NOT NULL,
  "selling_price" DECIMAL(12,2) NOT NULL,
  "received_by" UUID NOT NULL,
  "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "stock_batches_pkey" PRIMARY KEY ("id")
);

INSERT INTO "stock_batches" (
  "branch_id",
  "product_id",
  "supplier_purchase_item_id",
  "quantity_received",
  "quantity_remaining",
  "buying_price",
  "selling_price",
  "received_by",
  "received_at",
  "created_at"
)
SELECT
  "purchase"."branch_id",
  "item"."product_id",
  "item"."id",
  "item"."quantity",
  "item"."quantity",
  "item"."unit_cost",
  "item"."selling_price",
  "purchase"."created_by",
  "purchase"."purchased_at",
  "purchase"."created_at"
FROM "supplier_purchase_items" AS "item"
INNER JOIN "supplier_purchases" AS "purchase" ON "purchase"."id" = "item"."purchase_id";

CREATE UNIQUE INDEX "stock_batches_supplier_purchase_item_id_key" ON "stock_batches"("supplier_purchase_item_id");
CREATE INDEX "stock_batches_branch_id_product_id_idx" ON "stock_batches"("branch_id", "product_id");
CREATE INDEX "stock_batches_branch_id_quantity_remaining_idx" ON "stock_batches"("branch_id", "quantity_remaining");

ALTER TABLE "stock_batches" ADD CONSTRAINT "stock_batches_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_batches" ADD CONSTRAINT "stock_batches_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_batches" ADD CONSTRAINT "stock_batches_supplier_purchase_item_id_fkey" FOREIGN KEY ("supplier_purchase_item_id") REFERENCES "supplier_purchase_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "stock_batches" ADD CONSTRAINT "stock_batches_received_by_fkey" FOREIGN KEY ("received_by") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sale_items" ADD COLUMN "stock_batch_id" UUID;
CREATE INDEX "sale_items_stock_batch_id_idx" ON "sale_items"("stock_batch_id");
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_stock_batch_id_fkey" FOREIGN KEY ("stock_batch_id") REFERENCES "stock_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
