# S1-45: Parse decimal payment amounts as exact cents
<!-- pm-meta: {"builder":"codex-builder","touches":["src","test"]} -->
Sprint: 1 · Priority: med · Covers: FR-045 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Parse decimal payment amounts as exact cents.

## Context (self-contained)
Node 20 or later, ESM, no dependencies. `src/feature.mjs` contains the domain helpers. Tests live in `test/`.
Value matches -?digits.digits with exactly two fractional digits; its absolute value is at most 1000000. Negative zero is allowed.

## Acceptance criteria (testable)
- [ ] `toCents(value)` returns the exact signed integer number of cents with no binary floating-point rounding loss.
- [ ] A negative amount keeps its sign, including negative zero.

## Out of scope
- Inputs and integrations outside the contracts above.

## Verification
- Prove done with: `node --test test/*.test.mjs`

## Verification evidence

## Execution
