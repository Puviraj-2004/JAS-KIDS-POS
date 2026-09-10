DROP INDEX IF EXISTS "products_supplier_id_idx";

ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "products_supplier_id_fkey";

ALTER TABLE "products"
  DROP COLUMN IF EXISTS "supplier_id",
  DROP COLUMN IF EXISTS "buying_price";
