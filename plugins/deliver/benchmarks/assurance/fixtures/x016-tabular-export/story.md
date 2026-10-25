# S1-16: Export a configured table to CSV
<!-- pm-meta: {"builder":"codex-builder","touches":["src","test"]} -->
Sprint: 1 · Priority: med · Covers: FR-016 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Export a configured table to CSV.

## Context (self-contained)
Node 20 or later, ESM, no dependencies. `src/feature.mjs` contains the domain helpers. Tests live in `test/`.
Rows have string values for every configured column. Columns are unique nonempty field names. Neither names nor values contain comma, quote, CR, or LF.

## Acceptance criteria (testable)
- [ ] `exportRows(rows, columns, options)` uses columns in the specified order and joins records with LF, without appending a record terminator.
- [ ] Include a header by default, and omit it when header is false. Zero rows with a header emits just the header.

## Out of scope
- Inputs and integrations outside the contracts above.

## Verification
- Prove done with: `node --test test/*.test.mjs`

## Verification evidence

## Execution
