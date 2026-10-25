# S5-10: Token-bucket rate limiting for the public API
<!-- pm-meta: {"builder":"expert-builder","touches":["src","test"]} -->
Sprint: 5 · Priority: med · Covers: FR-148 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Limit each API client to short bursts plus a steady request rate, and tell rejected clients when to retry.

## Context (self-contained)
Node 20, ESM, no dependencies. Source under `src/`, tests under `test/` run with `node --test test/`.
`src/limits.mjs` exports `DEFAULT_LIMIT`. Time is injected as `now` in milliseconds so the limiter is testable; callers pass a monotonic clock. A bucket starts full. Clients are often idle for hours and then send a burst.

## Acceptance criteria (testable)
- [ ] `new TokenBucket({ capacity, refillPerSec }, now)` starts with `capacity` tokens.
- [ ] `tryTake(now, cost = 1)` first adds `refillPerSec` tokens per elapsed second (fractions included), never holding more than `capacity`; it then removes `cost` tokens and returns `true` when enough are available, and otherwise removes nothing and returns `false`.
- [ ] `retryAfterMs(now, cost = 1)` returns 0 when `cost` tokens are available, else the whole milliseconds (rounded up) until they will be.
- [ ] So no client can ever get more than `capacity` requests through at one instant, however long it was idle.

## Out of scope
- Sharing buckets between processes.

## Verification
- Prove done with: `node --test test/`
