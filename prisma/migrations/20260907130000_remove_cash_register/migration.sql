ALTER TABLE "transactions" DROP COLUMN IF EXISTS "register_session_id";
ALTER TABLE "supplier_payments" DROP COLUMN IF EXISTS "register_session_id";
ALTER TABLE "branch_expenses" DROP COLUMN IF EXISTS "register_session_id";

DROP TABLE IF EXISTS "cash_register_sessions";
DROP TYPE IF EXISTS "RegisterStatus";
