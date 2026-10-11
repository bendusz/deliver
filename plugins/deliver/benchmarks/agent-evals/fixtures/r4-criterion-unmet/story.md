# S1-4: Fetch one task
<!-- pm-meta: {"builder":"expert-builder","touches":["src","test"]} -->
Sprint: 1 · Priority: med · Covers: FR-001 · Depends on: none · Parallel-safe: no
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Add a handler that returns one task by id.

## Context (self-contained)
Node 20, ESM, no dependencies. Source under `src/`, tests under `test/` run with `node --test`.
Handlers return `{ status, body }`. The `db` object exposes `query(sql, params)` returning rows.

## Acceptance criteria (testable)
- [ ] `getTask(db, id)` returns `{ status: 200, body: task }` for an existing id.
- [ ] An unknown id returns `{ status: 404, body: { error: "not found" } }`.

## Out of scope
- Anything not named above.

## Verification
- Prove done with: `node --test`
