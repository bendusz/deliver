# S1-48: Distinguish missing sensor readings from zero
<!-- pm-meta: {"builder":"codex-builder","touches":["src","test"]} -->
Sprint: 1 · Priority: med · Covers: FR-048 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Distinguish missing sensor readings from zero.

## Context (self-contained)
Node 20 or later, ESM, no dependencies. `src/feature.mjs` contains the domain helpers. Tests live in `test/`.
Value is either the empty string or a valid finite decimal number string with no whitespace. Zero and negative readings are valid.

## Acceptance criteria (testable)
- [ ] `parseMetric(value)` returns null only for the empty string.
- [ ] All numeric strings return their numeric value, including zero and negative values.

## Out of scope
- Inputs and integrations outside the contracts above.

## Verification
- Prove done with: `node --test test/*.test.mjs`

## Verification evidence

## Execution
