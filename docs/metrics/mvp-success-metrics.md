# MVP Success Metrics

## Purpose
Define measurable acceptance criteria for the Phase 1-2 MVP so quality and reliability can be tracked over time.

## Scope
- Ask Knowledge flow
- Ingestion and retrieval pipeline
- Write-back preview and approval flow

## Primary Metrics

### 1) Retrieval Quality
- Metric: Recall at K (R@10)
- Definition: Fraction of evaluation queries where at least one gold-support chunk appears in top 10 retrieved chunks.
- Target (MVP): >= 0.75
- Guardrail: Must not fall below 0.65 on regression runs.

- Metric: Precision at K (P@5)
- Definition: Average proportion of relevant chunks in top 5 retrieval results.
- Target (MVP): >= 0.55
- Guardrail: Must not fall below 0.45 on regression runs.

### 2) Answer Quality
- Metric: Human quality score (1-5 rubric)
- Definition: Average reviewer score across correctness, completeness, and groundedness.
- Target (MVP): >= 4.0/5
- Guardrail: No more than 10% of answers below 3/5.

### 3) Note Acceptance Rate
- Metric: Preview to save conversion
- Definition: saved_ai_notes / shown_previews.
- Target (MVP): >= 0.40
- Guardrail: Alert if under 0.25 over rolling 7-day window.

### 4) Ask Latency
- Metric: p95 end-to-end latency
- Definition: Time from user submit to preview-ready response.
- Target (MVP): <= 4.0s on local hardware baseline.
- Guardrail: p99 must remain <= 7.0s.

## Safety and Reliability Metrics
- Invalid action rejection rate: 100% of invalid AI actions must be rejected by validator.
- Unsafe action execution rate: 0 allowed.
- Write-path violations (human folder writes): 0 allowed.
- Ingestion pipeline failure rate: <= 1% of changed files over 24h.

## Quality Rubric (Answer Quality)
Score each answer from 1-5 on:
- Correctness: factual and consistent with retrieved context.
- Groundedness: cites or clearly aligns with known notes.
- Completeness: addresses the user question sufficiently.
- Clarity: concise and understandable output.

Use average of four dimensions as final score.

## Measurement Cadence
- Daily smoke run: small fixed query set (20 queries).
- Weekly regression run: full gold set.
- Per-merge check: retrieval and action-validation tests.

## Release Gates
MVP can be marked "ready" only if all gates pass for two consecutive weekly runs:
- R@10 >= 0.75
- P@5 >= 0.55
- Answer quality >= 4.0
- p95 latency <= 4.0s
- 0 unsafe action executions
