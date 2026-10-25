# S1-29: Coalesce concurrent catalog loads
<!-- pm-meta: {"builder":"codex-builder","touches":["src","test"]} -->
Sprint: 1 · Priority: med · Covers: FR-029 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Coalesce concurrent catalog loads.

## Context (self-contained)
Node 20 or later, ESM, no dependencies. `src/feature.mjs` contains the domain helpers. Tests live in `test/`.
Load is an injected async function taking a string key. Values, including undefined, can be cached. Rejections may remain cached.

## Acceptance criteria (testable)
- [ ] `createLoader(load)` returns an async get function that loads each key at most once, including concurrent requests before resolution.
- [ ] All callers for a key receive the same loaded value or rejection. Different keys are independent.

## Out of scope
- Inputs and integrations outside the contracts above.

## Verification
- Prove done with: `node --test test/*.test.mjs`

## Verification evidence

## Execution
