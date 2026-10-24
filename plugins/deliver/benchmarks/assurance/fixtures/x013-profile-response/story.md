# S1-13: Expose public account profiles
<!-- pm-meta: {"builder":"codex-builder","touches":["src","test"]} -->
Sprint: 1 · Priority: med · Covers: FR-013 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Expose public account profiles.

## Context (self-contained)
Node 20 or later, ESM, no dependencies. `src/feature.mjs` contains the domain helpers. Tests live in `test/`.
Account records contain id and displayName plus optional private fields such as email, passwordHash, and future internal metadata.

## Acceptance criteria (testable)
- [ ] `publicProfile(record)` returns a new object with exactly id and displayName.
- [ ] Never expose any other key, and leave the original record intact.

## Out of scope
- Inputs and integrations outside the contracts above.

## Verification
- Prove done with: `node --test test/*.test.mjs`

## Verification evidence

## Execution
