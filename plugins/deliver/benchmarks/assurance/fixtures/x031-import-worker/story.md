# S1-31: Serialize imports through a single worker
<!-- pm-meta: {"builder":"codex-builder","touches":["src","test"]} -->
Sprint: 1 · Priority: med · Covers: FR-031 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Serialize imports through a single worker.

## Context (self-contained)
Node 20 or later, ESM, no dependencies. `src/feature.mjs` contains the domain helpers. Tests live in `test/`.
Work functions return promises and may reject. Tasks can be submitted before earlier work completes.

## Acceptance criteria (testable)
- [ ] `createWorker()` returns submit(work). Start work in submission order only after the preceding promise settles.
- [ ] Each submission resolves or rejects with its own work result, and one failure must not block later tasks.

## Out of scope
- Inputs and integrations outside the contracts above.

## Verification
- Prove done with: `node --test test/*.test.mjs`

## Verification evidence

## Execution
