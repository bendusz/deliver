# S1-32: Reserve exclusive access to a document scanner
<!-- pm-meta: {"builder":"codex-builder","touches":["src","test"]} -->
Sprint: 1 · Priority: med · Covers: FR-032 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Reserve exclusive access to a document scanner.

## Context (self-contained)
Node 20 or later, ESM, no dependencies. `src/feature.mjs` contains the domain helpers. Tests live in `test/`.
Open asynchronously initializes a scanner handle and always returns a non-null value. Release is called only after a successful acquisition is done.

## Acceptance criteria (testable)
- [ ] `createLease(open)` exposes acquire and release. A pending or held lease excludes other acquisitions, which resolve to null without calling open.
- [ ] Open failure clears the reservation and propagates the same error. Release permits another acquisition.

## Out of scope
- Inputs and integrations outside the contracts above.

## Verification
- Prove done with: `node --test test/*.test.mjs`

## Verification evidence

## Execution
