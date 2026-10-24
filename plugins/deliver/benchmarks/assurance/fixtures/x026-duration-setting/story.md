# S1-26: Reject nonnumeric duration suffixes
<!-- pm-meta: {"builder":"codex-builder","touches":["src","test"]} -->
Sprint: 1 · Priority: med · Covers: FR-026 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Reject nonnumeric duration suffixes.

## Context (self-contained)
Node 20 or later, ESM, no dependencies. `src/feature.mjs` contains the domain helpers. Tests live in `test/`.
The current duration parser accepts a numeric prefix and ignores suffixes. Input is a string of at most six ASCII characters.

## Acceptance criteria (testable)
- [ ] `parseDuration(value)` accepts only a nonempty sequence of decimal digits and returns its numeric value, including zero.
- [ ] Throw TypeError on every other string. Add an executed regression assertion for a suffix such as 15ms.

## Out of scope
- Inputs and integrations outside the contracts above.

## Verification
- Prove done with: `node --test test/*.test.mjs`

## Verification evidence

## Execution
