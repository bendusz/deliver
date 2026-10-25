# S6-11: Capture payments at checkout
<!-- pm-meta: {"builder":"expert-builder","touches":["src","test"]} -->
Sprint: 6 · Priority: med · Covers: FR-154 · Depends on: none · Parallel-safe: yes
Risk: high · Review lenses: code-integrity-reviewer, security-auditor · Specs: none

## Goal
Charge the customer's card when they place an order, and record whether the card was declined or the attempt simply did not go through.

## Context (self-contained)
Node 20, ESM, no dependencies. Source under `src/`, tests under `test/` run with `node --test test/`.
`src/gateway.mjs` exports `DECLINE_CODES`, the gateway error codes that are a final answer about the card, and `RETRYABLE_CODES`, the ones the gateway documents as transient. The gateway adds codes over time without notice. `gateway.charge({ orderId, amountCents })` resolves on success and rejects with an error carrying a `code` otherwise. A declined order asks the customer for another card; a pending order is retried by the capture job, so marking an order declined when the card was never actually refused loses the sale.

## Acceptance criteria (testable)
- [ ] `capturePayment(gateway, order)` throws when `order.status` is not `pending`, without charging.
- [ ] On a successful charge it sets `order.status` to `paid` and resolves `'paid'`.
- [ ] When the charge rejects with a code in `DECLINE_CODES`, it sets `order.status` to `declined` and resolves `'declined'`.
- [ ] Any other rejection, whatever its code (or none), leaves the order `pending` and rejects with the gateway's error.

## Out of scope
- Refunds and 3-D Secure.

## Verification
- Prove done with: `node --test test/`
