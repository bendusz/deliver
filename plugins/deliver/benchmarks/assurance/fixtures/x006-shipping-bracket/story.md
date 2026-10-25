# S1-6: Select a shipping weight bracket
<!-- pm-meta: {"builder":"codex-builder","touches":["src","test"]} -->
Sprint: 1 · Priority: med · Covers: FR-006 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Select a shipping weight bracket.

## Context (self-contained)
Node 20 or later, ESM, no dependencies. `src/feature.mjs` contains the domain helpers. Tests live in `test/`.
Bands have finite min, max, and rate numbers, sorted and non-overlapping; min < max. Weight is finite and nonnegative.

## Acceptance criteria (testable)
- [ ] `findBracket(bands, value)` returns the rate for the half-open band min <= value < max.
- [ ] Return null in gaps or beyond all bands, including an empty band list. A rate of zero is valid.

## Out of scope
- Inputs and integrations outside the contracts above.

## Verification
- Prove done with: `node --test test/*.test.mjs`

## Verification evidence

## Execution
