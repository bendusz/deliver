# S1-5: Dispatch queued print jobs in arrival order
<!-- pm-meta: {"builder":"codex-builder","touches":["src","test"]} -->
Sprint: 1 · Priority: med · Covers: FR-005 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Dispatch queued print jobs in arrival order.

## Context (self-contained)
Node 20 or later, ESM, no dependencies. `src/feature.mjs` contains the domain helpers. Tests live in `test/`.
The caller owns a mutable array of job objects ordered oldest first.

## Acceptance criteria (testable)
- [ ] `dequeue(queue)` removes and returns the oldest job.
- [ ] An empty queue returns null, and unselected jobs retain their order.

## Out of scope
- Inputs and integrations outside the contracts above.

## Verification
- Prove done with: `node --test test/*.test.mjs`

## Verification evidence

## Execution
