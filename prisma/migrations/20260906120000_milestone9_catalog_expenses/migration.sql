CREATE TYPE "CatalogItemType" AS ENUM ('PRODUCT', 'SERVICE', 'PACKAGE');
CREATE TYPE "ItemCategory" AS ENUM ('CAFE_ITEM', 'BIRTHDAY_ITEM', 'OTHER_ITEM', 'SERVICE_ITEM', 'BIRTHDAY_PACKAGE', 'PLAYHOUSE_PACKAGE', 'OTHER_PACKAGE');
CREATE TYPE "ExpenseType" AS ENUM ('ELECTRICITY', 'SALARY', 'RENT', 'OPERATIONS', 'MAINTENANCE', 'TRANSPORT', 'OTHER');

ALTER TABLE "products" ADD COLUMN "item_type" "CatalogItemType" NOT NULL DEFAULT 'PRODUCT';
ALTER TABLE "products" ADD COLUMN "item_category" "ItemCategory" NOT NULL DEFAULT 'CAFE_ITEM';
ALTER TABLE "products" ADD COLUMN "stock_tracked" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "products" ADD COLUMN "supplier_id" UUID;
ALTER TABLE "products" ALTER COLUMN "category_id" DROP NOT NULL;
ALTER TABLE "products" ALTER COLUMN "buying_price" DROP NOT NULL;

ALTER TABLE "suppliers" ADD COLUMN "branch_id" UUID;

ALTER TABLE "branch_expenses" ADD COLUMN "expense_type" "ExpenseType" NOT NULL DEFAULT 'OTHER';
UPDATE "branch_expenses"
SET "expense_type" = CASE UPPER("category")
  WHEN 'ELECTRICITY' THEN 'ELECTRICITY'::"ExpenseType"
  WHEN 'SALARY' THEN 'SALARY'::"ExpenseType"
  WHEN 'RENT' THEN 'RENT'::"ExpenseType"
  WHEN 'OPERATIONS' THEN 'OPERATIONS'::"ExpenseType"
  WHEN 'MAINTENANCE' THEN 'MAINTENANCE'::"ExpenseType"
  WHEN 'TRANSPORT' THEN 'TRANSPORT'::"ExpenseType"
  ELSE 'OTHER'::"ExpenseType"
END;

CREATE INDEX "products_item_type_item_category_is_active_idx" ON "products"("item_type", "item_category", "is_active");
CREATE INDEX "products_supplier_id_idx" ON "products"("supplier_id");
CREATE INDEX "suppliers_branch_id_idx" ON "suppliers"("branch_id");

ALTER TABLE "products" DROP CONSTRAINT "products_category_id_fkey";
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "product_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "products" ADD CONSTRAINT "products_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
