# Reindex and Migration Strategy

## Full Reindex Command (Design)
Command intent:
- re-parse and re-embed all files under vault/human/
- rebuild chunks and links from source markdown

Expected command shape:
- bun run reindex --full
- bun run reindex --path human/topic.md

## Reindex Steps
1. Enumerate target files.
2. For each file, run ingestion pipeline with idempotency rules.
3. Record run status in ingestion_runs.
4. Produce summary report (updated, skipped, failed).

## Migration Policy
- Drizzle migrations are append-only.
- Never edit historical migration files once applied.
- Include rollback notes for each migration.
- Run migrations before app start in local dev boot script.

## Safety Checks Before Reindex
- DB reachable
- embedding provider configured
- vault path exists and readable

## Failure Policy
- Continue processing remaining files on single-file failure.
- End with non-zero exit if any failures occurred.
- Print failure list with file paths for retry.

## Operational Note
Use full reindex after:
- chunking strategy changes
- embedding model version change
- link extraction logic changes
