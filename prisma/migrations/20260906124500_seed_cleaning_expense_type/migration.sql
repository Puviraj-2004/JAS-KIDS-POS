INSERT INTO "expense_types" ("name") VALUES ('Cleaning')
ON CONFLICT ("name") DO NOTHING;
