ALTER TABLE "research_automation_runs" ADD COLUMN "source_total" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "research_automation_runs" ADD COLUMN "source_completed" integer DEFAULT 0 NOT NULL;
