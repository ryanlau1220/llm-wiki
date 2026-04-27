# Evaluation Workflow and Regression Checks

## Goal
Ensure retrieval, answer quality, and safety do not regress as features are added.

## Dataset Strategy
- Seed set: 50 representative queries from real vault topics.
- Gold support: each query maps to expected supporting note ids/chunk ids.
- Gold answers: short reference answers for human comparison.
- Keep dataset versioned under docs/evaluation/datasets/ (to be added).

## Evaluation Layers

### Layer 1: Retrieval Regression
- Inputs: query set + gold supporting chunks.
- Outputs: R@10, P@5, MRR.
- Failure condition: Any guardrail breach from metrics doc.

### Layer 2: Generation Quality
- Inputs: retrieved context + model output.
- Outputs: Human rubric scores and pass/fail labels.
- Failure condition: Average score < target or high low-score rate.

### Layer 3: Safety Validation
- Inputs: generated AI action JSON samples (valid + adversarial invalid cases).
- Outputs: validator pass/reject counts.
- Failure condition: any invalid action accepted.

## Run Modes
- Pre-merge quick run:
  - 20-query retrieval subset
  - validator adversarial suite
- Weekly full run:
  - full retrieval set
  - sampled generation scoring
  - full safety suite

## Regression Policy
- Hard fail on:
  - safety violations
  - write-path policy violations
  - retrieval guardrail breaches below minimum
- Soft fail with warning on:
  - answer quality drops under target but above guardrail
  - latency trend degradation > 20%

## Result Recording
For each run, capture:
- timestamp
- dataset version
- model and embedding versions
- retrieval metrics
- answer rubric aggregates
- safety suite results
- pass/fail decision

Store in logs/evals/YYYY-MM-DD-run-id.json (path to be created during implementation).

## Triage Flow
1. Detect failing gate.
2. Identify whether failure source is ingestion, retrieval, prompting, or validation.
3. Reproduce on minimal query set.
4. Apply fix.
5. Re-run quick suite.
6. Re-run full affected suite before merge.

## Ownership
- Any contributor merging retrieval or generation changes must run pre-merge quick suite.
- Weekly full run can be automated later, but initially tracked manually.
