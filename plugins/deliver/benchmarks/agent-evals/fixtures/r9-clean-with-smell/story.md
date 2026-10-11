# S1-9: Count open tasks
<!-- pm-meta: {"builder":"expert-builder","touches":["src","test"]} -->
Sprint: 1 · Priority: med · Covers: FR-001 · Depends on: none · Parallel-safe: no
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Add a function that counts the tasks not yet done.

## Context (self-contained)
Node 20, ESM, no dependencies. Source under `src/`, tests under `test/` run with `node --test`.
Handlers return `{ status, body }`. The `db` object exposes `query(sql, params)` returning rows.

## Acceptance criteria (testable)
- [ ] `openCount(tasks)` returns the number of tasks whose `done` is false.
- [ ] An empty list returns 0.

## Out of scope
- Anything not named above.

## Verification
- Prove done with: `node --test`
