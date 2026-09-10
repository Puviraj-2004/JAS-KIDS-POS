CREATE TABLE "booking_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "booking_id" UUID NOT NULL,
    "product_id" UUID,
    "item_name" TEXT NOT NULL,
    "item_category" "ItemCategory" NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "line_total" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "booking_items_booking_id_idx" ON "booking_items"("booking_id");
CREATE INDEX "booking_items_product_id_idx" ON "booking_items"("product_id");

ALTER TABLE "booking_items" ADD CONSTRAINT "booking_items_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "booking_items" ADD CONSTRAINT "booking_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
