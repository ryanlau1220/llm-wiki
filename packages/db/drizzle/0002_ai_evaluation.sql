CREATE TABLE "ai_evaluation_datasets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(160) NOT NULL,
  "description" text,
  "version" integer DEFAULT 1 NOT NULL,
  "approved_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_evaluation_cases" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "dataset_id" uuid NOT NULL,
  "label" varchar(160) NOT NULL,
  "redacted_input" text NOT NULL,
  "expected_evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "expected_outcome" text,
  "reference_answer" text,
  "candidate_output" text,
  "retrieved_evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "source_trace_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_evaluation_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "dataset_id" uuid NOT NULL,
  "dataset_version" integer NOT NULL,
  "evaluator_contract_version" varchar(80) NOT NULL,
  "rubric_version" varchar(80) NOT NULL,
  "judge_enabled" boolean DEFAULT false NOT NULL,
  "model_provider" varchar(80),
  "model_name" varchar(160),
  "max_cases" integer NOT NULL,
  "max_judge_calls" integer NOT NULL,
  "max_total_tokens" integer NOT NULL,
  "status" varchar(20) NOT NULL,
  "error_code" varchar(80),
  "summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone,
  "duration_ms" integer
);
--> statement-breakpoint
CREATE TABLE "ai_evaluation_results" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "evaluation_run_id" uuid NOT NULL,
  "evaluation_case_id" uuid NOT NULL,
  "status" varchar(20) NOT NULL,
  "deterministic" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "judge_score" double precision,
  "judge_rationale" varchar(1000),
  "prompt_tokens" integer,
  "candidate_tokens" integer,
  "total_tokens" integer,
  "error_code" varchar(80),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_evaluation_spans" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "evaluation_run_id" uuid NOT NULL,
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
ALTER TABLE "ai_evaluation_cases" ADD CONSTRAINT "ai_evaluation_cases_dataset_id_ai_evaluation_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."ai_evaluation_datasets"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ai_evaluation_cases" ADD CONSTRAINT "ai_evaluation_cases_source_trace_id_retrieval_runs_id_fk" FOREIGN KEY ("source_trace_id") REFERENCES "public"."retrieval_runs"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ai_evaluation_runs" ADD CONSTRAINT "ai_evaluation_runs_dataset_id_ai_evaluation_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."ai_evaluation_datasets"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ai_evaluation_results" ADD CONSTRAINT "ai_evaluation_results_evaluation_run_id_ai_evaluation_runs_id_fk" FOREIGN KEY ("evaluation_run_id") REFERENCES "public"."ai_evaluation_runs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ai_evaluation_results" ADD CONSTRAINT "ai_evaluation_results_evaluation_case_id_ai_evaluation_cases_id_fk" FOREIGN KEY ("evaluation_case_id") REFERENCES "public"."ai_evaluation_cases"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ai_evaluation_spans" ADD CONSTRAINT "ai_evaluation_spans_evaluation_run_id_ai_evaluation_runs_id_fk" FOREIGN KEY ("evaluation_run_id") REFERENCES "public"."ai_evaluation_runs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "ai_evaluation_datasets_approved_at_idx" ON "ai_evaluation_datasets" USING btree ("approved_at");
--> statement-breakpoint
CREATE INDEX "ai_evaluation_cases_dataset_id_idx" ON "ai_evaluation_cases" USING btree ("dataset_id");
--> statement-breakpoint
CREATE INDEX "ai_evaluation_cases_source_trace_id_idx" ON "ai_evaluation_cases" USING btree ("source_trace_id");
--> statement-breakpoint
CREATE INDEX "ai_evaluation_runs_dataset_started_at_idx" ON "ai_evaluation_runs" USING btree ("dataset_id", "started_at");
--> statement-breakpoint
CREATE INDEX "ai_evaluation_runs_status_started_at_idx" ON "ai_evaluation_runs" USING btree ("status", "started_at");
--> statement-breakpoint
CREATE INDEX "ai_evaluation_results_run_id_idx" ON "ai_evaluation_results" USING btree ("evaluation_run_id");
--> statement-breakpoint
CREATE INDEX "ai_evaluation_results_case_id_idx" ON "ai_evaluation_results" USING btree ("evaluation_case_id");
--> statement-breakpoint
CREATE INDEX "ai_evaluation_spans_run_started_at_idx" ON "ai_evaluation_spans" USING btree ("evaluation_run_id", "started_at");
