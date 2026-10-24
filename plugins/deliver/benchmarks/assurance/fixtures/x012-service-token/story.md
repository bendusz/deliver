# S1-12: Verify service bearer tokens
<!-- pm-meta: {"builder":"codex-builder","touches":["src","test"]} -->
Sprint: 1 · Priority: med · Covers: FR-012 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Verify service bearer tokens.

## Context (self-contained)
Node 20 or later, ESM, no dependencies. `src/feature.mjs` contains the domain helpers. Tests live in `test/`.
Expected is a nonempty UTF-8 token string from configuration; supplied is any UTF-8 string. Comparison must not throw on length mismatch.

## Acceptance criteria (testable)
- [ ] `verifyToken(expected, supplied)` returns true only for byte-for-byte equality.
- [ ] Use timingSafeEqual on equal-length byte sequences; reject all other lengths.

## Out of scope
- Inputs and integrations outside the contracts above.

## Verification
- Prove done with: `node --test test/*.test.mjs`

## Verification evidence

## Execution
