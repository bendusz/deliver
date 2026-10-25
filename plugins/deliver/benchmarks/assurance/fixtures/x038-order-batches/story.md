# S1-38: Group fulfillment orders by customer
<!-- pm-meta: {"builder":"codex-builder","touches":["src","test"]} -->
Sprint: 1 · Priority: med · Covers: FR-038 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Group fulfillment orders by customer.

## Context (self-contained)
Node 20 or later, ESM, no dependencies. `src/feature.mjs` contains the domain helpers. Tests live in `test/`.
Orders have a string customer key. Large imports can contain 100000 orders for distinct customers.

## Acceptance criteria (testable)
- [ ] `customerBatches(orders)` returns groups in first-seen customer order; orders within a group preserve input order and identity.
- [ ] Use expected O(n) work and O(n) storage regardless of the number of distinct customers. Empty input returns an empty array.

## Out of scope
- Inputs and integrations outside the contracts above.

## Verification
- Prove done with: `node --test test/*.test.mjs`

## Verification evidence

## Execution
