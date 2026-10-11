# S2-6: Slugify a title
<!-- pm-meta: {"builder":"expert-builder","touches":["src","test"]} -->
Sprint: 1 · Priority: med · Covers: FR-001 · Depends on: none · Parallel-safe: no
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Turn a task title into a URL slug.

## Context (self-contained)
Node 20, ESM, no dependencies. Source under `src/`, tests under `test/` run with `node --test`.
Handlers return `{ status, body }`. The `db` object exposes `query(sql, params)` returning rows.

## Acceptance criteria (testable)
- [ ] `slug("Buy Milk!")` returns `"buy-milk"`.
- [ ] `slug("  ")` returns `""`.

## Out of scope
- Anything not named above.

## Verification
- Prove done with: `node --test`
