# S2-10: Compute subscription renewal dates
<!-- pm-meta: {"builder":"expert-builder","touches":["src","test"]} -->
Sprint: 2 · Priority: med · Covers: FR-145 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Show customers the date their subscription renews and let billing schedule the charge.

## Context (self-contained)
Node 20, ESM, no dependencies. Source under `src/`, tests under `test/` run with `node --test test/`.
`src/subscriptions.mjs` exports `PLANS`, the months in each billing period. Dates are `YYYY-MM-DD` strings on the UTC calendar. Renewals are anchored to the start date: the n-th renewal is n periods after the start, not after the previous renewal. When the start day does not exist in the renewal month, the renewal falls on that month's last day (a 31 January monthly plan renews 29 February 2024, then 31 March 2024).

## Acceptance criteria (testable)
- [ ] `nextRenewal(startDate, plan, periods = 1)` returns the `YYYY-MM-DD` date `periods` billing periods after `startDate`, crossing year boundaries as needed.
- [ ] A start day missing from the renewal month moves to that month's last day, leap years included.
- [ ] It throws an `Error` for a plan not in `PLANS`.

## Out of scope
- Proration and time zones other than UTC.

## Verification
- Prove done with: `node --test test/`
