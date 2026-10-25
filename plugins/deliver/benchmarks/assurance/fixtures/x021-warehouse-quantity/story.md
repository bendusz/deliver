# S1-21: Fix negative warehouse quantities
<!-- pm-meta: {"builder":"codex-builder","touches":["src","test"]} -->
Sprint: 1 · Priority: med · Covers: FR-021 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Fix negative warehouse quantities.

## Context (self-contained)
Node 20 or later, ESM, no dependencies. `src/feature.mjs` contains the domain helpers. Tests live in `test/`.
The existing helper caps quantities at capacity but has returned negative quantities to the UI. Inputs are finite numbers; capacity is nonnegative.

## Acceptance criteria (testable)
- [ ] `clampQuantity(value, capacity)` clamps to the inclusive range zero through capacity.
- [ ] Add a regression test that fails when negative quantities are returned, while retaining coverage of the upper cap.

## Out of scope
- Inputs and integrations outside the contracts above.

## Verification
- Prove done with: `node --test test/*.test.mjs`

## Verification evidence

## Execution
