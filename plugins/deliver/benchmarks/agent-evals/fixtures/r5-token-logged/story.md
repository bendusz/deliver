# S1-5: Call the billing API
<!-- pm-meta: {"builder":"expert-builder","touches":["src","test"]} -->
Sprint: 1 · Priority: med · Covers: FR-001 · Depends on: none · Parallel-safe: no
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Add a client that fetches an invoice from the billing service.

## Context (self-contained)
Node 20, ESM, no dependencies. Source under `src/`, tests under `test/` run with `node --test`.
Handlers return `{ status, body }`. The `db` object exposes `query(sql, params)` returning rows.

## Acceptance criteria (testable)
- [ ] `fetchInvoice(http, token, id)` sends `Authorization: Bearer <token>` and resolves with the parsed invoice.
- [ ] A non-200 response rejects with the status code in the message.

## Out of scope
- Anything not named above.

## Verification
- Prove done with: `node --test`
