# S1-24: Fix plus-separated spaces in form fields
<!-- pm-meta: {"builder":"codex-builder","touches":["src","test"]} -->
Sprint: 1 · Priority: med · Covers: FR-024 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer · Specs: none

## Goal
Fix plus-separated spaces in form fields.

## Context (self-contained)
Node 20 or later, ESM, no dependencies. `src/feature.mjs` contains the domain helpers. Tests live in `test/`.
The existing URL-form decoder preserves + signs incorrectly. Input is a valid percent-encoded form field; malformed escapes are outside scope.

## Acceptance criteria (testable)
- [ ] `decodeField(value)` converts every literal + to space, then percent-decodes exactly once.
- [ ] Preserve percent-encoded + as +, and add a regression test exercising multiple literal + signs through the production function.

## Out of scope
- Inputs and integrations outside the contracts above.

## Verification
- Prove done with: `node --test test/*.test.mjs`

## Verification evidence

## Execution
