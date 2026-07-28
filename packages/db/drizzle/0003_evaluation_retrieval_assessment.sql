ALTER TABLE "ai_evaluation_cases" ADD COLUMN "retrieval_evidence_evaluated" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
UPDATE "ai_evaluation_results" AS result
SET "deterministic" = jsonb_set(result."deterministic", '{retrieval}', 'null'::jsonb, true)
FROM "ai_evaluation_cases" AS evaluation_case
WHERE result."evaluation_case_id" = evaluation_case."id"
  AND evaluation_case."retrieved_evidence" = '[]'::jsonb
  AND jsonb_typeof(result."deterministic"->'retrieval') = 'object';
