# S1-3: Save a task
<!-- pm-meta: {"builder":"expert-builder","touches":["src","test"]} -->
Sprint: 1 · Priority: med · Covers: FR-001 · Depends on: none · Parallel-safe: no
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Persist a new task and return it.

## Context (self-contained)
Node 20, ESM, no dependencies. Source under `src/`, tests under `test/` run with `node --test`.
Handlers return `{ status, body }`. The `db` object exposes `query(sql, params)` returning rows.

## Acceptance criteria (testable)
- [ ] `createTask(store, title)` saves the task and resolves with the saved record, including its `id`.
- [ ] A failed save rejects with the store error.

## Out of scope
- Anything not named above.

## Verification
- Prove done with: `node --test`
