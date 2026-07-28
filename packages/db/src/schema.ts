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
  vector,
  customType
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  }
});

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
    ai_status: varchar("ai_status", { length: 20 }),
    health_score: doublePrecision("health_score"),
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
    search_vector: tsvector("search_vector")
      .generatedAlwaysAs(sql`to_tsvector('simple', text)`)
      .notNull(),
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

export const settings = pgTable("settings", {
  key: varchar("key", { length: 100 }).primaryKey(),
  value: text("value").notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

/**
 * Short-lived one-time codes created by an authenticated dashboard session.
 * The browser extension exchanges one for a device token; only the hash is
 * persisted so a database export cannot be used to impersonate an extension.
 */
export const extensionPairingCodes = pgTable(
  "extension_pairing_codes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code_hash: varchar("code_hash", { length: 128 }).notNull(),
    expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumed_at: timestamp("consumed_at", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    codeHashUnique: uniqueIndex("extension_pairing_codes_hash_unique").on(table.code_hash),
    expiresAtIdx: index("extension_pairing_codes_expires_at_idx").on(table.expires_at)
  })
);

/** A locally-paired desktop browser extension. */
export const extensionDevices = pgTable(
  "extension_devices",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 120 }).notNull(),
    token_hash: varchar("token_hash", { length: 128 }).notNull(),
    last_used_at: timestamp("last_used_at", { withTimezone: true }),
    revoked_at: timestamp("revoked_at", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    tokenHashUnique: uniqueIndex("extension_devices_token_hash_unique").on(table.token_hash)
  })
);

/**
 * Raw research capture awaiting a deliberate review decision. Approved content
 * is written to the vault; the inbox remains an operational queue, not a
 * second source of truth.
 */
export const researchCaptures = pgTable(
  "research_captures",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    extension_device_id: uuid("extension_device_id").references(() => extensionDevices.id, {
      onDelete: "set null"
    }),
    source_url: text("source_url").notNull(),
    source_title: varchar("source_title", { length: 500 }).notNull(),
    query: text("query"),
    content: text("content").notNull(),
    sources: jsonb("sources").notNull().default([]),
    status: varchar("status", { length: 20 }).notNull().default("inbox"),
    review_note: text("review_note"),
    index_error: text("index_error"),
    saved_document_id: uuid("saved_document_id").references(() => documents.id, {
      onDelete: "set null"
    }),
    saved_path: varchar("saved_path", { length: 400 }),
    captured_at: timestamp("captured_at", { withTimezone: true }).notNull(),
    reviewed_at: timestamp("reviewed_at", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    statusCapturedAtIdx: index("research_captures_status_captured_at_idx").on(
      table.status,
      table.captured_at
    ),
    deviceIdx: index("research_captures_extension_device_id_idx").on(table.extension_device_id)
  })
);

export const researchCaptureActivities = pgTable(
  "research_capture_activities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    capture_id: uuid("capture_id").notNull().references(() => researchCaptures.id, { onDelete: "cascade" }),
    event_type: varchar("event_type", { length: 40 }).notNull(),
    detail: jsonb("detail").notNull().default({}),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    captureCreatedAtIdx: index("research_capture_activities_capture_created_at_idx").on(table.capture_id, table.created_at),
  }),
);

/**
 * Bounded, local-first observability for retrieval-backed AI requests. Raw
 * queries, prompts, and assembled context are intentionally not persisted.
 */
export const retrievalRuns = pgTable(
  "retrieval_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    operation: varchar("operation", { length: 40 }).notNull(),
    trace_version: integer("trace_version").notNull().default(1),
    query_hash: varchar("query_hash", { length: 64 }).notNull(),
    query_length: integer("query_length").notNull(),
    policy: varchar("policy", { length: 40 }).notNull(),
    policy_reason: varchar("policy_reason", { length: 120 }).notNull(),
    status: varchar("status", { length: 20 }).notNull(),
    candidate_count: integer("candidate_count").notNull().default(0),
    selected_evidence_count: integer("selected_evidence_count").notNull().default(0),
    context_character_count: integer("context_character_count").notNull().default(0),
    model_provider: varchar("model_provider", { length: 80 }),
    model_name: varchar("model_name", { length: 160 }),
    prompt_version: varchar("prompt_version", { length: 40 }).notNull(),
    duration_ms: integer("duration_ms"),
    error_code: varchar("error_code", { length: 80 }),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completed_at: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => ({
    statusCreatedAtIdx: index("retrieval_runs_status_created_at_idx").on(table.status, table.created_at),
    operationCreatedAtIdx: index("retrieval_runs_operation_created_at_idx").on(table.operation, table.created_at),
  }),
);

/**
 * Versioned, structural execution spans for an AI generator run. Spans contain
 * decisions and bounded counters only: never prompts, query text, assembled
 * context, model output, or hidden reasoning.
 */
export const aiTraceSpans = pgTable(
  "ai_trace_spans",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    retrieval_run_id: uuid("retrieval_run_id")
      .notNull()
      .references(() => retrievalRuns.id, { onDelete: "cascade" }),
    parent_span_id: uuid("parent_span_id"),
    span_type: varchar("span_type", { length: 40 }).notNull(),
    status: varchar("status", { length: 20 }).notNull(),
    attributes: jsonb("attributes").notNull().default({}),
    error_code: varchar("error_code", { length: 80 }),
    started_at: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completed_at: timestamp("completed_at", { withTimezone: true }),
    duration_ms: integer("duration_ms"),
  },
  (table) => ({
    runStartedAtIdx: index("ai_trace_spans_run_started_at_idx").on(table.retrieval_run_id, table.started_at),
    parentIdx: index("ai_trace_spans_parent_span_id_idx").on(table.parent_span_id),
  }),
);

/**
 * Candidate and selected evidence references for a retrieval run. Content is
 * represented by its hash and stable vault location, never duplicated here.
 */
export const retrievalEvidence = pgTable(
  "retrieval_evidence",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    retrieval_run_id: uuid("retrieval_run_id")
      .notNull()
      .references(() => retrievalRuns.id, { onDelete: "cascade" }),
    document_id: uuid("document_id").notNull(),
    document_path: varchar("document_path", { length: 400 }).notNull(),
    chunk_index: integer("chunk_index").notNull(),
    content_hash: varchar("content_hash", { length: 64 }).notNull(),
    source: varchar("source", { length: 20 }).notNull(),
    score: doublePrecision("score").notNull(),
    retrieval_rank: integer("retrieval_rank").notNull(),
    selection_rank: integer("selection_rank"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    runRetrievalRankIdx: index("retrieval_evidence_run_retrieval_rank_idx").on(
      table.retrieval_run_id,
      table.retrieval_rank,
    ),
    runSelectionRankIdx: index("retrieval_evidence_run_selection_rank_idx").on(
      table.retrieval_run_id,
      table.selection_rank,
    ),
  }),
);
