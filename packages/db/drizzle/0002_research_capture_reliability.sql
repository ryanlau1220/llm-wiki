ALTER TABLE "research_captures" ADD COLUMN "index_error" text;
--> statement-breakpoint
CREATE TABLE "research_capture_activities" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "capture_id" uuid NOT NULL,
  "event_type" varchar(40) NOT NULL,
  "detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "research_capture_activities" ADD CONSTRAINT "research_capture_activities_capture_id_research_captures_id_fk" FOREIGN KEY ("capture_id") REFERENCES "public"."research_captures"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "research_capture_activities_capture_created_at_idx" ON "research_capture_activities" USING btree ("capture_id", "created_at");
