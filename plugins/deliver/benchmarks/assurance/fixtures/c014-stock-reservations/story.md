# S5-3: Reserve stock when an order is placed
<!-- pm-meta: {"builder":"expert-builder","touches":["src","test"]} -->
Sprint: 5 · Priority: med · Covers: FR-113 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Reserve stock for each order line at checkout so two customers cannot buy the last unit.

## Context (self-contained)
Node 20, ESM, no dependencies. Source under `src/`, tests under `test/` run with `node --test test/`.
`src/inventory.mjs` holds `available(stock, sku)`. `stock` is a `Map` from SKU to `{ onHand, reserved }`; units already reserved for other orders are not available.

## Acceptance criteria (testable)
- [ ] `reserve(stock, sku, qty)` adds `qty` to the SKU's `reserved` count and returns the units still available.
- [ ] When fewer than `qty` units are available (on hand minus already reserved), or the SKU is unknown, it throws an error with `code` `EINSUFFICIENT` and reserves nothing.
- [ ] It throws a `RangeError` when `qty` is not a positive integer.
- [ ] Tests in `test/` cover each criterion, including a refusal caused by existing reservations.

## Out of scope
- Releasing reservations.

## Verification
- Prove done with: `node --test test/`
