# S2-1: Create a task
<!-- pm-meta: {"builder":"expert-builder","touches":["src","test"]} -->
Sprint: 1 · Priority: med · Covers: FR-001 · Depends on: none · Parallel-safe: no
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Add task creation with title validation.

## Context (self-contained)
Node 20, ESM, no dependencies. Source under `src/`, tests under `test/` run with `node --test`.
Handlers return `{ status, body }`. The `db` object exposes `query(sql, params)` returning rows.

## Acceptance criteria (testable)
- [ ] `createTask(title)` returns `{ status: 201, body: { title } }` for a valid title.
- [ ] An empty or whitespace-only title returns `{ status: 400, body: { error: "title required" } }`.

## Out of scope
- Anything not named above.

## Verification
- Prove done with: `node --test`
