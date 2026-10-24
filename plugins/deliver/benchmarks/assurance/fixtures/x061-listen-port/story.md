# S1-61: Validate the configured listening port
<!-- pm-meta: {"builder":"codex-builder","touches":["src","test"]} -->
Sprint: 1 · Priority: med · Covers: FR-061 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Validate the configured listening port.

## Context (self-contained)
Node 20 or later, ESM, no dependencies. `src/feature.mjs` contains the domain helpers. Tests live in `test/`.
Raw is undefined or an environment variable string. Empty or whitespace-only strings are invalid, as are signs, decimals, and nondecimal formats.

## Acceptance criteria (testable)
- [ ] `listenPort(raw)` defaults to 8080 only when raw is undefined.
- [ ] Accept a nonempty ASCII digit sequence representing 0..65535. Throw RangeError for every other string, including oversized numbers.

## Out of scope
- Inputs and integrations outside the contracts above.

## Verification
- Prove done with: `node --test test/*.test.mjs`

## Verification evidence

## Execution
