# S1-1: Paginate the task list
<!-- pm-meta: {"builder":"expert-builder","touches":["src","test"]} -->
Sprint: 1 · Priority: med · Covers: FR-001 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Let callers show the task list one page at a time.

## Context (self-contained)
Node 20, ESM, no dependencies. Source under `src/`, tests under `test/` run with `node --test test/`.
`src/list.mjs` holds the list helpers. Pages are 1-based.

## Acceptance criteria (testable)
- [ ] `pageCount(total, size)` returns the number of pages needed to show `total` items at `size` per page, and 0 when `total` is 0.
- [ ] `pageCount` throws a `RangeError` when `size` is not a positive integer.
- [ ] `pageOf(items, page, size)` returns the items on page `page`, including a last page that is not full, and `[]` for any page past the last.

## Out of scope
- Anything not named above.

## Verification
- Prove done with: `node --test test/`
