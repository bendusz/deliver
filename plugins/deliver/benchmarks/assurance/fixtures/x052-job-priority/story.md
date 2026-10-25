# S1-52: Order jobs by priority while preserving ties
<!-- pm-meta: {"builder":"codex-builder","touches":["src","test"]} -->
Sprint: 1 · Priority: med · Covers: FR-052 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Order jobs by priority while preserving ties.

## Context (self-contained)
Node 20 or later, ESM, no dependencies. `src/feature.mjs` contains the domain helpers. Tests live in `test/`.
Each job has a finite numeric priority. Higher numbers dispatch first. Equal-priority jobs must retain arrival order.

## Acceptance criteria (testable)
- [ ] `prioritize(jobs)` returns a new array sorted by descending priority, with stable ties.
- [ ] Keep original job objects and do not reorder the caller array. Empty and single-item inputs work.

## Out of scope
- Inputs and integrations outside the contracts above.

## Verification
- Prove done with: `node --test test/*.test.mjs`

## Verification evidence

## Execution
