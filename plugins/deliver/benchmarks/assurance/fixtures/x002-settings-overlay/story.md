# S1-2: Apply explicit settings overrides
<!-- pm-meta: {"builder":"codex-builder","touches":["src","test"]} -->
Sprint: 1 · Priority: med · Covers: FR-002 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Apply explicit settings overrides.

## Context (self-contained)
Node 20 or later, ESM, no dependencies. `src/feature.mjs` contains the domain helpers. Tests live in `test/`.
Settings are flat objects with own enumerable string keys and JSON-like values or undefined.

## Acceptance criteria (testable)
- [ ] `mergeSettings(defaults, overrides)` returns a new object, retaining defaults only where the override is undefined or absent.
- [ ] False, zero, empty string, and null are explicit overrides. Neither input is mutated.

## Out of scope
- Inputs and integrations outside the contracts above.

## Verification
- Prove done with: `node --test test/*.test.mjs`

## Verification evidence

## Execution
