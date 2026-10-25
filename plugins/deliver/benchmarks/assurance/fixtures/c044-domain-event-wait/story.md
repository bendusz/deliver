# S5-9: Await the next domain event
<!-- pm-meta: {"builder":"expert-builder","touches":["src","test"]} -->
Sprint: 5 · Priority: med · Covers: FR-143 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Let integration code wait for the next occurrence of a domain event (for example `invoice.paid`) with a deadline, without leaking listeners on the long-lived event bus.

## Context (self-contained)
Node 20, ESM, no dependencies. Source under `src/`, tests under `test/` run with `node --test test/`.
`src/events.mjs` exports the app's `bus`, a Node `EventEmitter` that lives for the whole process; leaked listeners trigger `MaxListenersExceededWarning` within hours. Timers are injectable so tests stay deterministic. `name` is never `'error'`.

## Acceptance criteria (testable)
- [ ] `waitForEvent(emitter, name, { timeoutMs = 10000, timers = globalThis })` resolves with the first argument of the next `name` event.
- [ ] It rejects with the error when the emitter emits `'error'` first, and with an error whose `code` is `ETIMEDOUT` when neither happens within `timeoutMs`.
- [ ] Whichever happens first, it removes both of its listeners and cancels its timer with `timers.clearTimeout`.

## Out of scope
- Waiting for several events at once.

## Verification
- Prove done with: `node --test test/`
