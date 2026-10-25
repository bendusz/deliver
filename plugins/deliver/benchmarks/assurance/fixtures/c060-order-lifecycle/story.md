# S6-12: Order status transitions
<!-- pm-meta: {"builder":"expert-builder","touches":["src","test"]} -->
Sprint: 6 · Priority: med · Covers: FR-159 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Enforce the order lifecycle in one place so no code path can move an order into an impossible state, and keep a history of every change.

## Context (self-contained)
Node 20, ESM, no dependencies. Source under `src/`, tests under `test/` run with `node --test test/`.
`src/order-status.mjs` exports `STATES`. Orders are `{ id, status, history }`; `history` may be absent on old orders. Allowed moves: `cart` to `placed` or `cancelled`; `placed` to `paid` or `cancelled`; `paid` to `shipped` or `refunded`; `shipped` to `delivered`; `delivered` to `refunded`. `cancelled` and `refunded` are final.

## Acceptance criteria (testable)
- [ ] `canTransition(from, to)` is `true` exactly for the allowed moves above, and `false` for everything else, unknown states included.
- [ ] `transition(order, to, at)` returns a new order with `status` set to `to` and `{ from, to, at }` appended to a copy of `history` (starting from `[]` when absent); the input order is not modified.
- [ ] A move that is not allowed throws an error whose `code` is `EINVALIDSTATE` and whose message names the order id and both states.

## Out of scope
- Persisting orders.

## Verification
- Prove done with: `node --test test/`
