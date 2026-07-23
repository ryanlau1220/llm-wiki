# Development workflow

## Validation order

For feature work, prefer fast, deterministic checks before interactive UI testing:

1. Run the smallest relevant unit and integration tests.
2. Run type checking, linting, and production builds for affected packages.
3. Inspect the diff and report the exact manual verification path.
4. Let the project owner verify the UI manually against the running application.
5. Run browser or desktop UI automation only when the owner explicitly requests it after manual verification, or when it is necessary to reproduce a reported regression.

Do not block a change on browser-profile setup, extension installation, native file pickers, or other environment-specific UI automation. Record those as manual verification steps instead.

## Commit discipline

Every commit must have one purpose and be independently understandable, reviewable, and reversible. Split changes by responsibility—for example, schema, backend behavior, UI, tests, and workflow configuration belong in separate commits when they can stand alone.

Do not combine a broad feature implementation, refactor, generated output, documentation, and unrelated cleanup in one commit. A large file count or line count is a signal to revisit the split, not a reason to proceed. State the intended commit split before the first commit and validate each commit with the smallest relevant check.

## Test reporting

Before requesting manual verification, report:

- checks run and their outcomes;
- any tests intentionally not run, with the reason;
- the minimal manual scenario, expected result, and any local services required.

When a manual check passes, treat it as validation evidence from the owner. Do not repeat it with UI automation unless requested or a later change affects that path.

## Exceptions

Use automated UI coverage when it provides durable regression protection for a critical, repeatable flow and does not require personal browser state or external credentials. Keep such coverage isolated from production data and provider calls.

For any live verification that creates, changes, or deletes user data, obtain explicit approval and state the expected side effect first.
