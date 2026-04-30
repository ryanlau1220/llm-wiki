# LLM Wiki Development TODO

## Ground Rules
- Do not edit PLAN.md directly (generated source of architecture).
- Use this TODO for execution planning and change tracking.
- Use NOTES.md for implementation learnings, decisions, and context.

## Priority 0 - Plan Hardening (before heavy coding)
- [x] Define measurable success metrics for MVP:
	- retrieval quality (precision@k / hit rate)
	- answer quality (human rating rubric)
	- note acceptance rate (preview -> saved)
	- latency target for Ask flow
- [x] Define evaluation workflow and regression checks.
- [x] Define strict JSON action contracts for all AI intents:
	- create_note
	- refactor_note
	- suggest_links
	- search
- [x] Add validation and safety constraints per action (required fields, limits, sanitization).

## Priority 1 - Data and Pipeline Foundations
- [x] Expand DB schema beyond baseline docs/chunks/links:
	- document versioning
	- chunk provenance (source offsets)
	- embedding model/version tracking
	- created_at / updated_at timestamps
	- write-back audit trail
- [x] Define ingestion idempotency strategy (hash/version-based upsert).
- [x] Define watcher resilience (retry policy, queue behavior, error handling).
- [x] Define full reindex command and migration path.

## Priority 2 - MVP Features (Phase 1 + Phase 2)
- [x] Implement vault watcher for human/ only, ignore ai-generated/.
- [x] Implement markdown parser + link extraction + YAML extraction + chunking.
- [ ] Implement embedding pipeline (provider abstraction, Gemini first).
	- [x] Provider abstraction + Gemini adapter implemented in packages/ai.
	- [x] Gemini Enterprise Agent Platform (GCP ADC/service account) adapter implemented.
	- [x] Pipeline integration implemented (ingestion -> embed -> persist chunks).
	- [x] Wire watcher events to ingestion pipeline.
- [ ] Implement hybrid retrieval (vector + FTS + link expansion).
- [x] Implement hybrid retrieval (vector + FTS + link expansion).
- [ ] Implement Ask Knowledge flow with preview-before-save.
- [ ] Implement write-back engine that always creates new files in ai-generated/.

## Priority 3 - Refactor and Link Intelligence
- [ ] Implement note refactor workflow with source trace in metadata.
- [ ] Implement link validation and missing-note suggestions.
- [ ] Add safe placeholder generation rules (optional mode only).

## Priority 4 - Ops and Reliability
- [ ] Add structured logging across watcher, ingestion, retrieval, and write-back.
- [ ] Add health checks and basic observability dashboard/log queries.
- [ ] Add backup/restore guidance for local DB and vault.
- [ ] Add failure recovery runbook (stuck queue, bad embeddings, parse failures).

## Priority 5 - Test Strategy
- [ ] Unit tests for parser, chunker, link extractor, intent validator.
- [ ] Integration tests for ingest -> embed -> retrieve flow.
- [ ] End-to-end tests for Ask & Save preview/confirm/save behavior.
- [ ] Golden dataset for quality/regression checks.

## Open Decisions
- [ ] Local-only embedding option for strict local-first users.
- [ ] Slug collision policy for generated files.
- [ ] Duplicate note detection method (exact, semantic, hybrid).
- [ ] Knowledge quality scoring rubric.

## Current Focus
- [x] Finalize Priority 0 items before implementing full MVP features.

## Next Focus
- [x] Bootstrap project skeleton (Turborepo apps/packages layout) and baseline configs.
- [x] Start Priority 1: DB schema expansion + ingestion idempotency design.
- [x] Start Priority 2 implementation: watcher module + markdown parser + link extraction.
- [ ] Implement API routes for Ask preview and write-back approval flow.
	- [x] Ask preview route (/ask/preview)
	- [x] Ask confirm route (/ask/confirm)
- [x] Implement embedding provider interface and first Gemini adapter.
- [x] Integrate embeddings into ingestion flow and persist vectors to DB chunks table.
- [x] Wire ingestion pipeline to API entrypoint (watcher start).
- [x] Add delete handling for unlink events.
- [x] Add manual reindex endpoint for a single file path.
