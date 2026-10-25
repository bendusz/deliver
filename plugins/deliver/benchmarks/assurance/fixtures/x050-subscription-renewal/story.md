# S1-50: Schedule monthly renewals on valid calendar days
<!-- pm-meta: {"builder":"codex-builder","touches":["src","test"]} -->
Sprint: 1 · Priority: med · Covers: FR-050 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Schedule monthly renewals on valid calendar days.

## Context (self-contained)
Node 20 or later, ESM, no dependencies. `src/feature.mjs` contains the domain helpers. Tests live in `test/`.
Date is a valid YYYY-MM-DD string in years 2000..2099. Renewals advance one calendar month and retain the day if it exists.

## Acceptance criteria (testable)
- [ ] `renewalDate(date)` returns the date one month later, clamping the day to the last day of the target month.
- [ ] Handle leap years and December rollover in UTC, independent of the machine timezone.

## Out of scope
- Inputs and integrations outside the contracts above.

## Verification
- Prove done with: `node --test test/*.test.mjs`

## Verification evidence

## Execution
