DROP INDEX "ai_trace_feedback_trace_signal_unique";--> statement-breakpoint
UPDATE "ai_evaluation_cases"
  SET "lifecycle" = 'candidate'
  WHERE "source_trace_id" IS NOT NULL
    AND "lifecycle" = 'baseline';
