# S1-30: Keep file readers open until consumption finishes
<!-- pm-meta: {"builder":"codex-builder","touches":["src","test"]} -->
Sprint: 1 · Priority: med · Covers: FR-030 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Keep file readers open until consumption finishes.

## Context (self-contained)
Node 20 or later, ESM, no dependencies. `src/feature.mjs` contains the domain helpers. Tests live in `test/`.
Open returns a reader promise. Consume may return a value or promise. Reader.close returns a successful promise.

## Acceptance criteria (testable)
- [ ] `withReader(open, consume)` closes the reader exactly once after consume settles, on both success and failure.
- [ ] Preserve the consume result or error. Do not close while asynchronous consumption is pending.

## Out of scope
- Inputs and integrations outside the contracts above.

## Verification
- Prove done with: `node --test test/*.test.mjs`

## Verification evidence

## Execution
