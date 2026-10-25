# S1-14: Check session validity before protected requests
<!-- pm-meta: {"builder":"codex-builder","touches":["src","test"]} -->
Sprint: 1 · Priority: med · Covers: FR-014 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Check session validity before protected requests.

## Context (self-contained)
Node 20 or later, ESM, no dependencies. `src/feature.mjs` contains the domain helpers. Tests live in `test/`.
Sessions have expiresAt as integer epoch milliseconds and revokedAt as null or an integer. Now is passed explicitly, including zero.

## Acceptance criteria (testable)
- [ ] `sessionActive(session, now)` returns true exactly when revokedAt is null and now is strictly before expiresAt.
- [ ] A revocation at epoch zero counts as revoked, and expiry is exclusive.

## Out of scope
- Inputs and integrations outside the contracts above.

## Verification
- Prove done with: `node --test test/*.test.mjs`

## Verification evidence

## Execution
