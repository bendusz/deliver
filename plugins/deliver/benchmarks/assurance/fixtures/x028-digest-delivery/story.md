# S1-28: Wait for every digest delivery
<!-- pm-meta: {"builder":"codex-builder","touches":["src","test"]} -->
Sprint: 1 · Priority: med · Covers: FR-028 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Wait for every digest delivery.

## Context (self-contained)
Node 20 or later, ESM, no dependencies. `src/feature.mjs` contains the domain helpers. Tests live in `test/`.
Recipients are strings. Send is an injected promise-returning delivery adapter; this task assumes successful deliveries.

## Acceptance criteria (testable)
- [ ] `sendDigest(recipients, send)` delivers to every recipient exactly once, in list order.
- [ ] Resolve with the count only after all delivery promises resolve. Empty input resolves to zero.

## Out of scope
- Inputs and integrations outside the contracts above.

## Verification
- Prove done with: `node --test test/*.test.mjs`

## Verification evidence

## Execution
