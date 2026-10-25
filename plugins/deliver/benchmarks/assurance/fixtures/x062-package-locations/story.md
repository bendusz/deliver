# S1-62: Search package locations without hiding read failures
<!-- pm-meta: {"builder":"codex-builder","touches":["src","test"]} -->
Sprint: 1 · Priority: med · Covers: FR-062 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Search package locations without hiding read failures.

## Context (self-contained)
Node 20 or later, ESM, no dependencies. `src/feature.mjs` contains the domain helpers. Tests live in `test/`.
Paths is an ordered list of candidate strings. Read is an injected async adapter returning any content or rejecting with an Error code.

## Acceptance criteria (testable)
- [ ] `readPackage(paths, read)` returns the first successful content and tries the next location only for ENOENT.
- [ ] Propagate other errors unchanged without attempting later paths. If no location exists, reject with AggregateError listing missing-file errors in attempt order, including an empty list for no candidates.

## Out of scope
- Inputs and integrations outside the contracts above.

## Verification
- Prove done with: `node --test test/*.test.mjs`

## Verification evidence

## Execution
