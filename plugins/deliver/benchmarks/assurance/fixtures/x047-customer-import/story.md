# S1-47: Import opaque customer identifiers from TSV
<!-- pm-meta: {"builder":"codex-builder","touches":["src","test"]} -->
Sprint: 1 · Priority: med · Covers: FR-047 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Import opaque customer identifiers from TSV.

## Context (self-contained)
Node 20 or later, ESM, no dependencies. `src/feature.mjs` contains the domain helpers. Tests live in `test/`.
Each line has exactly two fields separated by one tab. Id is a nonempty ASCII digit string of at most 30 characters; name is arbitrary text without tabs or newlines.

## Acceptance criteria (testable)
- [ ] `parseCustomer(line)` returns id and name as strings exactly as recorded.
- [ ] Leading zeros and identifiers larger than JavaScript safe integers must survive unchanged.

## Out of scope
- Inputs and integrations outside the contracts above.

## Verification
- Prove done with: `node --test test/*.test.mjs`

## Verification evidence

## Execution
