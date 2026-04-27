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