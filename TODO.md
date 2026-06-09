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
- [x] Create project management CLI (manage.sh implementation complete).
- [x] Build Dashboard for ingestion stats and system health.

## Open Decisions
- [x] Local-only embedding option for strict local-first users.
- [x] Slug collision policy for generated files.
- [x] Duplicate note detection method (exact + semantic implemented).
- [x] Semantic duplicate threshold/candidate limit configurable.
- [x] Knowledge quality scoring rubric (coherence implemented; weights finalized).

## Current Focus
- [x] Finalize Priority 0 items before implementing full MVP features.
- [x] Complete Frontend Knowledge Dashboard with TanStack Start.
- [x] Harden Monorepo Environment Strategy (Unified .env + Symlinks + CORS).
- [x] GCP-first hardening:
	- [x] GEAP (ADC) providers exist for embeddings + LLM.
	- [x] Configurable GEAP model ids via env (`GEMINI_GCP_LLM_MODEL`, `GEMINI_GCP_EMBEDDING_MODEL`).
	- [x] Add a small “verify GCP setup” CLI step (ADC, project, region, model sanity check).

## Next Focus
- [x] Implement Knowledge quality scoring rubric (AI scoring integrated into ingestion).
- [x] Add Local-only embedding option (Ollama + Llama 4 upgrade complete).
- [x] Add User Authentication / Session management.

## Plan Drift Fixes (From PLAN.md)
- [x] Add `infra/docker/docker-compose.yml` for local Postgres (+ pgvector) to match PLAN.md local-first infra.
- [x] Migrate embeddings storage to pgvector (schema + retrieval now uses SQL cosine distance).
- [x] Implement Multi-note Synthesis tool (API + UI) per PLAN.md Phase 5.
- [x] Expand Knowledge Maintenance system (weak-note detection + AI improvement suggestions) per PLAN.md Phase 6.

## Priority 7 - Stability & Hardening
- [x] Run Project Check Suite
- [x] Type check api and all packages
- [x] Stabilize monorepo linting via Biome
- [x] Fix and pass unit tests (mock LLM dependencies)
- [x] Resolve Drizzle integration tests (Docker Compose config)
- [x] Implement UI Logout and Synthesis feedback.
- [x] Harden AI Refactor & Synthesis JSON parsing with regex fallbacks.
- [x] Fix oRPC Hook Mismatch (TanStack Query usage pattern).
- [x] Implement Hybrid Authentication Fallback (Cookies + Bearer Token).
- [x] Fix Router Redirection and 404 handling after login.
- [x] Fix Vault Health Check (Portable Root Resolution).
- [x] Implement Responsive Sidebar Layout (CSS Variables).
- [x] Improve Navigation Contrast and Accessibility (Semantic Colors + Indicators).

## Priority 8 - UI Polish & Explorer Implementation
- [x] Integrate brand variables in Tailwind v4 `@theme` block
- [x] Fix login button contrast on Login page and primary form action buttons
- [x] Fix logout/login redirect state loop via Query Cache reset
- [x] Make "New Note" navigate to Ask page
- [x] Resolve 404 for Wiki Pages `/vault` route with an interactive file explorer
- [x] Hook up detail actions (Reindex note & Refactor pre-selection)
- [x] Fix ask preview note key mismatch causing components to crash on render
- [x] Add dynamic lagoon-text brand styling variables to prevent low contrast green buttons
- [x] Limit ThemeToggle to light/dark modes and position it globally in the top right

## Priority 9 - Ingestion Hardening & Clock Removal
- [x] Remove clock/time pill from top-right of Dashboard
- [x] Implement startup sync for pre-existing vault files
- [x] Ingest AI-generated notes to database on confirmation/save
- [x] Implement real-time SSE listener loop for UI updates

## Priority 10 - Streamlined Sidebar Categories & Theme Toggle
- [x] Move ThemeToggle component to bottom of the Sidebar
- [x] Implement categorized sidebar sections (KNOWLEDGE vs. AI ASSISTANT)
- [x] Unify AI Generator interface (Ask RAG, Ask AI Web Search, Synthesize Topic) into a single chatbot page with mode dropdown selector
- [x] Resolve ThemeToggle overlap by removing absolute positioning on header

## Priority 11 - Dark Mode Styles & Env Template Update
- [x] Style select option elements to ensure readability in dark mode
- [x] Update note card backgrounds in note refactor, wiki pages, and dashboard to use theme-aware background surfaces
- [x] Fix active sub-tab styling in refactor to prevent light-text-on-light-bg contrast issue
- [x] Add Tavily API Key placeholder to env.example template




