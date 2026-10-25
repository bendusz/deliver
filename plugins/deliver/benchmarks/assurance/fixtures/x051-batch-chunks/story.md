# S1-51: Split import rows into bounded batches
<!-- pm-meta: {"builder":"codex-builder","touches":["src","test"]} -->
Sprint: 1 · Priority: med · Covers: FR-051 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Split import rows into bounded batches.

## Context (self-contained)
Node 20 or later, ESM, no dependencies. `src/feature.mjs` contains the domain helpers. Tests live in `test/`.
Items is an array of arbitrary values. Size must be a positive integer. Returned arrays may share item identities but must not change the input.

## Acceptance criteria (testable)
- [ ] `chunkRows(items, size)` returns consecutive arrays of at most size items without dropping or repeating any row.
- [ ] Empty input returns an empty array. Reject zero, negative, fractional, or nonnumeric size with RangeError, even for empty input.

## Out of scope
- Inputs and integrations outside the contracts above.

## Verification
- Prove done with: `node --test test/*.test.mjs`

## Verification evidence

## Execution
