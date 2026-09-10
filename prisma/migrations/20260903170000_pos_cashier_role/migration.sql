-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'CASHIER');

-- CreateEnum
CREATE TYPE "ApiKeyStatus" AS ENUM ('PENDING', 'APPROVED', 'REVOKED');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('ONLINE_BOOKING', 'WALK_IN');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CARD', 'UPI', 'ONLINE');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PAID', 'UNPAID', 'PARTIAL');

-- CreateTable
CREATE TABLE "branches" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "branch_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_api_keys" (
    "id" UUID NOT NULL,
    "system_name" TEXT NOT NULL DEFAULT 'JASKIDS POS',
    "api_key_hash" TEXT NOT NULL,
    "branch_id" UUID NOT NULL,
    "status" "ApiKeyStatus" NOT NULL DEFAULT 'PENDING',
    "approved_by" UUID,
    "approved_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "last_used_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pos_api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_checkins" (
    "id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "qr_hash" TEXT NOT NULL,
    "jaskids_booking_id" TEXT,
    "reference_no" TEXT NOT NULL,
    "parent_name" TEXT NOT NULL,
    "parent_phone" TEXT,
    "baby_name" TEXT,
    "child_count" INTEGER NOT NULL DEFAULT 1,
    "booking_date" TIMESTAMP(3) NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "slot_name" TEXT,
    "total_price" DECIMAL(10,2) NOT NULL,
    "amount_paid" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "amount_due" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "payment_status" "PaymentStatus" NOT NULL,
    "payment_method" "PaymentMethod",
    "membership_id" TEXT,
    "membership_value_lkr" DECIMAL(10,2),
    "checked_in_by" UUID NOT NULL,
    "checked_in_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_checkins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" UUID NOT NULL,
    "receipt_no" TEXT NOT NULL,
    "branch_id" UUID NOT NULL,
    "type" "TransactionType" NOT NULL,
    "checkin_id" UUID,
    "customer_name" TEXT,
    "customer_phone" TEXT,
    "subtotal" DECIMAL(10,2) NOT NULL,
    "discount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(10,2) NOT NULL,
    "amount_received" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "change_given" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "payment_method" "PaymentMethod" NOT NULL,
    "payment_status" "PaymentStatus" NOT NULL,
    "note" TEXT,
    "staff_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipts" (
    "id" UUID NOT NULL,
    "transaction_id" UUID NOT NULL,
    "receipt_no" TEXT NOT NULL,
    "printed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receipts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "staff_email_key" ON "staff"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "pos_api_keys_api_key_hash_key" ON "pos_api_keys"("api_key_hash");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_receipt_no_key" ON "transactions"("receipt_no");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_checkin_id_key" ON "transactions"("checkin_id");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_transaction_id_key" ON "receipts"("transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_receipt_no_key" ON "receipts"("receipt_no");

-- AddForeignKey
ALTER TABLE "staff" ADD CONSTRAINT "staff_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_api_keys" ADD CONSTRAINT "pos_api_keys_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_api_keys" ADD CONSTRAINT "pos_api_keys_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_checkins" ADD CONSTRAINT "booking_checkins_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_checkins" ADD CONSTRAINT "booking_checkins_checked_in_by_fkey" FOREIGN KEY ("checked_in_by") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_checkin_id_fkey" FOREIGN KEY ("checkin_id") REFERENCES "booking_checkins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
