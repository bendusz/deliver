# S1-20: Include empty stock in inventory reports on request
<!-- pm-meta: {"builder":"codex-builder","touches":["src","test"]} -->
Sprint: 1 · Priority: med · Covers: FR-020 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Include empty stock in inventory reports on request.

## Context (self-contained)
Node 20 or later, ESM, no dependencies. `src/feature.mjs` contains the domain helpers. Tests live in `test/`.
Items have unique string sku and nonnegative integer quantity. Return new summary objects in input order.

## Acceptance criteria (testable)
- [ ] `inventorySummary(items, options)` returns sku and quantity for stocked items by default.
- [ ] includeEmpty true also includes items whose quantity is zero. Empty input returns an empty array.

## Out of scope
- Inputs and integrations outside the contracts above.

## Verification
- Prove done with: `node --test test/*.test.mjs`

## Verification evidence

## Execution
