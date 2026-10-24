# S4-10: Revenue by region report
<!-- pm-meta: {"builder":"expert-builder","touches":["src","test"]} -->
Sprint: 4 · Priority: med · Covers: FR-147 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer, performance-reviewer · Specs: none

## Goal
Add the nightly revenue-by-region figures to the finance dashboard.

## Context (self-contained)
Node 20, ESM, no dependencies. Source under `src/`, tests under `test/` run with `node --test test/`.
`src/report.mjs` holds report helpers. Orders are `{ id, customerId, status, totalCents }`; customers are `{ id, region }`. The nightly job passes every order of the quarter (around 400,000) and every customer (around 150,000), and must finish within its five-minute slot, so the work must grow linearly with orders plus customers.

## Acceptance criteria (testable)
- [ ] `revenueByRegion(orders, customers)` returns an object mapping each region to the sum of `totalCents` over its customers' orders with status `paid`.
- [ ] Paid orders whose customer is not in `customers` are summed under `unknown`; regions with no paid orders do not appear.
- [ ] Running time grows linearly with `orders.length + customers.length`.

## Out of scope
- Currency conversion.

## Verification
- Prove done with: `node --test test/`
