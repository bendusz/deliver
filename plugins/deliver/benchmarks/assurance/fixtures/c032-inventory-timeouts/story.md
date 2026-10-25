# S3-7: Time out slow inventory-service calls
<!-- pm-meta: {"builder":"expert-builder","touches":["src","test"]} -->
Sprint: 3 · Priority: med · Covers: FR-131 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Fail inventory-service calls that take too long instead of letting the storefront hang.

## Context (self-contained)
Node 20, ESM, no dependencies. Source under `src/`, tests under `test/` run with `node --test test/`.
`src/remote.mjs` exports `TimeoutError` (code `ETIMEDOUT`). The storefront makes thousands of these calls a minute, and most settle within milliseconds, many by rejecting (unknown SKU). A timer left pending after its call has settled keeps the closure alive until it fires, which showed up as memory growth in the last incident. Timers are injectable so tests stay deterministic.

## Acceptance criteria (testable)
- [ ] `withTimeout(promise, ms, timers = globalThis)` resolves or rejects as `promise` does when it settles within `ms` milliseconds.
- [ ] Otherwise it rejects with a `TimeoutError` after `ms`, scheduled with `timers.setTimeout`.
- [ ] As soon as `promise` settles, fulfilled or rejected, the timer is cancelled with `timers.clearTimeout`.

## Out of scope
- Aborting the underlying request.

## Verification
- Prove done with: `node --test test/`
