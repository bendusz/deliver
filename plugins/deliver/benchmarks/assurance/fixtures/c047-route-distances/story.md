# S3-10: Memoize route distance lookups
<!-- pm-meta: {"builder":"expert-builder","touches":["src","test"]} -->
Sprint: 3 · Priority: med · Covers: FR-146 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer, performance-reviewer · Specs: none

## Goal
Cut the dispatch planner's CPU time by caching distance computations, which it repeats for the same stops many times per plan.

## Context (self-contained)
Node 20, ESM, no dependencies. Source under `src/`, tests under `test/` run with `node --test test/`.
`src/geo.mjs` exports `distanceKm(a, b)` for points `{ lat, lng }`. The planner builds a fresh point object for each stop every time it evaluates a route, so equal points are usually different objects. It also memoizes single-argument helpers such as `geohash(point)` and `nearestDepot(point)`.

## Acceptance criteria (testable)
- [ ] `memoize(fn, { max = 1000 })` returns a function that returns `fn(...args)` for its arguments.
- [ ] Calls whose arguments are equal by JSON value (`JSON.stringify` of the argument list) call `fn` only once while the result is cached, whatever the number of arguments and whether they are the same objects.
- [ ] At most `max` results are kept; adding one more evicts the oldest.

## Out of scope
- Time-based expiry.

## Verification
- Prove done with: `node --test test/`
