ALTER TABLE "checkins"
  ADD COLUMN "walked_out_at" TIMESTAMP(3),
  ADD COLUMN "walked_out_by" UUID;

ALTER TABLE "checkins"
  ADD CONSTRAINT "checkins_walked_out_by_fkey"
  FOREIGN KEY ("walked_out_by") REFERENCES "staff"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "checkins_branch_id_walked_out_at_idx"
  ON "checkins"("branch_id", "walked_out_at");
