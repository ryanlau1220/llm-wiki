# Watcher Resilience Design

## Goal
Keep ingestion reliable under bursty file changes and transient failures.

## Event Processing Model
- Source: filesystem change events on vault/human/.
- Debounce window: 5s per file path key.
- Queue: in-memory FIFO initially, extensible to durable queue later.
- Concurrency: bounded worker pool (start with 2 workers).

## Retry Policy
- Retry on transient failures only (embed API timeout, DB connection reset).
- Backoff: exponential with jitter.
- Attempts: max 3 retries.
- Non-retryable: parse errors, validation errors, forbidden path writes.

## Poison Event Handling
- After max retries, mark event dead-letter with full context.
- Persist dead-letter metadata for operator inspection.
- Do not block queue progression on poison events.

## Duplicate Event Suppression
- Coalesce multiple events for same path during debounce window.
- Use content_hash check at ingestion start to avoid duplicate writes.

## Health Signals
Track and expose:
- queue depth
- oldest queued event age
- ingestion success rate
- retry count and dead-letter count

## Recovery Procedure
1. Resolve root issue.
2. Requeue dead-lettered files manually via reindex command.
3. Verify ingestion_runs status transitions to success.
