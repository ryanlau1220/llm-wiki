CREATE TABLE "extension_pairing_codes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "code_hash" varchar(128) NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "consumed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "extension_pairing_codes_hash_unique" ON "extension_pairing_codes" USING btree ("code_hash");
--> statement-breakpoint
CREATE INDEX "extension_pairing_codes_expires_at_idx" ON "extension_pairing_codes" USING btree ("expires_at");
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
CREATE UNIQUE INDEX "extension_devices_token_hash_unique" ON "extension_devices" USING btree ("token_hash");
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
  "saved_document_id" uuid,
  "saved_path" varchar(400),
  "captured_at" timestamp with time zone NOT NULL,
  "reviewed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "research_captures" ADD CONSTRAINT "research_captures_extension_device_id_extension_devices_id_fk" FOREIGN KEY ("extension_device_id") REFERENCES "public"."extension_devices"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "research_captures" ADD CONSTRAINT "research_captures_saved_document_id_documents_id_fk" FOREIGN KEY ("saved_document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "research_captures_status_captured_at_idx" ON "research_captures" USING btree ("status", "captured_at");
--> statement-breakpoint
CREATE INDEX "research_captures_extension_device_id_idx" ON "research_captures" USING btree ("extension_device_id");
