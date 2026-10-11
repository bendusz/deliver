# S1-2: Paginate the task list
<!-- pm-meta: {"builder":"expert-builder","touches":["src","test"]} -->
Sprint: 1 · Priority: med · Covers: FR-001 · Depends on: none · Parallel-safe: no
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Return the task list one page at a time.

## Context (self-contained)
Node 20, ESM, no dependencies. Source under `src/`, tests under `test/` run with `node --test`.
Handlers return `{ status, body }`. The `db` object exposes `query(sql, params)` returning rows.

## Acceptance criteria (testable)
- [ ] `page(items, n, size)` returns page `n` (1-based) of `size` items.
- [ ] `pageCount(items, size)` returns the number of pages needed to show every item.

## Out of scope
- Anything not named above.

## Verification
- Prove done with: `node --test`
