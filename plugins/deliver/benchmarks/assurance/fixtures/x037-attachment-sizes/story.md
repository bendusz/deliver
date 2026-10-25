# S1-37: Reuse attachment metadata within one request
<!-- pm-meta: {"builder":"codex-builder","touches":["src","test"]} -->
Sprint: 1 · Priority: med · Covers: FR-037 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Reuse attachment metadata within one request.

## Context (self-contained)
Node 20 or later, ESM, no dependencies. `src/feature.mjs` contains the domain helpers. Tests live in `test/`.
Paths are exact string identities. Stat is a synchronous injected adapter returning a stable nonnegative size for this request, and may be expensive.

## Acceptance criteria (testable)
- [ ] `fileSizes(paths, stat)` returns sizes in path order, preserving duplicates and zeros.
- [ ] Call stat at most once per distinct path in each invocation. Calls in later invocations must fetch fresh metadata.

## Out of scope
- Inputs and integrations outside the contracts above.

## Verification
- Prove done with: `node --test test/*.test.mjs`

## Verification evidence

## Execution
