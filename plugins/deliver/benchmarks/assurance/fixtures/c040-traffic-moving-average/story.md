# S6-8: Moving average for traffic charts
<!-- pm-meta: {"builder":"expert-builder","touches":["src","test"]} -->
Sprint: 6 · Priority: med · Covers: FR-139 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer, performance-reviewer · Specs: none

## Goal
Smooth the request-rate charts with a moving average computed on the server.

## Context (self-contained)
Node 20, ESM, no dependencies. Source under `src/`, tests under `test/` run with `node --test test/`.
`src/series.mjs` holds time-series helpers. Series are arrays of integer request counts, one per second, up to 1,000,000 points; users pick windows up to 10,000 points. The endpoint must answer within a request, so the work must grow linearly with the series length, whatever the window.

## Acceptance criteria (testable)
- [ ] `movingAverage(series, window)` returns an array whose element `i` is the mean of `series[i]` through `series[i + window - 1]`, so it has `series.length - window + 1` elements, or none when the series is shorter than the window.
- [ ] It throws a `RangeError` unless `window` is a positive integer.
- [ ] It reads each element of `series` a constant number of times, independent of `window`.

## Out of scope
- Weighted and exponential averages.

## Verification
- Prove done with: `node --test test/`
