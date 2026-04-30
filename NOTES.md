This file is to record all the notes, thoughts, and ideas that come up during the development of the LLM Wiki project. It’s a free-form space for brainstorming, jotting down insights, and capturing any relevant information that doesn’t fit into the structured plan. Avoid removing anything here, as it may contain valuable context for future reference.

---

## Implementation Notes

### 2026-04-27
- Operating agreement:
	- PLAN.md is read-only in practice for day-to-day implementation work.
	- TODO.md is the execution and plan-adjustment surface.
	- NOTES.md captures context, insights, and decisions.
- Architectural strengths observed:
	- strong safety posture (intent-only actions + backend validation)
	- clear human vs AI note boundary
	- preview-before-save UX guardrail
- Risks identified before implementation:
	- missing measurable quality metrics
	- schema may be too thin without provenance/versioning
	- no explicit evaluation/regression workflow yet
	- local-first expectation may conflict with cloud embeddings for some users
- Immediate execution policy:
	- harden metrics + evaluation + action contracts first
	- then build Phase 1 and 2 MVP with tests and logging from start

### 2026-04-27 - Priority 0 Completed
- Completed artifacts:
	- docs/metrics/mvp-success-metrics.md
	- docs/evaluation/eval-workflow.md
	- schemas/ai-actions.schema.json
	- docs/safety/action-validation-rules.md
- Key decisions recorded:
	- use hard release gates for MVP (retrieval, quality, latency, safety)
	- enforce strict action envelope with action-specific payload schemas
	- require backend semantic validation after schema validation
	- keep write path restricted to ai-generated only
- Why this order:
	- prevents unsafe or unmeasurable implementation drift
	- creates a baseline for regression checks before feature buildout
- Next implementation direction:
	- bootstrap project skeleton and baseline tooling
	- expand DB schema with provenance/versioning/audit fields

### 2026-04-27 - Scaffold + Priority 1 Foundations
- Monorepo bootstrap completed:
	- root configs: package.json, turbo.json, tsconfig.base.json, .gitignore
	- apps/api skeleton using Elysia with health endpoint
	- package placeholders for web/core/ai/obsidian/db/types
- Action typing baseline completed:
	- created zod schemas in packages/types/src/ai-actions.ts aligned to action schema contract
- Database foundation completed:
	- added packages/db/src/schema.ts with tables:
		- documents (hash + version + timestamps)
		- chunks (provenance offsets + embedding model/version)
		- links (resolved status + target mapping)
		- action_audit_events (validation/audit trail)
		- ingestion_runs (pipeline run history)
- Reliability design docs completed:
	- docs/ingestion/idempotency-strategy.md
	- docs/ingestion/watcher-resilience.md
	- docs/ops/reindex-and-migrations.md
- Important decisions:
	- idempotency is path + normalized content hash driven
	- ingestion updates are transactional and replace derived artifacts atomically
	- retries are bounded with dead-letter handling for poison events
	- reindex is required after chunking/embedding/link logic changes

### 2026-04-27 - Priority 2 (Watcher + Parser)
- Implemented package: packages/obsidian
	- src/watcher.ts
	- src/parser.ts
	- src/types.ts
	- src/index.ts
- Implemented watcher behavior:
	- observes configured root path
	- ignores ai-generated path by default
	- debounces by file path
	- emits add/change/unlink events with timestamps
- Implemented parser behavior:
	- YAML/frontmatter parsing via gray-matter
	- wikilink extraction supporting alias and heading suffix formats
	- deterministic chunking with overlap validation
- Decision notes:
	- keep parser pure and side-effect free for testability
	- keep watcher as infrastructure adapter with callback contract
	- reserve ingestion orchestration and DB writes for next layer (core package)

### 2026-04-27 - External Platform Naming Update (User FYI)
- Source update captured from user:
	- As of 2026-04-23, Vertex AI is part of Gemini Enterprise Agent Platform.
	- Announcement context: Google Cloud Next (2026-04-22) communicated transition of Vertex AI Platform into Gemini Enterprise suite.
	- User-provided references:
		- https://cloud.google.com/blog/products/ai-machine-learning/introducing-gemini-enterprise-agent-platform
		- https://docs.cloud.google.com/gemini-enterprise-agent-platform
- Data Analytics product naming updates captured:
	- Dataplex Universal Catalog -> Knowledge Catalog
	- BigLake -> Lakehouse
	- Dataproc -> Managed Service for Apache Spark
	- Composer -> Managed Service for Apache Airflow
	- Looker Studio -> Data Studio
- Impact notes for this repo:
	- avoid introducing new references to legacy Vertex AI naming in new docs/code comments unless required for compatibility notes
	- when implementation reaches cloud model adapters, use current Gemini Enterprise Agent Platform terminology in user-facing docs
	- if external SDK/API artifacts still use legacy names, preserve technical identifiers in code but document the product rename in docs for clarity
- Stability note from user context:
	- projects/configuration/pricing are expected to remain unchanged during naming transition; console/docs/SKU display text may update over time

### 2026-04-27 - Embedding Provider Abstraction + Gemini Adapter
- Implemented AI package scaffolding:
	- packages/ai/package.json
	- packages/ai/tsconfig.json
	- packages/ai/src/index.ts
- Implemented abstraction layer:
	- packages/ai/src/embedding/types.ts
	- packages/ai/src/embedding/factory.ts
- Implemented first provider adapter:
	- packages/ai/src/embedding/providers/gemini.ts
	- provider class: GeminiEmbeddingProvider
	- supports config via env and constructor overrides (api key, model, timeout, base url)
	- validates response shape with zod before returning vectors
- Dependency and compatibility decision:
	- intentionally avoided legacy Vertex-specific SDK naming in new code paths
	- used direct Gemini embedding API call pattern to keep adapter decoupled from SDK rename churn
	- user-facing provider naming aligns with Gemini Enterprise Agent Platform terminology
- Validation outcome:
	- workspace dependency install completed and diagnostics report no current editor errors
- Remaining work to complete full embedding pipeline:
	- wire provider into ingestion orchestration
	- persist vectors + model/version metadata into chunks table
	- add integration tests for embed path and failure handling

### 2026-04-27 - Documentation Policy Correction
- User rule (must follow): during development, only NOTES.md and TODO.md may be used for documentation notes/plans unless explicit approval is given.
- Action taken immediately:
	- removed all additional README.md and docs/*.md files created earlier.
	- retained only PLAN.md, TODO.md, and NOTES.md as markdown files in repo.
- Prevention:
	- future design/decision/progress writeups must be appended to NOTES.md and/or TODO.md only.

### 2026-04-27 - Embedding Auth Clarification
- Current implementation status:
	- Gemini embedding adapter currently uses `GEMINI_API_KEY` and direct Gemini API endpoint.
- User question answer captured:
	- yes, if switching to Gemini models through Vertex AI / Gemini Enterprise Agent Platform on GCP, service account auth (ADC / IAM) is the standard approach instead of API key.
- Practical direction:
	- keep current API-key adapter for fast local bring-up.
	- add a second adapter path for service-account based GCP auth when integrating production pipeline.

### 2026-04-27 - GCP Gemini Enterprise Migration Setup
- User requested migration path:
	- move to Gemini Enterprise Agent Platform on GCP
	- provision new project + service account + required services via CLI
- Billing account used:
	- My Billing Account (0191DB-348064-FA18F1)
	- includes user-indicated Google Developer Program premium monthly credit context
- Resources provisioned:
	- project_id: llm-wiki-geap-20260427-e3ed
	- service_account: llm-wiki-embedder@llm-wiki-geap-20260427-e3ed.iam.gserviceaccount.com
- Services enabled on project:
	- aiplatform.googleapis.com
	- iam.googleapis.com
	- iamcredentials.googleapis.com
	- serviceusage.googleapis.com
	- cloudresourcemanager.googleapis.com
- Service account IAM roles granted:
	- roles/aiplatform.user
	- roles/serviceusage.serviceUsageConsumer
	- roles/logging.logWriter
- ADC/Quota setup:
	- application-default credentials quota project set to llm-wiki-geap-20260427-e3ed

### 2026-04-27 - Code Migration for Gemini Enterprise (GCP ADC)
- Added new provider:
	- packages/ai/src/embedding/providers/gemini-geap.ts
	- auth via GoogleAuth (ADC/service account), no API key required for this path
	- uses Vertex/GEAP predict endpoint for publisher model embeddings
- Factory migration:
	- packages/ai/src/embedding/factory.ts now supports:
		- gemini-geap (default)
		- gemini (API key fallback)
- Naming correction:
	- API-key provider name changed to gemini-api-key to avoid ambiguity
	- Gemini Enterprise naming reserved for ADC/GCP provider path
- Dependency update:
	- added google-auth-library to packages/ai/package.json
- Remaining integration work:
	- wire provider selection/config through runtime bootstrap
	- connect ingestion pipeline to call provider and persist vectors

### 2026-04-30 - Ingestion Pipeline Integration (Core)
- Added DB client entrypoint:
	- packages/db/src/client.ts
	- packages/db/src/index.ts
- Implemented ingestion orchestration:
	- packages/core/src/ingestion/ingest.ts
	- packages/core/src/ingestion/types.ts
	- packages/core/src/ingestion/utils.ts
- Ingestion behavior highlights:
	- normalize content, hash, and idempotent upsert
	- embed chunks using configured provider
	- persist chunk vectors + model/version metadata
	- record ingestion_runs status and duration
- Updated parser to provide offsets:
	- added chunkMarkdownWithOffsets in packages/obsidian/src/parser.ts
- Runtime config wiring:
	- apps/api/src/config.ts + logging in apps/api/src/index.ts
	- reads EMBEDDING_PROVIDER, GOOGLE_CLOUD_PROJECT, GEMINI_GCP_LOCATION, DATABASE_URL
- Remaining wiring:
	- connect watcher events to ingestion function
	- add API/worker entrypoint to invoke ingestion

### 2026-04-30 - Watcher -> Ingestion Wiring (API)
- API bootstrap now starts ingestion watcher:
	- apps/api/src/watcher.ts
	- apps/api/src/index.ts
- Config additions:
	- VAULT_PATH (default ./vault/human)
	- WATCHER_DEBOUNCE_MS (default 5000)
	- EMBEDDING_VERSION (default v1)
- Behavior notes:
	- add/change events read file content and ingest to DB
	- unlink events delete documents, chunks, and links for removed files
	- vault path recorded as human/<relative-path> for DB consistency

### 2026-04-30 - Delete Handling for Unlink Events
- Added delete path in core ingestion:
	- deleteDocumentByPath in packages/core/src/ingestion/ingest.ts
- Watcher now calls delete handler on unlink events:
	- apps/api/src/watcher.ts
- Delete behavior:
	- removes chunks and links then deletes the document record
	- no-op if document is missing

### 2026-04-30 - Manual Reindex Endpoint
- Added single-file reindex helper:
	- apps/api/src/reindex.ts
- Added API endpoint:
	- POST /reindex (body: { path })
	- reindexes a single file under vault root
- Safety notes:
	- validates path resolves within vault root
	- returns ingestion status (created/updated/skipped/failed)

### 2026-04-30 - Hybrid Retrieval Scaffolding
- Added retrieval module in core:
	- packages/core/src/retrieval/hybrid.ts
	- packages/core/src/retrieval/types.ts
	- packages/core/src/retrieval/utils.ts
- Retrieval behavior:
	- embeds query and scores vector candidates with cosine similarity
	- adds FTS-style matches via ILIKE on chunk text
	- merges vector + FTS scores and expands links for top documents
- Notes:
	- vector candidate selection is currently time-ordered and capped
	- future improvement: dedicated pgvector index + native FTS index for better recall

### 2026-04-30 - Ask Preview API
- Added Ask preview helper:
	- apps/api/src/ask.ts
- Added endpoint:
	- POST /ask/preview (body: { query, topK? })
	- returns hybrid retrieval chunks + links
- Notes:
	- uses same embedding provider config as ingestion
	- requires DATABASE_URL for DB access