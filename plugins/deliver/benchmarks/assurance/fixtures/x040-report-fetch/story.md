# S1-40: Retry report reads only on connection resets
<!-- pm-meta: {"builder":"codex-builder","touches":["src","test"]} -->
Sprint: 1 · Priority: med · Covers: FR-040 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Retry report reads only on connection resets.

## Context (self-contained)
Node 20 or later, ESM, no dependencies. `src/feature.mjs` contains the domain helpers. Tests live in `test/`.
Fetch is an injected async adapter. Attempts is a positive integer total call budget, including the first call. No delays are needed here.

## Acceptance criteria (testable)
- [ ] `fetchReport(fetch, attempts)` returns the first successful value and retries only ECONNRESET errors within the budget.
- [ ] All other failures propagate immediately with the same identity. At exhaustion propagate the last reset error.

## Out of scope
- Inputs and integrations outside the contracts above.

## Verification
- Prove done with: `node --test test/*.test.mjs`

## Verification evidence

## Execution
