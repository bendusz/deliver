# S1-6: Delete a task
<!-- pm-meta: {"builder":"expert-builder","touches":["src","test"]} -->
Sprint: 1 · Priority: med · Covers: FR-001 · Depends on: none · Parallel-safe: no
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Add a handler that deletes a task.

## Context (self-contained)
Node 20, ESM, no dependencies. Source under `src/`, tests under `test/` run with `node --test`.
Handlers return `{ status, body }`. The `db` object exposes `query(sql, params)` returning rows.

## Acceptance criteria (testable)
- [ ] `deleteTask(db, id)` deletes the row and returns `{ status: 204, body: null }`.
- [ ] A database failure returns `{ status: 500, body: { error: "delete failed" } }`.

## Out of scope
- Anything not named above.

## Verification
- Prove done with: `node --test`
