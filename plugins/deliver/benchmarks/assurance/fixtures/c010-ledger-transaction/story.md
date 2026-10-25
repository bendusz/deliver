# S6-2: Transaction helper for ledger writes
<!-- pm-meta: {"builder":"expert-builder","touches":["src","test"]} -->
Sprint: 6 · Priority: med · Covers: FR-109 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Give the ledger code one helper that wraps a group of statements in a database transaction, so a failure halfway leaves no partial write and the caller learns about it.

## Context (self-contained)
Node 20, ESM, no dependencies. Source under `src/`, tests under `test/` run with `node --test test/`.
`src/db.mjs` exports `FakeDb`, a stand-in connection whose async `query(sql, params)` records every statement in `log`. Callers such as the transfer endpoint rely on the helper's promise to decide between a 200 and a 500 response.

## Acceptance criteria (testable)
- [ ] `transaction(db, work)` runs `BEGIN`, then `work(db)`, then `COMMIT`, and resolves to whatever `work` resolved to.
- [ ] When `work` throws or rejects, it runs `ROLLBACK` instead of `COMMIT` and rejects with the same error object.

## Out of scope
- Nested transactions and savepoints.

## Verification
- Prove done with: `node --test test/`
