CREATE TABLE "research_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(160) NOT NULL,
	"feed_url" text NOT NULL,
	"source_type" varchar(20) DEFAULT 'feed' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"etag" varchar(512),
	"last_modified" varchar(512),
	"last_fetched_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "research_automations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(160) NOT NULL,
	"kind" varchar(40) DEFAULT 'rss_radar' NOT NULL,
	"topic" text NOT NULL,
	"schedule_minutes" integer NOT NULL,
	"max_captures_per_run" integer DEFAULT 10 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_run_at" timestamp with time zone,
	"next_run_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "research_automation_sources" (
	"automation_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "research_automation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"automation_id" uuid NOT NULL,
	"status" varchar(20) NOT NULL,
	"trigger" varchar(20) NOT NULL,
	"discovered_count" integer DEFAULT 0 NOT NULL,
	"new_item_count" integer DEFAULT 0 NOT NULL,
	"capture_count" integer DEFAULT 0 NOT NULL,
	"skipped_count" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "research_source_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"external_id" varchar(1000) NOT NULL,
	"canonical_url" text NOT NULL,
	"content_hash" varchar(64) NOT NULL,
	"title" varchar(500) NOT NULL,
	"published_at" timestamp with time zone,
	"capture_id" uuid,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "research_automation_sources" ADD CONSTRAINT "research_automation_sources_automation_id_research_automations_id_fk" FOREIGN KEY ("automation_id") REFERENCES "public"."research_automations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "research_automation_sources" ADD CONSTRAINT "research_automation_sources_source_id_research_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."research_sources"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "research_automation_runs" ADD CONSTRAINT "research_automation_runs_automation_id_research_automations_id_fk" FOREIGN KEY ("automation_id") REFERENCES "public"."research_automations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "research_source_items" ADD CONSTRAINT "research_source_items_source_id_research_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."research_sources"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "research_captures" ADD COLUMN "automation_run_id" uuid;
--> statement-breakpoint
ALTER TABLE "research_captures" ADD CONSTRAINT "research_captures_automation_run_id_research_automation_runs_id_fk" FOREIGN KEY ("automation_run_id") REFERENCES "public"."research_automation_runs"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "research_source_items" ADD CONSTRAINT "research_source_items_capture_id_research_captures_id_fk" FOREIGN KEY ("capture_id") REFERENCES "public"."research_captures"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "research_sources_feed_url_unique" ON "research_sources" USING btree ("feed_url");
--> statement-breakpoint
CREATE INDEX "research_sources_active_idx" ON "research_sources" USING btree ("is_active");
--> statement-breakpoint
CREATE INDEX "research_automations_active_next_run_idx" ON "research_automations" USING btree ("is_active", "next_run_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "research_automation_sources_unique" ON "research_automation_sources" USING btree ("automation_id", "source_id");
--> statement-breakpoint
CREATE INDEX "research_automation_sources_source_idx" ON "research_automation_sources" USING btree ("source_id");
--> statement-breakpoint
CREATE INDEX "research_automation_runs_automation_started_idx" ON "research_automation_runs" USING btree ("automation_id", "started_at");
--> statement-breakpoint
CREATE INDEX "research_automation_runs_status_idx" ON "research_automation_runs" USING btree ("status");
--> statement-breakpoint
CREATE UNIQUE INDEX "research_source_items_source_external_unique" ON "research_source_items" USING btree ("source_id", "external_id");
--> statement-breakpoint
CREATE INDEX "research_source_items_source_canonical_idx" ON "research_source_items" USING btree ("source_id", "canonical_url");
--> statement-breakpoint
CREATE INDEX "research_captures_automation_run_id_idx" ON "research_captures" USING btree ("automation_run_id");
