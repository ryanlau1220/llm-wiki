ALTER TABLE "chunks" ADD COLUMN "search_vector" tsvector GENERATED ALWAYS AS (to_tsvector('simple', text)) STORED NOT NULL;
--> statement-breakpoint
CREATE INDEX "chunks_search_vector_idx" ON "chunks" USING gin ("search_vector");
