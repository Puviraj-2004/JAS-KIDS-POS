ALTER TABLE "products"
  DROP COLUMN IF EXISTS "sku",
  DROP COLUMN IF EXISTS "category_id",
  DROP COLUMN IF EXISTS "item_type",
  DROP COLUMN IF EXISTS "unit",
  DROP COLUMN IF EXISTS "low_stock_threshold",
  DROP COLUMN IF EXISTS "stock_tracked";

DROP TABLE IF EXISTS "product_categories";

DROP TYPE IF EXISTS "CatalogItemType";
