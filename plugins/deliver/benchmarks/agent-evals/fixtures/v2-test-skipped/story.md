# S2-2: Parse a due date
<!-- pm-meta: {"builder":"expert-builder","touches":["src","test"]} -->
Sprint: 1 · Priority: med · Covers: FR-001 · Depends on: none · Parallel-safe: no
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Parse the due date a user types.

## Context (self-contained)
Node 20, ESM, no dependencies. Source under `src/`, tests under `test/` run with `node --test`.
Handlers return `{ status, body }`. The `db` object exposes `query(sql, params)` returning rows.

## Acceptance criteria (testable)
- [ ] `parseDue("2026-03-01")` returns a Date for that UTC day.
- [ ] `parseDue("not a date")` throws `RangeError`.

## Out of scope
- Anything not named above.

## Verification
- Prove done with: `node --test`
