-- AlterEnum
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'BRANCH_ADMIN';

-- AlterEnum
ALTER TYPE "TransactionType" ADD VALUE IF NOT EXISTS 'UNKNOWN_BOOKING';

-- CreateEnum
CREATE TYPE "BookingType" AS ENUM ('ONLINE', 'WALK_IN', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "CheckInStatus" AS ENUM ('CHECKED_IN', 'CANCELLED');

-- CreateTable
CREATE TABLE "bookings" (
    "id" UUID NOT NULL,
    "external_booking_id" TEXT,
    "reference_no" TEXT NOT NULL,
    "qr_hash" TEXT NOT NULL,
    "booking_type" "BookingType" NOT NULL DEFAULT 'UNKNOWN',
    "branch_id" UUID NOT NULL,
    "parent_name" TEXT NOT NULL,
    "parent_phone" TEXT,
    "baby_name" TEXT,
    "child_count" INTEGER NOT NULL DEFAULT 1,
    "booking_date" DATE NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "slot_name" TEXT,
    "service_name" TEXT,
    "total_price" DECIMAL(12,2) NOT NULL,
    "amount_paid_at_import" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "amount_due_at_import" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "external_payment_status" TEXT NOT NULL,
    "external_payment_method" TEXT,
    "external_status" TEXT NOT NULL,
    "external_qr_status" TEXT NOT NULL,
    "source_payload" JSONB NOT NULL,
    "imported_by" UUID NOT NULL,
    "imported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "refreshed_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_children" (
    "id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "date_of_birth" DATE,
    "age_category" TEXT,

    CONSTRAINT "booking_children_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checkins" (
    "id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "checked_in_by" UUID NOT NULL,
    "checked_in_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "amount_collected" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "payment_method" "PaymentMethod",
    "status" "CheckInStatus" NOT NULL DEFAULT 'CHECKED_IN',
    "note" TEXT,

    CONSTRAINT "checkins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "staff_id" UUID,
    "branch_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "old_value" JSONB,
    "new_value" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- Remove the legacy transaction foreign key before replacing booking_checkins.
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_checkin_id_fkey";

-- Preserve legacy imported/check-in records if this migration is applied after use.
INSERT INTO "bookings" (
    "id",
    "external_booking_id",
    "reference_no",
    "qr_hash",
    "booking_type",
    "branch_id",
    "parent_name",
    "parent_phone",
    "baby_name",
    "child_count",
    "booking_date",
    "start_time",
    "end_time",
    "slot_name",
    "total_price",
    "amount_paid_at_import",
    "amount_due_at_import",
    "external_payment_status",
    "external_payment_method",
    "external_status",
    "external_qr_status",
    "source_payload",
    "imported_by",
    "imported_at",
    "refreshed_at"
)
SELECT
    legacy."id",
    legacy."jaskids_booking_id",
    legacy."reference_no",
    legacy."qr_hash",
    CASE
        WHEN tx."type" = 'WALK_IN' THEN 'WALK_IN'::"BookingType"
        WHEN tx."type" = 'ONLINE_BOOKING' THEN 'ONLINE'::"BookingType"
        ELSE 'UNKNOWN'::"BookingType"
    END,
    legacy."branch_id",
    legacy."parent_name",
    legacy."parent_phone",
    legacy."baby_name",
    legacy."child_count",
    legacy."booking_date"::DATE,
    legacy."start_time",
    legacy."end_time",
    legacy."slot_name",
    legacy."total_price",
    legacy."amount_paid",
    legacy."amount_due",
    legacy."payment_status"::TEXT,
    legacy."payment_method"::TEXT,
    'checked_in',
    'used',
    to_jsonb(legacy),
    legacy."checked_in_by",
    legacy."checked_in_at",
    legacy."checked_in_at"
FROM "booking_checkins" AS legacy
LEFT JOIN "transactions" AS tx ON tx."checkin_id" = legacy."id";

INSERT INTO "booking_children" (
    "id",
    "booking_id",
    "position",
    "name"
)
SELECT
    gen_random_uuid(),
    legacy."id",
    1,
    legacy."baby_name"
FROM "booking_checkins" AS legacy
WHERE NULLIF(BTRIM(legacy."baby_name"), '') IS NOT NULL;

INSERT INTO "checkins" (
    "id",
    "booking_id",
    "branch_id",
    "checked_in_by",
    "checked_in_at",
    "amount_collected",
    "payment_method",
    "status"
)
SELECT
    legacy."id",
    legacy."id",
    legacy."branch_id",
    legacy."checked_in_by",
    legacy."checked_in_at",
    COALESCE(tx."amount_received", 0),
    legacy."payment_method",
    'CHECKED_IN'::"CheckInStatus"
FROM "booking_checkins" AS legacy
LEFT JOIN "transactions" AS tx ON tx."checkin_id" = legacy."id";

-- Replace the legacy combined table after its rows have been copied.
DROP TABLE "booking_checkins";

-- CreateIndex
CREATE UNIQUE INDEX "bookings_external_booking_id_key" ON "bookings"("external_booking_id");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_reference_no_key" ON "bookings"("reference_no");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_qr_hash_key" ON "bookings"("qr_hash");

-- CreateIndex
CREATE INDEX "bookings_branch_id_booking_date_idx" ON "bookings"("branch_id", "booking_date");

-- CreateIndex
CREATE INDEX "bookings_external_status_idx" ON "bookings"("external_status");

-- CreateIndex
CREATE UNIQUE INDEX "booking_children_booking_id_position_key" ON "booking_children"("booking_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "checkins_booking_id_key" ON "checkins"("booking_id");

-- CreateIndex
CREATE INDEX "checkins_branch_id_checked_in_at_idx" ON "checkins"("branch_id", "checked_in_at");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_branch_id_created_at_idx" ON "audit_logs"("branch_id", "created_at");

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_imported_by_fkey" FOREIGN KEY ("imported_by") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_children" ADD CONSTRAINT "booking_children_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_checked_in_by_fkey" FOREIGN KEY ("checked_in_by") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_checkin_id_fkey" FOREIGN KEY ("checkin_id") REFERENCES "checkins"("id") ON DELETE SET NULL ON UPDATE CASCADE;
