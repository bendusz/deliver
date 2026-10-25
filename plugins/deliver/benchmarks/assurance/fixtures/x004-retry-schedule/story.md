# S1-4: Calculate bounded retry delays
<!-- pm-meta: {"builder":"codex-builder","touches":["src","test"]} -->
Sprint: 1 · Priority: med · Covers: FR-004 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Calculate bounded retry delays.

## Context (self-contained)
Node 20 or later, ESM, no dependencies. `src/feature.mjs` contains the domain helpers. Tests live in `test/`.
Attempts are 1-based positive integers. Initial and cap are finite positive milliseconds, initial <= cap; attempt <= 40.

## Acceptance criteria (testable)
- [ ] `retryDelay(attempt, initial, cap)` doubles the initial delay for each attempt after the first.
- [ ] No result may exceed cap, even when the exponential value crosses it.

## Out of scope
- Inputs and integrations outside the contracts above.

## Verification
- Prove done with: `node --test test/*.test.mjs`

## Verification evidence

## Execution
