# S1-18: Invalidate cached product entries
<!-- pm-meta: {"builder":"codex-builder","touches":["src","test"]} -->
Sprint: 1 · Priority: med · Covers: FR-018 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Invalidate cached product entries.

## Context (self-contained)
Node 20 or later, ESM, no dependencies. `src/feature.mjs` contains the domain helpers. Tests live in `test/`.
A cache is an in-memory string-keyed store. Values may be any JavaScript value. Deleting a missing key is allowed.

## Acceptance criteria (testable)
- [ ] `createCache()` exposes set, get, and invalidate. Set replaces a value; get returns undefined for absent keys.
- [ ] invalidate removes only its key and returns whether it existed. A later set may reuse that key.

## Out of scope
- Inputs and integrations outside the contracts above.

## Verification
- Prove done with: `node --test test/*.test.mjs`

## Verification evidence

## Execution
