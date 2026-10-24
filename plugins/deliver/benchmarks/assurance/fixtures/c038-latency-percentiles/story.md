# S4-8: Latency percentiles for the status dashboard
<!-- pm-meta: {"builder":"expert-builder","touches":["src","test"]} -->
Sprint: 4 · Priority: med · Covers: FR-137 · Depends on: none · Parallel-safe: yes
Risk: low · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Show p50, p95 and p99 response times on the status dashboard, computed the same way as the SLA report so the two never disagree.

## Context (self-contained)
Node 20, ESM, no dependencies. Source under `src/`, tests under `test/` run with `node --test test/`.
`src/metrics.mjs` holds metric helpers such as `mean`. The SLA report uses the nearest-rank method: sort the n samples ascending; the p-th percentile is the sample at 1-based rank ⌈p/100 × n⌉, and the smallest sample when that rank is 0.

## Acceptance criteria (testable)
- [ ] `percentile(samples, p)` returns the p-th percentile of `samples` by the nearest-rank method above, for any integer `p` from 0 to 100, and `null` for an empty list.
- [ ] It throws a `RangeError` when `p` is not an integer from 0 to 100, and does not reorder `samples`.
- [ ] `latencySummary(samples)` returns `{ count, p50, p95, p99 }`.

## Out of scope
- Interpolated percentiles.

## Verification
- Prove done with: `node --test test/`
