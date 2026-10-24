# S5-11: Retries and a dead-letter list for background jobs
<!-- pm-meta: {"builder":"expert-builder","touches":["src","test"]} -->
Sprint: 5 · Priority: med · Covers: FR-153 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Retry failing background jobs a bounded number of times and keep the ones that never succeed where an operator can inspect and replay them.

## Context (self-contained)
Node 20, ESM, no dependencies. Source under `src/`, tests under `test/` run with `node --test test/`.
`src/queue.mjs` exports `JobQueue`, with `push`, `shift`, `length`, and a `dead` array for jobs that exhausted their retries. Jobs are `{ id, type, payload, attempts }`. Handlers are async functions keyed by job type. The ops dashboard lists `queue.dead` with each job's last error and offers a replay button.

## Acceptance criteria (testable)
- [ ] `runOnce(queue, handlers, { maxAttempts = 5 })` takes the next job and awaits `handlers[job.type](job.payload)`, resolving `'done'` on success and `'idle'` when the queue is empty.
- [ ] A job whose handler throws or rejects, or that has no handler, goes back on the queue with `attempts` increased by one and resolves `'retry'`.
- [ ] When that failure brings `attempts` to `maxAttempts`, the job is not re-queued but appended to `queue.dead` with its `attempts` and an `error` field holding the failure's message, and `runOnce` resolves `'dead'`.

## Out of scope
- Backoff between attempts.

## Verification
- Prove done with: `node --test test/`
