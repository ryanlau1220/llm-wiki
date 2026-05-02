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
- [x] Implement embedding pipeline (provider abstraction, Gemini first).
	- [x] Provider abstraction + Gemini adapter implemented in packages/ai.
	- [x] Gemini Enterprise Agent Platform (GCP ADC/service account) adapter implemented.
	- [x] Pipeline integration implemented (ingestion -> embed -> persist chunks).
	- [x] Wire watcher events to ingestion pipeline.
- [x] Implement hybrid retrieval (vector + FTS + link expansion).
- [x] Implement Ask Knowledge flow with preview-before-save.
- [x] Implement write-back engine that always creates new files in ai-generated/.

## Priority 3 - Refactor and Link Intelligence
- [x] Implement note refactor workflow with source trace in metadata.
- [x] Implement link validation and missing-note suggestions.
- [x] Add safe placeholder generation rules (optional mode only).
- [x] Implement Discovery Engine (Vertex AI Search) provider for managed RAG.

## Priority 4 - Ops and Reliability
- [x] Add structured logging across watcher, ingestion, retrieval, and write-back.
- [x] Add health checks and basic observability dashboard/log queries.
- [x] Add backup/restore guidance for local DB and vault.
- [x] Add failure recovery runbook (stuck queue, bad embeddings, parse failures).

## Priority 5 - Test Strategy
- [x] Unit tests for parser, chunker, link extractor, intent validator.
- [x] Integration tests for ingest -> embed -> retrieve flow.
- [x] End-to-end tests for Ask & Save preview/confirm/save behavior (Mocks).
- [x] Golden dataset for quality/regression checks.
 
## Priority 6 - Frontend Development (TanStack Start)
- [x] Implement oRPC bridge for type-safe API access.
- [x] Build global layout with navigation sidebar.
- [x] Build "Ask Knowledge" tool with preview/save flow.
- [x] Build "Note Refactor" tool with diff preview.
- [x] Build "Link Health" dashboard for broken link management.
- [x] Build Dashboard for ingestion stats and system health.

## Open Decisions
- [ ] Local-only embedding option for strict local-first users.
- [x] Slug collision policy for generated files.
- [x] Duplicate note detection method (exact + semantic implemented).
- [x] Semantic duplicate threshold/candidate limit configurable.
- [ ] Knowledge quality scoring rubric.

## Current Focus
- [x] Finalize Priority 0 items before implementing full MVP features.
- [x] Complete Frontend Knowledge Dashboard with TanStack Start.
- [x] Harden Monorepo Environment Strategy (Unified .env + Symlinks + CORS).

## Next Focus
- [/] Implement Knowledge quality scoring rubric (Foundation complete, AI scoring pending).
- [x] Add Local-only embedding option (Ollama + Llama 4 upgrade complete).
- [/] Add User Authentication / Session management.
