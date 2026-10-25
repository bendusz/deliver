# S2-9: Run scheduled jobs under a lock
<!-- pm-meta: {"builder":"expert-builder","touches":["src","test"]} -->
Sprint: 2 · Priority: med · Covers: FR-140 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Stop two app servers from running the same scheduled job at once.

## Context (self-contained)
Node 20, ESM, no dependencies. Source under `src/`, tests under `test/` run with `node --test test/`.
`src/locks.mjs` exports `LockManager`, an in-memory stand-in for the Redis locks with the same async `acquire(name)` (resolves `false` when the lock is held) and `release(name)`. Locks have no expiry, so a lock that is never released blocks that job on every server until someone deletes it by hand. Scheduled jobs fail regularly (upstream timeouts).

## Acceptance criteria (testable)
- [ ] `withLock(locks, name, fn)` acquires lock `name`, awaits `fn()`, and resolves to its result.
- [ ] When the lock is already held it rejects with an error whose `code` is `ELOCKED` without calling `fn`.
- [ ] The lock is released once `fn` settles, whether it resolved or rejected, and a rejection from `fn` reaches the caller unchanged.

## Out of scope
- Lock expiry and fencing tokens.

## Verification
- Prove done with: `node --test test/`
