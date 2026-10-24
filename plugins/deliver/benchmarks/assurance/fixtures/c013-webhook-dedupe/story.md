# S4-3: Drop duplicate webhook deliveries
<!-- pm-meta: {"builder":"expert-builder","touches":["src","test"]} -->
Sprint: 4 · Priority: med · Covers: FR-112 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer, performance-reviewer · Specs: none

## Goal
Ignore webhook deliveries the payment provider retries within a few minutes, without letting the dedupe state grow without bound.

## Context (self-contained)
Node 20, ESM, no dependencies. Source under `src/`, tests under `test/` run with `node --test test/`.
`src/webhooks.mjs` holds webhook helpers. Every delivery carries an id; the provider retries a delivery for up to five minutes. The receiver handles millions of distinct ids per hour in one long-lived process, so the dedupe state must only hold ids still inside the window. Calls arrive with non-decreasing `now` (milliseconds).

## Acceptance criteria (testable)
- [ ] `createDeduper(windowMs)` returns `{ seen(id, now), size }`.
- [ ] `seen(id, now)` returns `true` when `id` was first recorded less than `windowMs` before `now`; otherwise it records `id` at `now` and returns `false`.
- [ ] `size` is the number of ids held, and never exceeds the number of distinct ids recorded within the last `windowMs`.

## Out of scope
- Sharing state between processes.

## Verification
- Prove done with: `node --test test/`
