CREATE TABLE "expense_types" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" TEXT NOT NULL,
  CONSTRAINT "expense_types_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "expense_types_name_key" ON "expense_types"("name");

INSERT INTO "expense_types" ("name") VALUES
  ('Electricity'),
  ('Salary'),
  ('Rent'),
  ('Operations'),
  ('Maintenance'),
  ('Transport'),
  ('Other')
ON CONFLICT ("name") DO NOTHING;

ALTER TABLE "branch_expenses" ADD COLUMN "expense_type_id" UUID;

UPDATE "branch_expenses"
SET "expense_type_id" = (
  SELECT "id"
  FROM "expense_types"
  WHERE "name" = CASE UPPER("branch_expenses"."category")
    WHEN 'ELECTRICITY' THEN 'Electricity'
    WHEN 'SALARY' THEN 'Salary'
    WHEN 'RENT' THEN 'Rent'
    WHEN 'OPERATIONS' THEN 'Operations'
    WHEN 'MAINTENANCE' THEN 'Maintenance'
    WHEN 'TRANSPORT' THEN 'Transport'
    ELSE 'Other'
  END
  LIMIT 1
);

UPDATE "branch_expenses"
SET "expense_type_id" = (SELECT "id" FROM "expense_types" WHERE "name" = 'Other' LIMIT 1)
WHERE "expense_type_id" IS NULL;

ALTER TABLE "branch_expenses" ALTER COLUMN "expense_type_id" SET NOT NULL;
CREATE INDEX "branch_expenses_expense_type_id_idx" ON "branch_expenses"("expense_type_id");
ALTER TABLE "branch_expenses" ADD CONSTRAINT "branch_expenses_expense_type_id_fkey" FOREIGN KEY ("expense_type_id") REFERENCES "expense_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "branch_expenses" DROP COLUMN "category";
ALTER TABLE "branch_expenses" DROP COLUMN "expense_type";
DROP TYPE "ExpenseType";
