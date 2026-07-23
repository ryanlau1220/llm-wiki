CREATE TABLE "action_audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" varchar(128) NOT NULL,
	"action" varchar(40) NOT NULL,
	"validation_result" varchar(20) NOT NULL,
	"rejection_reason" text,
	"actor" varchar(20) NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"chunk_index" integer NOT NULL,
	"text" text NOT NULL,
	"search_vector" "tsvector" GENERATED ALWAYS AS (to_tsvector('simple', text)) STORED NOT NULL,
	"embedding" vector(768) NOT NULL,
	"embedding_model" varchar(100) NOT NULL,
	"embedding_version" varchar(40) NOT NULL,
	"source_start_offset" integer NOT NULL,
	"source_end_offset" integer NOT NULL,
	"token_count" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"path" varchar(400) NOT NULL,
	"title" varchar(150) NOT NULL,
	"type" varchar(40) NOT NULL,
	"content" text NOT NULL,
	"content_hash" varchar(128) NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"source_kind" varchar(40) NOT NULL,
	"is_ai_generated" boolean DEFAULT false NOT NULL,
	"quality_score" double precision,
	"quality_metrics" jsonb,
	"ai_status" varchar(20),
	"health_score" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "extension_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(120) NOT NULL,
	"token_hash" varchar(128) NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "extension_pairing_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code_hash" varchar(128) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingestion_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_path" varchar(400) NOT NULL,
	"file_size_bytes" bigint NOT NULL,
	"content_hash" varchar(128) NOT NULL,
	"status" varchar(20) NOT NULL,
	"error_message" text,
	"duration_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_document_id" uuid NOT NULL,
	"source_path" varchar(400) NOT NULL,
	"target_label" varchar(200) NOT NULL,
	"target_document_id" uuid,
	"is_resolved" boolean DEFAULT false NOT NULL,
	"confidence" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "research_capture_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"capture_id" uuid NOT NULL,
	"event_type" varchar(40) NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "research_captures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"extension_device_id" uuid,
	"source_url" text NOT NULL,
	"source_title" varchar(500) NOT NULL,
	"query" text,
	"content" text NOT NULL,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" varchar(20) DEFAULT 'inbox' NOT NULL,
	"review_note" text,
	"index_error" text,
	"saved_document_id" uuid,
	"saved_path" varchar(400),
	"captured_at" timestamp with time zone NOT NULL,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
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
CREATE TABLE "settings" (
	"key" varchar(100) PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" text NOT NULL,
	"role" varchar(20) DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "chunks" ADD CONSTRAINT "chunks_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "links" ADD CONSTRAINT "links_source_document_id_documents_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "links" ADD CONSTRAINT "links_target_document_id_documents_id_fk" FOREIGN KEY ("target_document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_capture_activities" ADD CONSTRAINT "research_capture_activities_capture_id_research_captures_id_fk" FOREIGN KEY ("capture_id") REFERENCES "public"."research_captures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_captures" ADD CONSTRAINT "research_captures_extension_device_id_extension_devices_id_fk" FOREIGN KEY ("extension_device_id") REFERENCES "public"."extension_devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_captures" ADD CONSTRAINT "research_captures_saved_document_id_documents_id_fk" FOREIGN KEY ("saved_document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retrieval_evidence" ADD CONSTRAINT "retrieval_evidence_retrieval_run_id_retrieval_runs_id_fk" FOREIGN KEY ("retrieval_run_id") REFERENCES "public"."retrieval_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "action_audit_request_id_idx" ON "action_audit_events" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "action_audit_action_idx" ON "action_audit_events" USING btree ("action");--> statement-breakpoint
CREATE INDEX "action_audit_created_at_idx" ON "action_audit_events" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "chunks_document_chunk_unique" ON "chunks" USING btree ("document_id","chunk_index");--> statement-breakpoint
CREATE INDEX "chunks_document_id_idx" ON "chunks" USING btree ("document_id");--> statement-breakpoint
CREATE UNIQUE INDEX "documents_path_unique" ON "documents" USING btree ("path");--> statement-breakpoint
CREATE INDEX "documents_content_hash_idx" ON "documents" USING btree ("content_hash");--> statement-breakpoint
CREATE INDEX "documents_updated_at_idx" ON "documents" USING btree ("updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "extension_devices_token_hash_unique" ON "extension_devices" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "extension_pairing_codes_hash_unique" ON "extension_pairing_codes" USING btree ("code_hash");--> statement-breakpoint
CREATE INDEX "extension_pairing_codes_expires_at_idx" ON "extension_pairing_codes" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "ingestion_runs_document_path_idx" ON "ingestion_runs" USING btree ("document_path");--> statement-breakpoint
CREATE INDEX "ingestion_runs_content_hash_idx" ON "ingestion_runs" USING btree ("content_hash");--> statement-breakpoint
CREATE INDEX "ingestion_runs_created_at_idx" ON "ingestion_runs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "links_source_document_id_idx" ON "links" USING btree ("source_document_id");--> statement-breakpoint
CREATE INDEX "links_target_document_id_idx" ON "links" USING btree ("target_document_id");--> statement-breakpoint
CREATE UNIQUE INDEX "links_source_target_unique" ON "links" USING btree ("source_document_id","target_label");--> statement-breakpoint
CREATE INDEX "research_capture_activities_capture_created_at_idx" ON "research_capture_activities" USING btree ("capture_id","created_at");--> statement-breakpoint
CREATE INDEX "research_captures_status_captured_at_idx" ON "research_captures" USING btree ("status","captured_at");--> statement-breakpoint
CREATE INDEX "research_captures_extension_device_id_idx" ON "research_captures" USING btree ("extension_device_id");--> statement-breakpoint
CREATE INDEX "retrieval_evidence_run_retrieval_rank_idx" ON "retrieval_evidence" USING btree ("retrieval_run_id","retrieval_rank");--> statement-breakpoint
CREATE INDEX "retrieval_evidence_run_selection_rank_idx" ON "retrieval_evidence" USING btree ("retrieval_run_id","selection_rank");--> statement-breakpoint
CREATE INDEX "retrieval_runs_status_created_at_idx" ON "retrieval_runs" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "retrieval_runs_operation_created_at_idx" ON "retrieval_runs" USING btree ("operation","created_at");