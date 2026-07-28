ALTER TABLE "retrieval_runs" ADD COLUMN "trace_version" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
CREATE TABLE "ai_trace_spans" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "retrieval_run_id" uuid NOT NULL,
  "parent_span_id" uuid,
  "span_type" varchar(40) NOT NULL,
  "status" varchar(20) NOT NULL,
  "attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "error_code" varchar(80),
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone,
  "duration_ms" integer
);
--> statement-breakpoint
ALTER TABLE "ai_trace_spans" ADD CONSTRAINT "ai_trace_spans_retrieval_run_id_retrieval_runs_id_fk" FOREIGN KEY ("retrieval_run_id") REFERENCES "public"."retrieval_runs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "ai_trace_spans_run_started_at_idx" ON "ai_trace_spans" USING btree ("retrieval_run_id", "started_at");
--> statement-breakpoint
CREATE INDEX "ai_trace_spans_parent_span_id_idx" ON "ai_trace_spans" USING btree ("parent_span_id");
