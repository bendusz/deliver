# S1-57: Fix inclusive seat-range counts
<!-- pm-meta: {"builder":"codex-builder","touches":["src","test"]} -->
Sprint: 1 · Priority: med · Covers: FR-057 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Fix inclusive seat-range counts.

## Context (self-contained)
Node 20 or later, ESM, no dependencies. `src/feature.mjs` contains the domain helpers. Tests live in `test/`.
Existing range counts omit the last seat. Start and end are positive safe integers with end >= start; the difference is also safe.

## Acceptance criteria (testable)
- [ ] `seatCount(start, end)` counts both endpoints, including one seat when they are equal.
- [ ] Add regression tests for a single seat and a range containing several seats.

## Out of scope
- Inputs and integrations outside the contracts above.

## Verification
- Prove done with: `node --test test/*.test.mjs`

## Verification evidence

## Execution
