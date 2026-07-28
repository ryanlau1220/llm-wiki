# Development workflow

## Authority and branch model

- The project owner defines feature scope and acceptance criteria, then verifies completed work on `dev`.
- Agents may create worktrees, feature branches, commits, pull requests, and merge reviewed work into `dev` without waiting for another approval.
- `dev` is the shared integration branch. Fast-forward the primary workspace to `dev` after every merge so the owner can stay there for verification.
- Never open, merge, or otherwise promote a `dev` to `main` pull request without the project owner's explicit approval after manual verification on `dev`.
- Never delete the permanent `dev` branch.

## Plan and execution lifecycle

For every non-trivial feature, the coordinator must state a short task list and acceptance criteria before editing.

```text
Scope and acceptance criteria
  -> worktree and ownership decision
  -> implementation in small commits
  -> deterministic validation
  -> independent review
  -> PR merge to dev
  -> primary-workspace fast-forward and cleanup
  -> owner manual verification on dev
  -> explicit owner approval before any dev -> main promotion
```

The coordinator owns feature completion, not an individual worker's completion. A completed subtask is a checkpoint: the coordinator must immediately dispatch the next dependency-ready work, integrate results, review, or validate the feature. Do not stop and wait for the owner after a small task merely because it has been committed.

Stop only when:

1. the accepted scope is merged into `dev` and ready for owner verification;
2. a meaningful product, security, privacy, data-retention, migration, or external-authority decision requires the owner's direction; or
3. a genuine external blocker remains after safe investigation.

Do not claim a feature is complete when only a safe subset was completed. Report completed commits, remaining scope, and the specific blocker.

## Parallel work and worktrees

- The coordinator decides when to use worktrees and delegates explicit, non-overlapping file ownership.
- Use a separate feature worktree for concurrent writers, risky exploration, or multi-commit work. A short isolated change may use the primary checkout.
- Workers must not create overlapping changes or independently choose a conflicting worktree/branch strategy.
- Database migrations, shared API contracts, shared types, and sequential retrieval-pipeline stages are single-writer work. Parallelize isolated UI, tests, documentation, or services only when ownership is explicit.
- Before merging, update the feature branch against current `dev`, resolve conflicts in that feature worktree, and rerun affected validation.
- After a successful merge to `dev`, fast-forward the primary workspace, remove the completed worktree, delete the merged feature branch locally and remotely, and preserve `dev`.

## Commit discipline

Every commit must have one purpose and be independently understandable, reviewable, and reversible. Split changes by responsibility—for example, schema, backend behavior, UI, tests, workflow configuration, generated output, and cleanup belong in separate commits when they can stand alone.

Do not combine a broad feature implementation, refactor, generated output, documentation, and unrelated cleanup in one commit. A large file count or line count is a signal to revisit the split, not a reason to proceed.

Before committing:

1. state the intended commit split in a concise progress update;
2. inspect the scoped diff and run `git diff --check`;
3. run the smallest relevant deterministic validation.

If validation fails or the work is incomplete, do not claim completion. Preserve a necessary checkpoint only in a clearly labelled `wip:` commit on a feature branch.

## Validation and testing

For feature work, prefer fast, deterministic checks before interactive UI testing:

1. Run the smallest relevant unit and integration tests.
2. Add or update unit tests for pure logic, integration tests for API/data flows, and backend end-to-end coverage only where it is durable and repeatable.
3. Run type checking, linting, and production builds for affected packages.
4. Inspect the diff and report the exact manual verification path.
5. Let the project owner verify the UI manually against the running application.
6. Run browser or desktop UI automation only when the owner explicitly requests it after manual verification, or when it is necessary to reproduce a reported regression.

`bun run test` and `./manage.sh test` must run deterministic automated coverage only. A command that requires a live model, external network, a real vault, credentials, or a configured database is a diagnostic—not a required test—and must not silently convert failure into a passing skip.

Do not block a change on browser-profile setup, extension installation, native file pickers, or other environment-specific UI automation. Record those as manual verification steps instead.

For any live verification that creates, changes, or deletes user data, obtain explicit approval and state the expected side effect first.

## Pull requests and review

For every feature, the coordinator owns implementation through integration into `dev`: validate, perform an independent code-review pass, open the PR, resolve conflicts, merge to `dev`, fast-forward the primary workspace, and clean up the completed worktree and feature branch.

Code review is required before every PR merge. Review:

- acceptance criteria and correctness;
- type safety and test coverage;
- privacy, security, sensitive-data retention, and approval boundaries;
- migration safety and compatibility;
- accidental generated files, fixtures, scaffolding, or unrelated changes;
- the scoped diff, mergeability, and required checks.

Before requesting owner verification, report:

- commits and PR/merge result;
- checks run and their outcomes;
- tests intentionally not run or skipped, with the reason;
- the minimal manual scenario, expected result, and required local services;
- remaining risks or explicitly deferred work.

When a manual check passes, treat it as owner-provided validation evidence. Do not repeat it with UI automation unless requested or a later change affects that path.

## Documentation and handoff hygiene

- Do not create progress, status, TODO, or handoff Markdown files by default. Summarize implementation status in chat.
- Create a local handoff, design, or diagnostic artifact only when the owner explicitly requests it. Keep local-only artifacts ignored.
- A handoff document is context, not evidence that code was implemented, reviewed, or verified.
- Keep tracked workflow documentation concise and current; do not add generic process material that does not change agent behavior.
