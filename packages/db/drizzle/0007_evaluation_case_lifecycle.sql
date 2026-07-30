ALTER TABLE "ai_evaluation_cases"
  ADD COLUMN "lifecycle" varchar(16) NOT NULL DEFAULT 'gold',
  ADD COLUMN "generation_metadata" jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX "ai_evaluation_cases_dataset_lifecycle_idx"
  ON "ai_evaluation_cases" USING btree ("dataset_id", "lifecycle");
