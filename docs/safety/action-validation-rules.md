# Action Validation and Safety Rules

## Purpose
Define backend-side guarantees for executing AI intents safely.

## Mandatory Rules
- Reject any action that fails JSON schema validation.
- Reject unknown action names.
- Reject payloads with extra properties.
- Reject any path outside allowed roots.
- Reject any write action targeting human/.
- Reject large payloads above max size thresholds.
- Reject content containing null bytes or invalid UTF-8.

## Path and Write Constraints
- Allowed write target: vault/ai-generated/ only.
- Forbidden write target: vault/human/ and any parent traversal.
- Normalize and resolve paths before validation.
- Enforce slug generation and collision-safe suffixing.

## Input Constraints by Action

### create_note
- title required and length-limited.
- content required and length-limited.
- links and tags optional but cardinality-limited.
- source must be whitelisted.

### refactor_note
- source_path must match human/*.md pattern.
- output is always new note in ai-generated/.
- source metadata must be attached to output frontmatter.

### suggest_links
- source_path must be under human/.
- candidate list must be unique and bounded.
- no file writes in this action.

### search
- query required and bounded.
- top_k bounded and defaulted.
- no side effects.

## Execution Flow
1. Parse AI response as JSON.
2. Validate against ai-actions schema.
3. Perform semantic validation:
   - path policy
   - size limits
   - action-specific policy
4. Return preview object.
5. Execute only after explicit user approval.
6. Persist audit event.

## Audit Requirements
Record for every attempted action:
- request_id
- action
- validation_result (accepted or rejected)
- rejection_reason (if rejected)
- actor (system or user)
- timestamp

## Security Notes
- Never execute shell, SQL, or code from action payload.
- Never interpolate payload into SQL without parameterization.
- Keep validator deterministic and side-effect free.
- Add adversarial tests for prompt-injection shaped payloads.
