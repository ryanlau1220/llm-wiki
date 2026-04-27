# Ingestion Idempotency Strategy

## Goal
Ensure repeated file events do not create duplicate documents, chunks, or links.

## Canonical Identity
- Primary document identity: normalized vault-relative path.
- Change identity: content hash (sha256) of normalized markdown content.

## Rules
- If path exists and incoming content_hash is unchanged, skip parse/embed/write.
- If path exists and hash changed, increment document version and replace derived artifacts.
- If path does not exist, insert new document version 1.

## Upsert Pattern
1. Start transaction.
2. Load current document by path with row lock.
3. Compare content_hash.
4. If unchanged: record ingestion_runs status=skipped, commit.
5. If changed:
   - update documents row (content, hash, version+1, updated_at)
   - delete old chunks and links for document
   - insert new chunks and links
   - record ingestion_runs status=updated
6. Commit transaction.

## Failure Handling
- Any parse/embed error rolls back document/chunk/link writes.
- ingestion_runs records failed attempts with error_message.
- failed runs are retryable because no partial writes remain.

## Hash Normalization
Before hashing:
- normalize newlines to \n
- trim trailing whitespace per line
- preserve semantic markdown content

This avoids false updates from editor formatting noise.
