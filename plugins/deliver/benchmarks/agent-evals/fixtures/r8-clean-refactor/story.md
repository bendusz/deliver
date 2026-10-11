# S1-8: Extract the title check
<!-- pm-meta: {"builder":"expert-builder","touches":["src","test"]} -->
Sprint: 1 · Priority: med · Covers: FR-001 · Depends on: none · Parallel-safe: no
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Move the duplicated title validation into one function, with no behaviour change.

## Context (self-contained)
Node 20, ESM, no dependencies. Source under `src/`, tests under `test/` run with `node --test`.
Handlers return `{ status, body }`. The `db` object exposes `query(sql, params)` returning rows.

## Acceptance criteria (testable)
- [ ] `validTitle(title)` returns true for a non-empty string of at most 120 characters after trimming.
- [ ] `createTask` and `renameTask` both call `validTitle` and keep returning status 400 for an invalid title.

## Out of scope
- Anything not named above.

## Verification
- Prove done with: `node --test`
