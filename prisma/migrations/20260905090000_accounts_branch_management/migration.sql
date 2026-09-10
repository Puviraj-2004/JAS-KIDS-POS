CREATE TYPE "RegisterStatus" AS ENUM ('OPEN', 'CLOSED');

ALTER TABLE "branches" ADD COLUMN "jaskids_branch_id" UUID;
ALTER TABLE "transactions" ADD COLUMN "register_session_id" UUID;
ALTER TABLE "supplier_payments" ADD COLUMN "register_session_id" UUID;

CREATE TABLE "cash_register_sessions" (
  "id" UUID NOT NULL,
  "branch_id" UUID NOT NULL,
  "status" "RegisterStatus" NOT NULL DEFAULT 'OPEN',
  "opening_balance" DECIMAL(12,2) NOT NULL,
  "opened_by" UUID NOT NULL,
  "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expected_cash" DECIMAL(12,2),
  "actual_cash" DECIMAL(12,2),
  "difference" DECIMAL(12,2),
  "closed_by" UUID,
  "closed_at" TIMESTAMP(3),
  "note" TEXT,
  CONSTRAINT "cash_register_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "branch_expenses" (
  "id" UUID NOT NULL,
  "branch_id" UUID NOT NULL,
  "register_session_id" UUID,
  "category" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "payment_method" "PaymentMethod" NOT NULL,
  "reference" TEXT,
  "recorded_by" UUID NOT NULL,
  "incurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "branch_expenses_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "branches_jaskids_branch_id_key" ON "branches"("jaskids_branch_id");
CREATE UNIQUE INDEX "cash_register_sessions_one_open_per_branch" ON "cash_register_sessions"("branch_id") WHERE "status" = 'OPEN';
CREATE INDEX "cash_register_sessions_branch_id_opened_at_idx" ON "cash_register_sessions"("branch_id", "opened_at");
CREATE INDEX "branch_expenses_branch_id_incurred_at_idx" ON "branch_expenses"("branch_id", "incurred_at");
CREATE INDEX "branch_expenses_register_session_id_idx" ON "branch_expenses"("register_session_id");
CREATE INDEX "transactions_register_session_id_idx" ON "transactions"("register_session_id");
CREATE INDEX "supplier_payments_register_session_id_idx" ON "supplier_payments"("register_session_id");

ALTER TABLE "cash_register_sessions" ADD CONSTRAINT "cash_register_sessions_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cash_register_sessions" ADD CONSTRAINT "cash_register_sessions_opened_by_fkey" FOREIGN KEY ("opened_by") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cash_register_sessions" ADD CONSTRAINT "cash_register_sessions_closed_by_fkey" FOREIGN KEY ("closed_by") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "branch_expenses" ADD CONSTRAINT "branch_expenses_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "branch_expenses" ADD CONSTRAINT "branch_expenses_register_session_id_fkey" FOREIGN KEY ("register_session_id") REFERENCES "cash_register_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "branch_expenses" ADD CONSTRAINT "branch_expenses_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_register_session_id_fkey" FOREIGN KEY ("register_session_id") REFERENCES "cash_register_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_register_session_id_fkey" FOREIGN KEY ("register_session_id") REFERENCES "cash_register_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
