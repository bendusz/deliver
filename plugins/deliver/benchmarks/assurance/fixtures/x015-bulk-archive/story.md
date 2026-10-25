# S1-15: Preview and apply bulk document archival
<!-- pm-meta: {"builder":"codex-builder","touches":["src","test"]} -->
Sprint: 1 · Priority: med · Covers: FR-015 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Preview and apply bulk document archival.

## Context (self-contained)
Node 20 or later, ESM, no dependencies. `src/feature.mjs` contains the domain helpers. Tests live in `test/`.
Records are mutable objects with unique string id and boolean archived. Ids is an array of requested ids; unknown ids are ignored.

## Acceptance criteria (testable)
- [ ] `archive(records, ids, options)` returns the ids of newly selected records in record order, with each id once.
- [ ] With dryRun true, return the same selection without changing records. Otherwise set archived on selected records only.

## Out of scope
- Inputs and integrations outside the contracts above.

## Verification
- Prove done with: `node --test test/*.test.mjs`

## Verification evidence

## Execution
