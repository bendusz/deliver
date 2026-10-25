# S1-7: Compare numeric release versions
<!-- pm-meta: {"builder":"codex-builder","touches":["src","test"]} -->
Sprint: 1 · Priority: med · Covers: FR-007 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Compare numeric release versions.

## Context (self-contained)
Node 20 or later, ESM, no dependencies. `src/feature.mjs` contains the domain helpers. Tests live in `test/`.
Versions contain exactly three decimal integer components in 0..999, with no suffixes.

## Acceptance criteria (testable)
- [ ] `compareVersions(a, b)` returns -1, 0, or 1 by numeric major, minor, then patch order.
- [ ] Equal versions compare as zero, regardless of decimal padding.

## Out of scope
- Inputs and integrations outside the contracts above.

## Verification
- Prove done with: `node --test test/*.test.mjs`

## Verification evidence

## Execution
