# S1-58: Transform import rows with bounded concurrency
<!-- pm-meta: {"builder":"codex-builder","touches":["src","test"]} -->
Sprint: 1 · Priority: med · Covers: FR-058 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Transform import rows with bounded concurrency.

## Context (self-contained)
Node 20 or later, ESM, no dependencies. `src/feature.mjs` contains the domain helpers. Tests live in `test/`.
Items is an array, limit is a positive integer, and transform is an async function. This contract covers successful transforms; cancellation is outside scope.

## Acceptance criteria (testable)
- [ ] `mapLimited(items, limit, transform)` transforms every item exactly once, passing item and original index, and returns values in input order.
- [ ] At most limit transforms may be pending at once; resolve only after all complete. Empty input resolves to an empty array.

## Out of scope
- Inputs and integrations outside the contracts above.

## Verification
- Prove done with: `node --test test/*.test.mjs`

## Verification evidence

## Execution
