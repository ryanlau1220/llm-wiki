CREATE TABLE "retrieval_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "operation" varchar(40) NOT NULL,
  "query_hash" varchar(64) NOT NULL,
  "query_length" integer NOT NULL,
  "policy" varchar(40) NOT NULL,
  "policy_reason" varchar(120) NOT NULL,
  "status" varchar(20) NOT NULL,
  "candidate_count" integer DEFAULT 0 NOT NULL,
  "selected_evidence_count" integer DEFAULT 0 NOT NULL,
  "context_character_count" integer DEFAULT 0 NOT NULL,
  "model_provider" varchar(80),
  "model_name" varchar(160),
  "prompt_version" varchar(40) NOT NULL,
  "duration_ms" integer,
  "error_code" varchar(80),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "retrieval_evidence" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "retrieval_run_id" uuid NOT NULL,
  "document_id" uuid NOT NULL,
  "document_path" varchar(400) NOT NULL,
  "chunk_index" integer NOT NULL,
  "content_hash" varchar(64) NOT NULL,
  "source" varchar(20) NOT NULL,
  "score" double precision NOT NULL,
  "retrieval_rank" integer NOT NULL,
  "selection_rank" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "retrieval_evidence" ADD CONSTRAINT "retrieval_evidence_retrieval_run_id_retrieval_runs_id_fk" FOREIGN KEY ("retrieval_run_id") REFERENCES "public"."retrieval_runs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "retrieval_runs_status_created_at_idx" ON "retrieval_runs" USING btree ("status", "created_at");
--> statement-breakpoint
CREATE INDEX "retrieval_runs_operation_created_at_idx" ON "retrieval_runs" USING btree ("operation", "created_at");
--> statement-breakpoint
CREATE INDEX "retrieval_evidence_run_retrieval_rank_idx" ON "retrieval_evidence" USING btree ("retrieval_run_id", "retrieval_rank");
--> statement-breakpoint
CREATE INDEX "retrieval_evidence_run_selection_rank_idx" ON "retrieval_evidence" USING btree ("retrieval_run_id", "selection_rank");
