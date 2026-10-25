# S1-35: Compute running ledger balances in one pass
<!-- pm-meta: {"builder":"codex-builder","touches":["src","test"]} -->
Sprint: 1 · Priority: med · Covers: FR-035 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Compute running ledger balances in one pass.

## Context (self-contained)
Node 20 or later, ESM, no dependencies. `src/feature.mjs` contains the domain helpers. Tests live in `test/`.
Transactions are ordered records with integer amount in cents. There are at most 100000 rows and all running sums stay within safe integers.

## Acceptance criteria (testable)
- [ ] `runningBalances(transactions)` returns the sum through each row, with zero as the opening balance.
- [ ] Use O(n) work and O(n) result storage; do not recompute prefixes. Empty input returns an empty array.

## Out of scope
- Inputs and integrations outside the contracts above.

## Verification
- Prove done with: `node --test test/*.test.mjs`

## Verification evidence

## Execution
