# S1-42: Preserve update failures during transaction cleanup
<!-- pm-meta: {"builder":"codex-builder","touches":["src","test"]} -->
Sprint: 1 · Priority: med · Covers: FR-042 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Preserve update failures during transaction cleanup.

## Context (self-contained)
Node 20 or later, ESM, no dependencies. `src/feature.mjs` contains the domain helpers. Tests live in `test/`.
Write and rollback are injected async adapters. Rollback is best-effort cleanup after a failed write; its failure must not hide the initiating error.

## Acceptance criteria (testable)
- [ ] `updateTransaction(write, rollback)` returns successful writes without rollback.
- [ ] On failure await exactly one rollback attempt, then reject with the original write error even if rollback also rejects.

## Out of scope
- Inputs and integrations outside the contracts above.

## Verification
- Prove done with: `node --test test/*.test.mjs`

## Verification evidence

## Execution
