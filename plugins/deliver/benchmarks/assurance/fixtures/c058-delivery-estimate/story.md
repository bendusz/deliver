# S4-12: Business-day delivery estimates
<!-- pm-meta: {"builder":"expert-builder","touches":["src","test"]} -->
Sprint: 4 · Priority: med · Covers: FR-157 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Show an estimated delivery date at checkout by counting the warehouse's business days.

## Context (self-contained)
Node 20, ESM, no dependencies. Source under `src/`, tests under `test/` run with `node --test test/`.
`src/shipping.mjs` exports `WAREHOUSE_HOLIDAYS`, `YYYY-MM-DD` dates the warehouse is closed. Dates are `YYYY-MM-DD` on the UTC calendar. A business day is a Monday to Friday that is not a holiday. Holidays cluster around Christmas and New Year, when estimates matter most.

## Acceptance criteria (testable)
- [ ] `addBusinessDays(start, n, holidays = [])` returns the date reached by moving forward from `start` one business day at a time, `n` times; Saturdays, Sundays and every date in `holidays` are skipped.
- [ ] With `n = 0` it returns `start` when that is a business day, else the next business day.
- [ ] It throws a `RangeError` when `n` is not a non-negative integer.
- [ ] `estimateDelivery(orderDate, serviceDays)` is `addBusinessDays(orderDate, serviceDays, WAREHOUSE_HOLIDAYS)`.

## Out of scope
- Carrier cut-off times.

## Verification
- Prove done with: `node --test test/`
