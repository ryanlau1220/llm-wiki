ALTER TABLE "ai_evaluation_cases"
  ALTER COLUMN "lifecycle" SET DEFAULT 'baseline';

UPDATE "ai_evaluation_cases"
  SET "lifecycle" = 'baseline'
  WHERE "lifecycle" IN ('silver', 'gold');
