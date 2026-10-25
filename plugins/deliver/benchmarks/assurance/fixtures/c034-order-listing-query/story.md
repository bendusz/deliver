# S5-7: SQL for the admin order list
<!-- pm-meta: {"builder":"expert-builder","touches":["src","test"]} -->
Sprint: 5 · Priority: med · Covers: FR-133 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer, security-auditor · Specs: none

## Goal
Build the parameterised SQL behind the admin order list, with status filters, sorting and paging.

## Context (self-contained)
Node 20, ESM, no dependencies. Source under `src/`, tests under `test/` run with `node --test test/`.
`src/sql.mjs` exports `placeholders(n, start)`, which renders `$1, $2, ...`. The query object `{ text, values }` goes straight to the Postgres driver. Every option comes from the admin UI's query string and is untrusted; `status` is either one string or an array of strings.

## Acceptance criteria (testable)
- [ ] `listOrdersQuery(options)` returns `{ text, values }` selecting `id, customer_name, status, total_cents, created_at` from `orders`.
- [ ] `status` (a string, or an array matched with `IN`; an empty array means no filter) filters by status; every status value is passed in `values` through placeholders and never appears in `text`.
- [ ] `sort` must be one of `created_at`, `total_cents`, `status`, `customer_name` (default `created_at`), else it throws; `dir` `asc` sorts ascending, anything else descending.
- [ ] `limit` is clamped to 1..200 (default 50) and `offset` to 0 or more, both passed as placeholders.

## Out of scope
- Full-text search.

## Verification
- Prove done with: `node --test test/`
