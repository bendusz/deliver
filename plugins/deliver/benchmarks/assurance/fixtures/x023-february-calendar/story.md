# S1-23: Fix Gregorian century year calculations
<!-- pm-meta: {"builder":"codex-builder","touches":["src","test"]} -->
Sprint: 1 · Priority: med · Covers: FR-023 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Fix Gregorian century year calculations.

## Context (self-contained)
Node 20 or later, ESM, no dependencies. `src/feature.mjs` contains the domain helpers. Tests live in `test/`.
The calendar has a reported century-year error. Years are integers in 1600..9999 under the proleptic Gregorian calendar.

## Acceptance criteria (testable)
- [ ] `daysInFebruary(year)` returns 29 only for years divisible by four except centuries not divisible by 400; return 28 otherwise.
- [ ] Add regression tests for both 1900 and 2000, and retain ordinary leap-year coverage.

## Out of scope
- Inputs and integrations outside the contracts above.

## Verification
- Prove done with: `node --test test/*.test.mjs`

## Verification evidence

## Execution
