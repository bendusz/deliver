# S2-5: Add the --json flag
<!-- pm-meta: {"builder":"expert-builder","touches":["src","test"]} -->
Sprint: 1 · Priority: med · Covers: FR-001 · Depends on: none · Parallel-safe: no
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Let the CLI print JSON, and document it.

## Context (self-contained)
Node 20, ESM, no dependencies. Source under `src/`, tests under `test/` run with `node --test`.
Handlers return `{ status, body }`. The `db` object exposes `query(sql, params)` returning rows.

## Acceptance criteria (testable)
- [ ] `format(tasks, { json: true })` returns the tasks as a JSON string.
- [ ] `README.md` documents the `--json` flag under a "Usage" heading.

## Out of scope
- Anything not named above.

## Verification
- Prove done with: `node --test`
