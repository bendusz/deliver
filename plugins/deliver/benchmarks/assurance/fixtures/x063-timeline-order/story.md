# S1-63: Order timeline entries by absolute timestamp
<!-- pm-meta: {"builder":"codex-builder","touches":["src","test"]} -->
Sprint: 1 · Priority: med · Covers: FR-063 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Order timeline entries by absolute timestamp.

## Context (self-contained)
Node 20 or later, ESM, no dependencies. `src/feature.mjs` contains the domain helpers. Tests live in `test/`.
Entries have valid ISO 8601 timestamp strings with explicit Z or numeric offsets, in years 2000..2099. Different strings can represent the same instant.

## Acceptance criteria (testable)
- [ ] `orderTimeline(entries)` returns a new array sorted by absolute instant ascending, preserving original order for equal instants.
- [ ] Preserve entry identities and the caller array. Support differing offsets, empty input, and single entries.

## Out of scope
- Inputs and integrations outside the contracts above.

## Verification
- Prove done with: `node --test test/*.test.mjs`

## Verification evidence

## Execution
