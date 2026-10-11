# S2-4: Health endpoint
<!-- pm-meta: {"builder":"expert-builder","touches":["src","test"]} -->
Sprint: 1 · Priority: med · Covers: FR-001 · Depends on: none · Parallel-safe: no
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Add a health handler and prove the deployed latency.

## Context (self-contained)
Node 20, ESM, no dependencies. Source under `src/`, tests under `test/` run with `node --test`.
Handlers return `{ status, body }`. The `db` object exposes `query(sql, params)` returning rows.

## Acceptance criteria (testable)
- [ ] `health()` returns `{ status: 200, body: { ok: true } }`.
- [ ] In the staging deployment, `GET /health` answers in under 200 ms at the 95th percentile over 1,000 requests.

## Out of scope
- Anything not named above.

## Verification
- Prove done with: `node --test`
