# S4-1: Cache exchange rates
<!-- pm-meta: {"builder":"expert-builder","touches":["src","test"]} -->
Sprint: 4 · Priority: med · Covers: FR-102 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer, performance-reviewer · Specs: none

## Goal
Stop the checkout from calling the exchange-rate provider on every request, which is slow and billed per call.

## Context (self-contained)
Node 20, ESM, no dependencies. Source under `src/`, tests under `test/` run with `node --test test/`.
`src/exchange.mjs` exports `SUPPORTED`. `fetchRates(base)` is the provider client: it returns a promise of a rates object and takes about a second. At peak the checkout issues dozens of concurrent lookups for the same base currency. Time is injected with `now()` (milliseconds) so the cache is testable.

## Acceptance criteria (testable)
- [ ] `createRateCache(fetchRates, { ttlMs = 60000, now = Date.now })` returns `{ get(base) }`, where `get` resolves to `fetchRates(base)`'s result.
- [ ] Results are reused for `ttlMs` after the fetch started; after that the next `get` fetches again.
- [ ] Concurrent `get` calls for the same base while a fetch is in flight share that one fetch instead of starting their own.
- [ ] A failed fetch rejects the calls waiting on it and is not cached: the next `get` fetches again.

## Out of scope
- Persisting rates across restarts.

## Verification
- Prove done with: `node --test test/`
