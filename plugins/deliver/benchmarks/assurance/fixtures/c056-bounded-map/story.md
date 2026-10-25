# S2-12: Bounded-concurrency map for background jobs
<!-- pm-meta: {"builder":"expert-builder","touches":["src","test"]} -->
Sprint: 2 · Priority: med · Covers: FR-155 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Let background jobs process a list of items through an async function without opening more than a fixed number of connections at once.

## Context (self-contained)
Node 20, ESM, no dependencies. Source under `src/`, tests under `test/` run with `node --test test/`.
`src/tasks.mjs` holds helpers for background work. Callers use the results positionally (result `i` belongs to item `i`), and the async function's calls finish in any order.

## Acceptance criteria (testable)
- [ ] `mapLimit(items, limit, fn)` calls `fn(item, index)` once for every item and never has more than `limit` calls in flight.
- [ ] It resolves to an array whose element `i` is the result for `items[i]`, whatever order the calls finish in; an empty list resolves to `[]`.
- [ ] It rejects with the first error a call rejects with, and rejects with a `RangeError` when `limit` is not a positive integer.

## Out of scope
- Cancelling calls that are still in flight after a rejection.

## Verification
- Prove done with: `node --test test/`
