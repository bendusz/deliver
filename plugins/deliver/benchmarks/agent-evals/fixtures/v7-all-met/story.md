# S2-7: Clamp a priority
<!-- pm-meta: {"builder":"expert-builder","touches":["src","test"]} -->
Sprint: 1 · Priority: med · Covers: FR-001 · Depends on: none · Parallel-safe: no
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Keep a task priority within 1 to 5.

## Context (self-contained)
Node 20, ESM, no dependencies. Source under `src/`, tests under `test/` run with `node --test`.
Handlers return `{ status, body }`. The `db` object exposes `query(sql, params)` returning rows.

## Acceptance criteria (testable)
- [ ] `clamp(0)` returns 1 and `clamp(9)` returns 5.
- [ ] `clamp(3)` returns 3.
- [ ] `clamp("x")` throws `TypeError`.

## Out of scope
- Anything not named above.

## Verification
- Prove done with: `node --test`
