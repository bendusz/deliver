# S1-43: Report partial failures from notification batches
<!-- pm-meta: {"builder":"codex-builder","touches":["src","test"]} -->
Sprint: 1 · Priority: med · Covers: FR-043 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Report partial failures from notification batches.

## Context (self-contained)
Node 20 or later, ESM, no dependencies. `src/feature.mjs` contains the domain helpers. Tests live in `test/`.
Send is an injected promise-returning function. Messages is an array. Every delivery must be attempted, even when another rejects.

## Acceptance criteria (testable)
- [ ] `notifyAll(messages, send)` waits for every delivery and returns successful values in input order only when all succeed.
- [ ] If any delivery fails, reject with AggregateError containing all failure reasons in input order. Empty input resolves to an empty array.

## Out of scope
- Inputs and integrations outside the contracts above.

## Verification
- Prove done with: `node --test test/*.test.mjs`

## Verification evidence

## Execution
