CREATE TABLE "ai_trace_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trace_id" uuid NOT NULL,
	"signal" varchar(32) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_trace_feedback" ADD CONSTRAINT "ai_trace_feedback_trace_id_retrieval_runs_id_fk" FOREIGN KEY ("trace_id") REFERENCES "public"."retrieval_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_trace_feedback_trace_signal_unique" ON "ai_trace_feedback" USING btree ("trace_id","signal");--> statement-breakpoint
CREATE INDEX "ai_trace_feedback_trace_created_at_idx" ON "ai_trace_feedback" USING btree ("trace_id","created_at");