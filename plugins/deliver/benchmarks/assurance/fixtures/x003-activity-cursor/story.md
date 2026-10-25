# S1-3: Read an activity page after a cursor
<!-- pm-meta: {"builder":"codex-builder","touches":["src","test"]} -->
Sprint: 1 · Priority: med · Covers: FR-003 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Read an activity page after a cursor.

## Context (self-contained)
Node 20 or later, ESM, no dependencies. `src/feature.mjs` contains the domain helpers. Tests live in `test/`.
Rows have unique string ids in display order. A cursor is null or an id present in rows. Limit is a positive integer.

## Acceptance criteria (testable)
- [ ] `takePage(rows, cursor, limit)` returns up to limit rows strictly after cursor; null starts at the first row.
- [ ] The last cursor returns an empty array and inputs stay unchanged.

## Out of scope
- Inputs and integrations outside the contracts above.

## Verification
- Prove done with: `node --test test/*.test.mjs`

## Verification evidence

## Execution
