ALTER TABLE "ai_evaluation_runs" ADD COLUMN "workflow_manifest" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "ai_evaluation_results" ADD COLUMN "execution_trace_id" uuid;
--> statement-breakpoint
ALTER TABLE "ai_evaluation_results" ADD COLUMN "judge_labels" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "ai_evaluation_results" ADD CONSTRAINT "ai_evaluation_results_execution_trace_id_retrieval_runs_id_fk" FOREIGN KEY ("execution_trace_id") REFERENCES "public"."retrieval_runs"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "ai_evaluation_results_execution_trace_id_idx" ON "ai_evaluation_results" USING btree ("execution_trace_id");
