# S3-2: Split shared trip expenses evenly
<!-- pm-meta: {"builder":"expert-builder","touches":["src","test"]} -->
Sprint: 3 · Priority: med · Covers: FR-106 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Let a group split a shared expense evenly, with every cent accounted for so balances always settle to zero.

## Context (self-contained)
Node 20, ESM, no dependencies. Source under `src/`, tests under `test/` run with `node --test test/`.
`src/expenses.mjs` holds expense helpers. Amounts are integer cents. When an amount does not divide evenly, the leftover cents go one each to the first people in the list.

## Acceptance criteria (testable)
- [ ] `splitEvenly(amountCents, people)` returns `people` integer shares that add up to exactly `amountCents`.
- [ ] Shares differ by at most one cent, and the first `amountCents % people` people carry the extra cent.
- [ ] It throws a `RangeError` when `amountCents` is not a non-negative integer or `people` is not a positive integer.
- [ ] Tests in `test/` cover each criterion above.

## Out of scope
- Uneven splits by weight or percentage.

## Verification
- Prove done with: `node --test test/`
