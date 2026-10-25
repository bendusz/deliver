# S1-22: Fix quoting of CSV text cells
<!-- pm-meta: {"builder":"codex-builder","touches":["src","test"]} -->
Sprint: 1 · Priority: med · Covers: FR-022 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Fix quoting of CSV text cells.

## Context (self-contained)
Node 20 or later, ESM, no dependencies. `src/feature.mjs` contains the domain helpers. Tests live in `test/`.
csvCell takes a string. Existing comma-only handling corrupts values containing quotes and line breaks.

## Acceptance criteria (testable)
- [ ] Quote a cell containing comma, CR, LF, or double quote, and double every embedded double quote.
- [ ] Return other strings, including empty, unchanged. Add regression coverage for a quote-containing cell.

## Out of scope
- Inputs and integrations outside the contracts above.

## Verification
- Prove done with: `node --test test/*.test.mjs`

## Verification evidence

## Execution
