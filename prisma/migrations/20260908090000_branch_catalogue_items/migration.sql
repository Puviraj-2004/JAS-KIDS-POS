ALTER TABLE "products" ADD COLUMN "branch_id" UUID;

ALTER TABLE "products" ADD CONSTRAINT "products_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "products_branch_id_item_category_is_active_idx" ON "products"("branch_id", "item_category", "is_active");
