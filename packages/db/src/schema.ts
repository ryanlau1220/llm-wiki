import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
  doublePrecision,
  vector
} from "drizzle-orm/pg-core";

export const EMBEDDING_DIMENSIONS = 768;

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  password_hash: text("password_hash").notNull(),
  role: varchar("role", { length: 20 }).notNull().default("user"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    path: varchar("path", { length: 400 }).notNull(),
    title: varchar("title", { length: 150 }).notNull(),
    type: varchar("type", { length: 40 }).notNull(),
    content: text("content").notNull(),
    content_hash: varchar("content_hash", { length: 128 }).notNull(),
    version: integer("version").notNull().default(1),
    source_kind: varchar("source_kind", { length: 40 }).notNull(),
    is_ai_generated: boolean("is_ai_generated").notNull().default(false),
    quality_score: doublePrecision("quality_score"),
    quality_metrics: jsonb("quality_metrics"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    pathUnique: uniqueIndex("documents_path_unique").on(table.path),
    hashIdx: index("documents_content_hash_idx").on(table.content_hash),
    updatedAtIdx: index("documents_updated_at_idx").on(table.updated_at)
  })
);

export const chunks = pgTable(
  "chunks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    document_id: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    chunk_index: integer("chunk_index").notNull(),
    text: text("text").notNull(),
    embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }).notNull(),
    embedding_model: varchar("embedding_model", { length: 100 }).notNull(),
    embedding_version: varchar("embedding_version", { length: 40 }).notNull(),
    source_start_offset: integer("source_start_offset").notNull(),
    source_end_offset: integer("source_end_offset").notNull(),
    token_count: integer("token_count"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    documentChunkUnique: uniqueIndex("chunks_document_chunk_unique").on(table.document_id, table.chunk_index),
    documentIdx: index("chunks_document_id_idx").on(table.document_id)
  })
);

export const links = pgTable(
  "links",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    source_document_id: uuid("source_document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    source_path: varchar("source_path", { length: 400 }).notNull(),
    target_label: varchar("target_label", { length: 200 }).notNull(),
    target_document_id: uuid("target_document_id").references(() => documents.id, {
      onDelete: "set null"
    }),
    is_resolved: boolean("is_resolved").notNull().default(false),
    confidence: integer("confidence"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    sourceIdx: index("links_source_document_id_idx").on(table.source_document_id),
    targetIdx: index("links_target_document_id_idx").on(table.target_document_id),
    sourceTargetUnique: uniqueIndex("links_source_target_unique").on(
      table.source_document_id,
      table.target_label
    )
  })
);

export const actionAuditEvents = pgTable(
  "action_audit_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    request_id: varchar("request_id", { length: 128 }).notNull(),
    action: varchar("action", { length: 40 }).notNull(),
    validation_result: varchar("validation_result", { length: 20 }).notNull(),
    rejection_reason: text("rejection_reason"),
    actor: varchar("actor", { length: 20 }).notNull(),
    metadata: jsonb("metadata").notNull().default({}),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    requestIdIdx: index("action_audit_request_id_idx").on(table.request_id),
    actionIdx: index("action_audit_action_idx").on(table.action),
    createdAtIdx: index("action_audit_created_at_idx").on(table.created_at)
  })
);

export const ingestionRuns = pgTable(
  "ingestion_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    document_path: varchar("document_path", { length: 400 }).notNull(),
    file_size_bytes: bigint("file_size_bytes", { mode: "number" }).notNull(),
    content_hash: varchar("content_hash", { length: 128 }).notNull(),
    status: varchar("status", { length: 20 }).notNull(),
    error_message: text("error_message"),
    duration_ms: integer("duration_ms"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    pathIdx: index("ingestion_runs_document_path_idx").on(table.document_path),
    hashIdx: index("ingestion_runs_content_hash_idx").on(table.content_hash),
    createdAtIdx: index("ingestion_runs_created_at_idx").on(table.created_at)
  })
);
